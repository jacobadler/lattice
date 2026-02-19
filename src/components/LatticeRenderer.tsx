import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { LatticeGraph } from '../engine/latticeEngine';
import { ratioToString, ratioToDecimal } from '../engine/mathEngine';
import { Timbre, toggleTone, isPlaying, stopAll } from '../engine/audioEngine';

interface LatticeRendererProps {
  graph: LatticeGraph | null;
  fundamentalHz: number;
  timbre: Timbre;
}

const PRIME_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7',
];

function getPrimeColor(index: number): string {
  return PRIME_COLORS[index % PRIME_COLORS.length];
}

const LatticeRenderer: React.FC<LatticeRendererProps> = ({
  graph,
  fundamentalHz,
  timbre,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    ratio: string;
    decimal: string;
    coords: string;
    frequency: string;
  } | null>(null);

  // Track which nodes are currently sounding so we can style them
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());

  // Refs to keep current values accessible inside D3 callbacks
  const fundamentalRef = useRef(fundamentalHz);
  const timbreRef = useRef(timbre);
  const activeNodesRef = useRef(activeNodes);

  useEffect(() => {
    fundamentalRef.current = fundamentalHz;
  }, [fundamentalHz]);

  useEffect(() => {
    timbreRef.current = timbre;
  }, [timbre]);

  useEffect(() => {
    activeNodesRef.current = activeNodes;
  }, [activeNodes]);

  // Stop all tones when graph changes
  useEffect(() => {
    stopAll();
    setActiveNodes(new Set());
  }, [graph]);

  const render = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !graph) return;

    const svg = d3.select(svgRef.current);
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const points = graph.projectedPoints;
    if (points.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const dataWidth = maxX - minX || 1;
    const dataHeight = maxY - minY || 1;
    const padding = 80;
    const scaleX = (width - 2 * padding) / dataWidth;
    const scaleY = (height - 2 * padding) / dataHeight;
    const scale = Math.min(scaleX, scaleY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const offsetX = width / 2 - centerX * scale;
    const offsetY = height / 2 + centerY * scale;

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 20])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
        setTooltip(null);
      });

    svg.call(zoom);

    const initialTransform = d3.zoomIdentity.translate(offsetX, offsetY).scale(scale);
    svg.call(zoom.transform, initialTransform);

    // ─── Edges ──────────────────────────────────────────────────
    const edgeGroup = g.append('g').attr('class', 'edges');
    for (const edge of graph.edges) {
      const from = points[edge.from];
      const to = points[edge.to];
      edgeGroup
        .append('line')
        .attr('x1', from.x).attr('y1', -from.y)
        .attr('x2', to.x).attr('y2', -to.y)
        .attr('stroke', getPrimeColor(edge.primeIndex))
        .attr('stroke-width', 1.5 / scale)
        .attr('stroke-opacity', 0)
        .transition()
        .delay(200)
        .duration(800)
        .attr('stroke-opacity', 0.35);
    }

    // ─── Nodes ──────────────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes');

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const lp = graph.points[i];
      const isOrigin = lp.ratio.num === 1 && lp.ratio.den === 1;
      const nodeRadius = (isOrigin ? 5 : 3.5) / scale;
      const key = ratioToString(lp.ratio);

      const nodeG = nodeGroup.append('g')
        .attr('transform', `translate(${p.x}, ${-p.y})`)
        .style('cursor', 'pointer');

      // Glow ring for active nodes (initially hidden)
      const glow = nodeG
        .append('circle')
        .attr('class', `glow-${i}`)
        .attr('r', nodeRadius * 2.5)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 1.2 / scale)
        .attr('stroke-opacity', 0);

      // Node circle
      const circle = nodeG
        .append('circle')
        .attr('class', `node-${i}`)
        .attr('r', 0)
        .attr('fill', isOrigin ? '#f59e0b' : '#e2e8f0')
        .attr('stroke', isOrigin ? '#fbbf24' : '#94a3b8')
        .attr('stroke-width', (isOrigin ? 1.5 : 0.8) / scale);

      circle
        .transition()
        .delay(i * 30)
        .duration(400)
        .ease(d3.easeElasticOut.amplitude(1).period(0.5))
        .attr('r', nodeRadius);

      // Ratio label
      nodeG
        .append('text')
        .attr('dy', -8 / scale)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e2e8f0')
        .attr('font-size', `${11 / scale}px`)
        .attr('font-family', "'JetBrains Mono', 'Fira Code', monospace")
        .attr('font-weight', isOrigin ? '600' : '400')
        .text(key)
        .attr('opacity', 0)
        .transition()
        .delay(i * 30 + 200)
        .duration(300)
        .attr('opacity', 1);

      // Click to toggle audio
      nodeG.on('click', (event: MouseEvent) => {
        event.stopPropagation();
        const freq = fundamentalRef.current * ratioToDecimal(lp.ratio);
        const nowPlaying = toggleTone(key, freq, timbreRef.current);

        setActiveNodes((prev) => {
          const next = new Set(prev);
          if (nowPlaying) {
            next.add(key);
          } else {
            next.delete(key);
          }
          return next;
        });

        // Update visual state
        if (nowPlaying) {
          circle
            .transition().duration(150)
            .attr('fill', '#f59e0b')
            .attr('stroke', '#fbbf24');
          glow
            .transition().duration(200)
            .attr('stroke-opacity', 0.5);
        } else {
          circle
            .transition().duration(150)
            .attr('fill', isOrigin ? '#f59e0b' : '#e2e8f0')
            .attr('stroke', isOrigin ? '#fbbf24' : '#94a3b8');
          glow
            .transition().duration(200)
            .attr('stroke-opacity', 0);
        }
      });

      // Hover tooltip
      nodeG
        .on('mouseenter', (event: MouseEvent) => {
          const freq = fundamentalRef.current * ratioToDecimal(lp.ratio);
          if (!activeNodesRef.current.has(key)) {
            circle
              .transition().duration(150)
              .attr('r', nodeRadius * 1.5);
          }
          setTooltip({
            x: event.clientX,
            y: event.clientY,
            ratio: key,
            decimal: ratioToDecimal(lp.ratio).toFixed(6),
            coords: `(${lp.coordinates.join(', ')})`,
            frequency: `${freq.toFixed(2)} Hz`,
          });
        })
        .on('mouseleave', () => {
          if (!activeNodesRef.current.has(key)) {
            circle
              .transition().duration(150)
              .attr('r', nodeRadius);
          }
          setTooltip(null);
        });
    }
  }, [graph]);

  useEffect(() => {
    render();

    const handleResize = () => render();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  return (
    <div className="lattice-container" ref={containerRef}>
      <svg ref={svgRef} />
      {tooltip && (
        <div
          className="tooltip"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
          }}
        >
          <div className="tooltip-ratio">{tooltip.ratio}</div>
          <div className="tooltip-frequency">{tooltip.frequency}</div>
          <div className="tooltip-decimal">{tooltip.decimal}</div>
          <div className="tooltip-coords">{tooltip.coords}</div>
        </div>
      )}
      {!graph && (
        <div className="empty-state">
          <p>Enter ratios and press <strong>Enter</strong> to build</p>
          <p className="empty-hint">
            Each ratio becomes a point in a prime-dimensional lattice,<br />
            projected deterministically into 2D.
          </p>
        </div>
      )}
    </div>
  );
};

export default LatticeRenderer;
