import React, { useState } from 'react';
import { Timbre } from '../engine/audioEngine';
import { MidiDevice, NOTE_NAMES, NoteName } from '../engine/midiEngine';

interface ControlPanelProps {
  onBuild: (input: string) => void;
  error: string | null;
  fundamentalHz: number;
  onFundamentalChange: (hz: number) => void;
  timbre: Timbre;
  onTimbreChange: (t: Timbre) => void;
  midiDevices: MidiDevice[];
  selectedMidiDevice: string;
  onMidiDeviceChange: (deviceId: string) => void;
  midiRootNote: NoteName;
  midiRootOctave: number;
  onMidiRootNoteChange: (note: NoteName) => void;
  onMidiRootOctaveChange: (octave: number) => void;
}

const DEFAULT_INPUT = '9/8, 6/5, 5/4, 4/3, 3/2, 8/5, 5/3, 7/4, 11/8, 7/6';

const TIMBRES: { value: Timbre; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'pulse', label: 'Pulse' },
];

const ControlPanel: React.FC<ControlPanelProps> = ({
  onBuild,
  error,
  fundamentalHz,
  onFundamentalChange,
  timbre,
  onTimbreChange,
  midiDevices,
  selectedMidiDevice,
  onMidiDeviceChange,
  midiRootNote,
  midiRootOctave,
  onMidiRootNoteChange,
  onMidiRootOctaveChange,
}) => {
  const [input, setInput] = useState(DEFAULT_INPUT);

  const handleBuild = () => {
    onBuild(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBuild();
    }
  };

  return (
    <div className="control-panel">
      <h1 className="app-title">LATTICE</h1>
      <p className="app-subtitle">Just Intonation Tuning Lattice</p>

      <div className="input-group">
        <label htmlFor="ratios-input">Frequency Ratios</label>
        <textarea
          id="ratios-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. 9/8, 6/5, 5/4, 7/4, 11/8"
          rows={5}
          spellCheck={false}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <button className="build-button" onClick={handleBuild}>
        Build Lattice
      </button>

      <div className="input-group">
        <label htmlFor="fundamental-input">Fundamental Frequency (Hz)</label>
        <input
          id="fundamental-input"
          type="number"
          min={20}
          max={2000}
          step={1}
          value={fundamentalHz}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > 0) {
              onFundamentalChange(val);
            }
          }}
          className="frequency-input"
        />
      </div>

      <div className="input-group">
        <label htmlFor="timbre-select">Timbre</label>
        <select
          id="timbre-select"
          value={timbre}
          onChange={(e) => onTimbreChange(e.target.value as Timbre)}
          className="timbre-select"
        >
          {TIMBRES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="section-divider" />

      <div className="input-group">
        <label htmlFor="midi-device-select">MIDI Input Device</label>
        <select
          id="midi-device-select"
          value={selectedMidiDevice}
          onChange={(e) => onMidiDeviceChange(e.target.value)}
          className="timbre-select"
        >
          <option value="">None</option>
          {midiDevices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="input-group">
        <label>MIDI Root Note</label>
        <div className="root-note-row">
          <select
            value={midiRootNote}
            onChange={(e) => onMidiRootNoteChange(e.target.value as NoteName)}
            className="timbre-select root-note-select"
          >
            {NOTE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            max={9}
            value={midiRootOctave}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 0 && val <= 9) {
                onMidiRootOctaveChange(val);
              }
            }}
            className="frequency-input octave-input"
          />
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
