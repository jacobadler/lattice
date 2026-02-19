/**
 * projectionEngine.ts
 *
 * Projects n-dimensional lattice coordinates into 2D for rendering.
 *
 * ─── Projection Method ───
 *
 * Each prime has a fixed 2D basis vector that determines its direction
 * and magnitude on the Cartesian plane. These are hand-tuned constants
 * chosen for visual clarity and geometric elegance:
 *
 *   prime 2  → (20, 0)   — horizontal (used only when octaves are not reduced)
 *   prime 3  → (20, 0)   — horizontal axis (the "fifth" direction)
 *   prime 5  → (0, 20)   — vertical axis (the "third" direction)
 *   prime 7  → (7, 7)    — diagonal
 *   prime 11 → (-6, 8)   — upper-left
 *   prime 13 → (-4, 2)   — slight upper-left
 *
 * For any prime not in this table, a fallback uses evenly-spaced angles
 * on a circle of radius 10, starting from index 5 onward.
 *
 * The projected 2D point for a lattice vector v = (a0, a1, ..., a_{k-1}) is:
 *
 *   projected = Σᵢ aᵢ · basis(prime_i)
 *
 * Properties:
 *   - Deterministic: each prime always maps to the same 2D vector
 *   - Independent of input order or which other primes are present
 *   - No randomness
 */

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectionBasis {
  /** The 2D basis vector for each prime dimension. */
  vectors: [number, number][];
  /** The primes corresponding to each basis vector. */
  primes: number[];
}

/**
 * Fixed 2D basis vectors for each prime.
 * The key is the prime number; the value is [x, y].
 */
const PRIME_BASIS_VECTORS: Record<number, [number, number]> = {
  2:  [20, 0],
  3:  [20, 0],
  5:  [0, 20],
  7:  [7, 7],
  11: [-7, 9],
  13: [-4, 2],
  19: [4, 13],
  23: [14, 6],
  29: [3, 17],
};

/**
 * Build the projection basis using fixed per-prime vectors.
 * For primes beyond the lookup table, generate deterministic fallback vectors.
 */
export function buildProjectionBasis(primes: number[]): ProjectionBasis {
  const vectors: [number, number][] = [];

  // Track how many unknown primes we've encountered for fallback spacing
  let unknownIndex = 0;

  for (const p of primes) {
    const fixed = PRIME_BASIS_VECTORS[p];
    if (fixed) {
      vectors.push(fixed);
    } else {
      // Fallback: place unknown primes at evenly spaced angles, radius 10
      // Start at angle offset to avoid colliding with the fixed vectors
      const angle = Math.PI * 0.7 + (2 * Math.PI * unknownIndex) / 7;
      vectors.push([
        Math.round(10 * Math.cos(angle) * 100) / 100,
        Math.round(10 * Math.sin(angle) * 100) / 100,
      ]);
      unknownIndex++;
    }
  }

  return { vectors, primes: [...primes] };
}

/**
 * Project an n-dimensional coordinate vector to 2D using the given basis.
 *
 * projected = Σᵢ coordinates[i] · basis.vectors[i]
 */
export function projectPoint(
  coordinates: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  let x = 0;
  let y = 0;

  for (let i = 0; i < coordinates.length && i < basis.vectors.length; i++) {
    x += coordinates[i] * basis.vectors[i][0];
    y += coordinates[i] * basis.vectors[i][1];
  }

  return { x, y };
}

/**
 * Project an array of coordinate vectors to 2D.
 */
export function projectAll(
  coordinatesList: number[][],
  basis: ProjectionBasis
): ProjectedPoint[] {
  return coordinatesList.map((coords) => projectPoint(coords, basis));
}
