/**
 * latticeEngine.ts
 *
 * Constructs the edge set for the lattice graph.
 *
 * ─── Edge Construction ───
 *
 * Two lattice nodes are connected by an edge if and only if their
 * coordinate vectors differ by exactly ±1 in exactly one dimension
 * and are identical in all other dimensions. Equivalently:
 *
 *   L1_norm(v_a - v_b) = 1
 *
 * This produces the standard lattice grid structure where each edge
 * represents a single step along one prime axis.
 *
 * ─── Performance ───
 *
 * To avoid O(n²) pairwise comparisons, we use a spatial hash map:
 * for each node, we generate the 2k neighbor keys (±1 in each dimension)
 * and look them up in O(1) expected time. Total: O(n·k).
 */

import { LatticePoint } from './mathEngine';
import { ProjectedPoint } from './projectionEngine';

export interface LatticeEdge {
  /** Index of first node */
  from: number;
  /** Index of second node */
  to: number;
  /** Which prime dimension this edge traverses */
  primeIndex: number;
}

/**
 * Encode a coordinate vector as a string key for hash-based lookup.
 */
function coordKey(coords: number[]): string {
  return coords.join(',');
}

/**
 * Build the edge list for a set of lattice points.
 * Uses spatial hashing for O(n·k) performance instead of O(n²).
 *
 * An edge exists between nodes A and B iff their coordinate vectors
 * differ by exactly ±1 in exactly one component.
 */
export function buildEdges(points: LatticePoint[]): LatticeEdge[] {
  const k = points.length > 0 ? points[0].coordinates.length : 0;
  if (k === 0) return [];

  // Build hash map: coordinate string -> point index
  const coordMap = new Map<string, number>();
  for (let i = 0; i < points.length; i++) {
    coordMap.set(coordKey(points[i].coordinates), i);
  }

  const edges: LatticeEdge[] = [];
  const edgeSet = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    const coords = points[i].coordinates;

    // Check all 2k neighbors (±1 in each dimension)
    for (let dim = 0; dim < k; dim++) {
      for (const delta of [1, -1]) {
        const neighborCoords = [...coords];
        neighborCoords[dim] += delta;
        const key = coordKey(neighborCoords);
        const j = coordMap.get(key);

        if (j !== undefined && j > i) {
          // Ensure no duplicate edges
          const edgeKey = `${Math.min(i, j)}-${Math.max(i, j)}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({ from: i, to: j, primeIndex: dim });
          }
        }
      }
    }
  }

  return edges;
}

/**
 * Complete lattice data ready for rendering.
 */
export interface LatticeGraph {
  points: LatticePoint[];
  projectedPoints: ProjectedPoint[];
  edges: LatticeEdge[];
  primeBasis: number[];
}
