/**
 * audioEngine.ts
 *
 * Manages audio playback for lattice nodes using the Web Audio API.
 * Each node can be triggered independently. Multiple nodes can sound
 * simultaneously. Tones sustain for 5 seconds then decay over 3 seconds.
 * Supports sine, square, triangle, sawtooth, and pulse timbres.
 */

export type Timbre = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pulse';

interface ActiveVoice {
  oscillator: OscillatorNode;
  gain: GainNode;
  pulseShaper?: WaveShaperNode;
  /** The ratio's decimal value (num/den), used to recompute frequency. */
  ratioValue: number;
  /** Timeout ID for the auto-cleanup after decay finishes. */
  cleanupTimeout: ReturnType<typeof setTimeout>;
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

const SUSTAIN_TIME = 5;  // seconds at full volume
const DECAY_TIME = 3;    // seconds to fade to silence
const TOTAL_TIME = SUSTAIN_TIME + DECAY_TIME;

/**
 * Start playing a tone that sustains for 5s then decays over 3s.
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
  // Attack: quick fade in
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  // Sustain at 0.15 for SUSTAIN_TIME
  gain.gain.setValueAtTime(0.15, now + SUSTAIN_TIME);
  // Decay to 0 over DECAY_TIME
  gain.gain.linearRampToValueAtTime(0, now + TOTAL_TIME);
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
    osc.stop(now + TOTAL_TIME + 0.1);

    const cleanupTimeout = setTimeout(() => {
      cleanupVoice(key);
    }, (TOTAL_TIME + 0.15) * 1000);

    voice = { oscillator: osc, gain, pulseShaper: shaper, ratioValue, cleanupTimeout };
  } else {
    const osc = ctx.createOscillator();
    osc.type = timbre;
    osc.frequency.setValueAtTime(frequency, now);
    osc.connect(gain);
    osc.start();
    osc.stop(now + TOTAL_TIME + 0.1);

    const cleanupTimeout = setTimeout(() => {
      cleanupVoice(key);
    }, (TOTAL_TIME + 0.15) * 1000);

    voice = { oscillator: osc, gain, ratioValue, cleanupTimeout };
  }

  activeVoices.set(key, voice);
}

/**
 * Clean up a voice after its envelope completes naturally.
 */
function cleanupVoice(key: string): void {
  const voice = activeVoices.get(key);
  if (!voice) return;

  try {
    voice.oscillator.disconnect();
    voice.gain.disconnect();
    if (voice.pulseShaper) voice.pulseShaper.disconnect();
  } catch {
    // already disconnected
  }

  activeVoices.delete(key);
  if (onVoiceEnd) onVoiceEnd(key);
}

/**
 * Stop a tone immediately with a short fade-out.
 */
export function stopTone(key: string): void {
  const voice = activeVoices.get(key);
  if (!voice) return;

  clearTimeout(voice.cleanupTimeout);

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
