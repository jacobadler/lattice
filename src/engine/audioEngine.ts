/**
 * audioEngine.ts
 *
 * Manages sustained audio playback for lattice nodes using the Web Audio API.
 * Each node can be toggled on/off independently. Multiple nodes can sound
 * simultaneously. Supports sine, square, triangle, sawtooth, and pulse timbres.
 */

export type Timbre = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse';

interface ActiveVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  /** For pulse wave: second oscillator used in the workaround. */
  pulseShaper?: WaveShaperNode;
  constantSource?: ConstantSourceNode;
}

let audioCtx: AudioContext | null = null;

/** Map of ratio key -> active voice */
const activeVoices = new Map<string, ActiveVoice>();

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Build a pulse wave shaper curve.
 * A pulse wave is created by comparing a sawtooth to a threshold
 * via a waveshaper with a very steep step function.
 */
function createPulseWaveCurve(dutyCycle: number = 0.5): Float32Array {
  const size = 256;
  const curve = new Float32Array(size);
  const threshold = (dutyCycle - 0.5) * 2; // map [0,1] to [-1,1]
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1; // -1 to 1
    curve[i] = x < threshold ? -1 : 1;
  }
  return curve;
}

/**
 * Start playing a sustained tone for a given ratio.
 *
 * @param key - unique identifier for this voice (e.g. "3/2")
 * @param frequency - the actual frequency in Hz
 * @param timbre - waveform type
 */
export function startTone(key: string, frequency: number, timbre: Timbre): void {
  if (activeVoices.has(key)) return; // already playing

  const ctx = getAudioContext();

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
  gain.connect(ctx.destination);

  if (timbre === 'pulse') {
    // Pulse wave via sawtooth + waveshaper
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    const shaper = ctx.createWaveShaper();
    shaper.curve = createPulseWaveCurve(0.25);
    shaper.oversample = 'none';

    osc.connect(shaper);
    shaper.connect(gain);
    osc.start();

    activeVoices.set(key, { oscillator: osc, gain, pulseShaper: shaper });
  } else {
    const osc = ctx.createOscillator();
    osc.type = timbre;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.connect(gain);
    osc.start();

    activeVoices.set(key, { oscillator: osc, gain });
  }
}

/**
 * Stop a sustained tone with a short fade-out.
 */
export function stopTone(key: string): void {
  const voice = activeVoices.get(key);
  if (!voice) return;

  const ctx = getAudioContext();
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
 * Toggle a tone on/off. Returns true if now playing, false if stopped.
 */
export function toggleTone(
  key: string,
  frequency: number,
  timbre: Timbre
): boolean {
  if (activeVoices.has(key)) {
    stopTone(key);
    return false;
  } else {
    startTone(key, frequency, timbre);
    return true;
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
