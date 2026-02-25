/**
 * audioEngine.ts
 *
 * Manages audio playback for lattice nodes using the Web Audio API.
 * Each node can be triggered independently. Multiple nodes can sound
 * simultaneously. Tones sustain continuously until explicitly stopped.
 * Supports sine, square, triangle, sawtooth, pulse, warm, reed, and bright timbres.
 */

export type Timbre = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse'
  | 'warm' | 'reed' | 'bright';

interface ActiveVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  pulseShaper?: WaveShaperNode;
  /** The ratio's decimal value (num/den), used to recompute frequency. */
  ratioValue: number;
}

let audioCtx: AudioContext | null = null;

/** Map of ratio key -> active voice */
const activeVoices = new Map<string, ActiveVoice>();

/** Callback invoked when a voice finishes its decay and is removed. */
let onVoiceEnd: ((key: string) => void) | null = null;

export function setOnVoiceEnd(cb: (key: string) => void): void {
  onVoiceEnd = cb;
}

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function createPulseWaveCurve(dutyCycle: number = 0.5): Float32Array {
  const size = 256;
  const curve = new Float32Array(size);
  const threshold = (dutyCycle - 0.5) * 2;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = x < threshold ? -1 : 1;
  }
  return curve;
}

/**
 * Build a PeriodicWave for custom timbres with specific harmonic profiles.
 */
function buildPeriodicWave(ctx: AudioContext, harmonics: number[]): PeriodicWave {
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  real[0] = 0;
  imag[0] = 0;
  for (let i = 0; i < harmonics.length; i++) {
    real[i + 1] = 0;
    imag[i + 1] = harmonics[i];
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/**
 * Start playing a tone that sustains continuously until stopped.
 * If the key is already playing, the existing tone is stopped first.
 */
export function startTone(key: string, frequency: number, timbre: Timbre, ratioValue: number): void {
  // If already playing, stop the old one first
  if (activeVoices.has(key)) {
    stopTone(key);
  }

  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const gain = ctx.createGain();
  // Attack: quick fade in, then sustain indefinitely
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  gain.connect(ctx.destination);

  let voice: ActiveVoice;

  if (timbre === 'pulse') {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, now);

    const shaper = ctx.createWaveShaper();
    shaper.curve = createPulseWaveCurve(0.25);
    shaper.oversample = 'none';

    osc.connect(shaper);
    shaper.connect(gain);
    osc.start();

    voice = { oscillator: osc, gain, pulseShaper: shaper, ratioValue };
  } else if (timbre === 'warm' || timbre === 'reed' || timbre === 'bright') {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(frequency, now);

    // Warm: strong fundamental + gentle odd harmonics (mellow, clarinet-like)
    // Reed: prominent odd and even harmonics with gradual rolloff (oboe-like)
    // Bright: rich harmonic series with moderate rolloff (brass-like)
    const harmonicSets: Record<string, number[]> = {
      warm:   [1, 0, 0.3, 0, 0.1, 0, 0.03],
      reed:   [1, 0.5, 0.35, 0.25, 0.15, 0.1, 0.06, 0.03],
      bright: [1, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1, 0.07, 0.04, 0.02],
    };

    const wave = buildPeriodicWave(ctx, harmonicSets[timbre]);
    osc.setPeriodicWave(wave);

    osc.connect(gain);
    osc.start();

    voice = { oscillator: osc, gain, ratioValue };
  } else {
    const osc = ctx.createOscillator();
    osc.type = timbre;
    osc.frequency.setValueAtTime(frequency, now);
    osc.connect(gain);
    osc.start();

    voice = { oscillator: osc, gain, ratioValue };
  }

  activeVoices.set(key, voice);
}

/**
 * Stop a tone immediately with a short fade-out.
 */
export function stopTone(key: string): void {
  const voice = activeVoices.get(key);
  if (!voice) return;

  const ctx = getAudioContext();
  // Cancel any scheduled envelope changes and fade out quickly
  voice.gain.gain.cancelScheduledValues(ctx.currentTime);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, ctx.currentTime);
  voice.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);

  setTimeout(() => {
    try {
      voice.oscillator.stop();
      voice.oscillator.disconnect();
      voice.gain.disconnect();
      if (voice.pulseShaper) voice.pulseShaper.disconnect();
    } catch {
      // already stopped
    }
  }, 100);

  activeVoices.delete(key);
}

/**
 * Check if a tone is currently active.
 */
export function isPlaying(key: string): boolean {
  return activeVoices.has(key);
}

/**
 * Trigger a tone: if not playing, start it; if already playing, restart it.
 * Returns true (always starts playing).
 */
export function triggerTone(
  key: string,
  frequency: number,
  timbre: Timbre,
  ratioValue: number
): void {
  startTone(key, frequency, timbre, ratioValue);
}

/**
 * Update all currently playing voices to a new fundamental frequency and/or timbre.
 * Recreates each oscillator seamlessly.
 */
export function updateAllVoices(fundamentalHz: number, timbre: Timbre): void {
  const entries = Array.from(activeVoices.entries());
  for (const [key, voice] of entries) {
    const newFreq = fundamentalHz * voice.ratioValue;
    // Stop old voice and start a fresh one with remaining envelope
    // For simplicity, restart the full envelope with new params
    stopTone(key);
    startTone(key, newFreq, timbre, voice.ratioValue);
  }
}

/**
 * Stop all currently playing tones.
 */
export function stopAll(): void {
  const keys = Array.from(activeVoices.keys());
  for (const key of keys) {
    stopTone(key);
  }
}
