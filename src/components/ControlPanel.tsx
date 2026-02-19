import React, { useState } from 'react';
import { Timbre } from '../engine/audioEngine';

interface ControlPanelProps {
  onBuild: (input: string) => void;
  error: string | null;
  fundamentalHz: number;
  onFundamentalChange: (hz: number) => void;
  timbre: Timbre;
  onTimbreChange: (t: Timbre) => void;
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
    </div>
  );
};

export default ControlPanel;
