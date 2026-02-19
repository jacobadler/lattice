import React, { useState, useCallback } from 'react';
import ControlPanel from './components/ControlPanel';
import LatticeRenderer from './components/LatticeRenderer';
import { parseRatios, computeLattice } from './engine/mathEngine';
import { buildProjectionBasis, projectAll } from './engine/projectionEngine';
import { buildEdges, LatticeGraph } from './engine/latticeEngine';
import { Timbre, stopAll } from './engine/audioEngine';
import './App.css';

function App() {
  const [graph, setGraph] = useState<LatticeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fundamentalHz, setFundamentalHz] = useState(100);
  const [timbre, setTimbre] = useState<Timbre>('sine');

  const handleBuild = useCallback((input: string) => {
    setError(null);
    stopAll(); // stop any playing tones when rebuilding

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

      setGraph({ points, projectedPoints, edges, primeBasis });
    } catch (e: any) {
      setError(e.message || 'Unknown error');
      setGraph(null);
    }
  }, []);

  return (
    <div className="app">
      <ControlPanel
        onBuild={handleBuild}
        error={error}
        fundamentalHz={fundamentalHz}
        onFundamentalChange={setFundamentalHz}
        timbre={timbre}
        onTimbreChange={setTimbre}
      />
      <LatticeRenderer
        graph={graph}
        fundamentalHz={fundamentalHz}
        timbre={timbre}
      />
    </div>
  );
}

export default App;
