import React, { useState, useCallback, useEffect, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import LatticeRenderer from './components/LatticeRenderer';
import { parseRatios, computeLattice, ratioToDecimal, ratioToString } from './engine/mathEngine';
import { buildProjectionBasis, projectAll } from './engine/projectionEngine';
import { buildEdges, LatticeGraph } from './engine/latticeEngine';
import { Timbre, stopAll, updateAllVoices, startTone, stopTone } from './engine/audioEngine';
import {
  MidiDevice, NoteName,
  initMidi, connectToDevice, disconnectMidi,
  setNoteOnCallback, setNoteOffCallback, setDevicesChangedCallback,
  buildTuningTable, noteNameToMidi,
} from './engine/midiEngine';
import './App.css';

function App() {
  const [graph, setGraph] = useState<LatticeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundamentalHz, setFundamentalHz] = useState(150);
  const [timbre, setTimbre] = useState<Timbre>('square');

  // MIDI state
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState('');
  const [midiRootNote, setMidiRootNote] = useState<NoteName>('C');
  const [midiRootOctave, setMidiRootOctave] = useState(4);
  const [midiActiveKeys, setMidiActiveKeys] = useState<Set<string>>(new Set());

  // Refs for values accessed inside MIDI callbacks
  const tuningTableRef = useRef<number[]>(new Array(128).fill(0));
  const ratioValuesRef = useRef<number[]>([1]);
  const timbreRef = useRef<Timbre>(timbre);
  const graphRef = useRef<LatticeGraph | null>(null);
  const fundamentalRef = useRef(fundamentalHz);
  const midiRootNoteRef = useRef<NoteName>(midiRootNote);
  const midiRootOctaveRef = useRef(midiRootOctave);

  // Reference count for how many MIDI notes map to each ratio key (for visuals)
  const midiRatioCountRef = useRef<Map<string, number>>(new Map());

  useEffect(() => { timbreRef.current = timbre; }, [timbre]);
  useEffect(() => { graphRef.current = graph; }, [graph]);
  useEffect(() => { fundamentalRef.current = fundamentalHz; }, [fundamentalHz]);
  useEffect(() => { midiRootNoteRef.current = midiRootNote; }, [midiRootNote]);
  useEffect(() => { midiRootOctaveRef.current = midiRootOctave; }, [midiRootOctave]);

  // Rebuild tuning table whenever ratios, fundamental, or root note change
  useEffect(() => {
    const baseMidi = noteNameToMidi(midiRootNote, midiRootOctave);
    tuningTableRef.current = buildTuningTable(
      ratioValuesRef.current,
      fundamentalHz,
      baseMidi
    );
  }, [fundamentalHz, midiRootNote, midiRootOctave]);

  // When fundamental or timbre changes, immediately update all playing voices
  useEffect(() => {
    updateAllVoices(fundamentalHz, timbre);
  }, [fundamentalHz, timbre]);

  /**
   * Given a MIDI note number, compute the ratio key (matching the lattice node label)
   * by finding which scale degree the note maps to.
   */
  const getRatioKeyForMidiNote = useCallback((midiNote: number): string => {
    const scaleSize = ratioValuesRef.current.length;
    if (scaleSize === 0) return `midi-${midiNote}`;

    const rootMidi = noteNameToMidi(midiRootNoteRef.current, midiRootOctaveRef.current);
    const offset = midiNote - rootMidi;
    let remainder = offset % scaleSize;
    if (remainder < 0) remainder += scaleSize;

    const g = graphRef.current;
    if (g && remainder >= 0 && remainder < g.points.length) {
      return ratioToString(g.points[remainder].ratio);
    }
    return `midi-${midiNote}`;
  }, []);

  // Initialize MIDI on mount
  useEffect(() => {
    initMidi().then((devices) => {
      setMidiDevices(devices);
    });

    setDevicesChangedCallback((devices) => {
      setMidiDevices(devices);
    });

    setNoteOnCallback((midiNote: number, _velocity: number) => {
      const freq = tuningTableRef.current[midiNote];
      if (freq <= 0) return;

      // Use unique audio key per MIDI note so octave duplicates don't interfere
      const audioKey = `midi-${midiNote}`;
      const ratioKey = getRatioKeyForMidiNote(midiNote);
      const rootMidi = noteNameToMidi(midiRootNoteRef.current, midiRootOctaveRef.current);
      const rootFreq = tuningTableRef.current[rootMidi];
      const ratioValue = rootFreq > 0 ? freq / rootFreq : 1;

      startTone(audioKey, freq, timbreRef.current, ratioValue);

      // Reference-count visual activations so the node stays lit
      // while ANY MIDI note maps to this ratio
      const count = (midiRatioCountRef.current.get(ratioKey) || 0) + 1;
      midiRatioCountRef.current.set(ratioKey, count);
      setMidiActiveKeys((prev) => {
        const next = new Set(prev);
        next.add(ratioKey);
        return next;
      });
    });

    setNoteOffCallback((midiNote: number) => {
      const audioKey = `midi-${midiNote}`;
      const ratioKey = getRatioKeyForMidiNote(midiNote);
      stopTone(audioKey);

      const count = (midiRatioCountRef.current.get(ratioKey) || 1) - 1;
      if (count <= 0) {
        midiRatioCountRef.current.delete(ratioKey);
        setMidiActiveKeys((prev) => {
          const next = new Set(prev);
          next.delete(ratioKey);
          return next;
        });
      } else {
        midiRatioCountRef.current.set(ratioKey, count);
      }
    });
  }, [getRatioKeyForMidiNote]);

  // Connect/disconnect MIDI device
  useEffect(() => {
    if (selectedMidiDevice) {
      connectToDevice(selectedMidiDevice);
    } else {
      disconnectMidi();
    }
  }, [selectedMidiDevice]);

  const handleBuild = useCallback((input: string) => {
    setError(null);
    stopAll();

    try {
      const ratios = parseRatios(input);
      if (ratios.length === 0) {
        setError('No ratios provided.');
        return;
      }

      const { primeBasis, points } = computeLattice(ratios, true);
      const basis = buildProjectionBasis(primeBasis);
      const projectedPoints = projectAll(
        points.map((p) => p.coordinates),
        basis
      );
      const edges = buildEdges(points);

      // Update ratio values for tuning table (sorted ascending from computeLattice)
      ratioValuesRef.current = points.map((p) => ratioToDecimal(p.ratio));

      setGraph({ points, projectedPoints, edges, primeBasis });

      // Rebuild tuning table with new ratios
      const baseMidi = noteNameToMidi(midiRootNote, midiRootOctave);
      tuningTableRef.current = buildTuningTable(
        ratioValuesRef.current,
        fundamentalHz,
        baseMidi
      );
    } catch (e: any) {
      setError(e.message || 'Unknown error');
      setGraph(null);
    }
  }, [fundamentalHz, midiRootNote, midiRootOctave]);

  return (
    <div className="app">
      <ControlPanel
        onBuild={handleBuild}
        error={error}
        fundamentalHz={fundamentalHz}
        onFundamentalChange={setFundamentalHz}
        timbre={timbre}
        onTimbreChange={setTimbre}
        midiDevices={midiDevices}
        selectedMidiDevice={selectedMidiDevice}
        onMidiDeviceChange={setSelectedMidiDevice}
        midiRootNote={midiRootNote}
        midiRootOctave={midiRootOctave}
        onMidiRootNoteChange={setMidiRootNote}
        onMidiRootOctaveChange={setMidiRootOctave}
      />
      <LatticeRenderer
        graph={graph}
        fundamentalHz={fundamentalHz}
        timbre={timbre}
        midiActiveKeys={midiActiveKeys}
      />
    </div>
  );
}

export default App;
