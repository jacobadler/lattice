/**
 * midiEngine.ts
 *
 * Handles Web MIDI API device detection and MIDI message parsing.
 * Builds a 128-entry tuning table that maps MIDI note numbers to frequencies
 * based on the user's just-intonation scale ratios.
 *
 * Design (inspired by Scale Workshop):
 *   1. Request MIDI access and enumerate input devices
 *   2. Build a tuning table from sorted ratios + fundamental + base note
 *   3. On note-on, look up the frequency and trigger the audio engine
 *   4. On note-off, stop the corresponding tone
 */

export interface MidiDevice {
  id: string;
  name: string;
}

// ─── Note names ─────────────────────────────────────────────────────────────

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export type NoteName = typeof NOTE_NAMES[number];

/**
 * Convert a note name + octave to a MIDI note number.
 * C4 = 60, A4 = 69, etc.
 */
export function noteNameToMidi(name: NoteName, octave: number): number {
  const index = NOTE_NAMES.indexOf(name);
  return (octave + 1) * 12 + index;
}

/**
 * Convert a MIDI note number to "NoteName + Octave" string.
 */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

// ─── Tuning table ───────────────────────────────────────────────────────────

/**
 * Build a 128-entry frequency lookup table.
 *
 * The scale ratios (sorted ascending, including 1/1) define one "period."
 * The period interval is 2 (one octave). Ratios are in [1, 2).
 * The fundamental frequency is placed at baseMidiNote.
 *
 * For any MIDI note n:
 *   offset = n - baseMidiNote
 *   scaleSize = ratios.length
 *   quotient  = floor(offset / scaleSize) → which octave
 *   remainder = offset mod scaleSize      → which scale degree
 *   freq = fundamental * ratios[remainder] * 2^quotient
 */
export function buildTuningTable(
  ratioValues: number[],
  fundamentalHz: number,
  baseMidiNote: number
): number[] {
  const table: number[] = new Array(128).fill(0);
  const scaleSize = ratioValues.length;

  if (scaleSize === 0) return table;

  for (let i = 0; i < 128; i++) {
    const offset = i - baseMidiNote;
    const quotient = Math.floor(offset / scaleSize);
    let remainder = offset % scaleSize;
    if (remainder < 0) remainder += scaleSize;

    const periodMultiplier = Math.pow(2, quotient);
    table[i] = fundamentalHz * ratioValues[remainder] * periodMultiplier;
  }

  return table;
}

// ─── MIDI access ────────────────────────────────────────────────────────────

let midiAccess: any = null;
let currentInput: any = null;
let noteOnCb: ((midiNote: number, velocity: number) => void) | null = null;
let noteOffCb: ((midiNote: number) => void) | null = null;
let devicesChangedCb: ((devices: MidiDevice[]) => void) | null = null;

/**
 * Initialize the Web MIDI API. Returns the list of available input devices.
 */
export async function initMidi(): Promise<MidiDevice[]> {
  if (!(navigator as any).requestMIDIAccess) {
    console.warn('Web MIDI API not supported in this browser.');
    return [];
  }

  try {
    midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });

    // Listen for hot-plug events
    midiAccess.onstatechange = () => {
      if (devicesChangedCb) {
        devicesChangedCb(getInputDevices());
      }
    };

    return getInputDevices();
  } catch (err) {
    console.warn('MIDI access denied:', err);
    return [];
  }
}

/**
 * Get the current list of MIDI input devices.
 */
export function getInputDevices(): MidiDevice[] {
  if (!midiAccess) return [];

  const devices: MidiDevice[] = [];
  midiAccess.inputs.forEach((input: any) => {
    if (input.state === 'connected') {
      devices.push({
        id: input.id,
        name: input.name || `MIDI Input ${input.id}`,
      });
    }
  });
  return devices;
}

/**
 * Connect to a specific MIDI input device by ID.
 */
export function connectToDevice(deviceId: string): void {
  // Disconnect previous
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }

  if (!midiAccess || deviceId === '') return;

  const input = midiAccess.inputs.get(deviceId);
  if (!input) return;

  currentInput = input;
  currentInput.onmidimessage = handleMidiMessage;
}

/**
 * Disconnect the current MIDI input.
 */
export function disconnectMidi(): void {
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }
}

/**
 * Parse incoming MIDI messages and dispatch note on/off events.
 */
function handleMidiMessage(event: any): void {
  const data = event.data;
  if (!data || data.length < 2) return;

  const status = data[0] & 0xf0;
  const note = data[1];
  const velocity = data.length > 2 ? data[2] : 0;

  if (status === 0x90 && velocity > 0) {
    // Note On
    if (noteOnCb) noteOnCb(note, velocity);
  } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    // Note Off (or note-on with velocity 0)
    if (noteOffCb) noteOffCb(note);
  }
}

// ─── Callbacks ──────────────────────────────────────────────────────────────

export function setNoteOnCallback(cb: (midiNote: number, velocity: number) => void): void {
  noteOnCb = cb;
}

export function setNoteOffCallback(cb: (midiNote: number) => void): void {
  noteOffCb = cb;
}

export function setDevicesChangedCallback(cb: (devices: MidiDevice[]) => void): void {
  devicesChangedCb = cb;
}
