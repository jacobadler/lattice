/**
 * projectionEngine.ts
 *
 * Multi-layer harmonic manifold embeddings for ℤⁿ prime-exponent lattices.
 *
 * Each embedding decomposes the lattice structure along different invariant
 * subspaces: pitch direction, residual harmonic structure, inter-prime
 * coupling, complexity scalar fields, and graph connectivity.
 */

// ─── Core types ──────────────────────────────────────────────────────────────

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface ProjectionBasis {
  vectors: [number, number][];
  primes: number[];
}

export type EmbeddingType =
  | 'vanilla'
  | 'log-affine'
  | 'interaction-tensor'
  | 'flow-lines'
  | 'harmonic-curvature'
  | 'dual-space'
  | 'simplex-collapse'
  | 'spectral'
  | 'projective-ratio'
  | 'phase-space';

export const EMBEDDING_OPTIONS: { value: EmbeddingType; label: string }[] = [
  { value: 'vanilla',            label: 'Vanilla Lattice' },
  { value: 'log-affine',         label: 'Log-Affine Decomposition' },
  { value: 'interaction-tensor', label: 'Prime Interaction Tensor' },
  { value: 'flow-lines',         label: 'Multiplicative Flow Lines' },
  { value: 'harmonic-curvature', label: 'Harmonic Curvature' },
  { value: 'dual-space',         label: 'Dual-Space Blend' },
  { value: 'simplex-collapse',   label: 'Harmonic Simplex Collapse' },
  { value: 'spectral',           label: 'Spectral Graph Embedding' },
  { value: 'projective-ratio',   label: 'Projective Ratio Geometry' },
  { value: 'phase-space',        label: 'Harmonic Phase Space' },
];

// ─── Scaffold types ──────────────────────────────────────────────────────────

export interface ScaffoldLine {
  x1: number; y1: number; x2: number; y2: number;
}

export interface ScaffoldCircle {
  cx: number; cy: number; r: number;
}

export interface ScaffoldPolygon {
  points: [number, number][];
}

export interface ScaffoldPath {
  d: string;
}

export interface Scaffold {
  lines: ScaffoldLine[];
  circles: ScaffoldCircle[];
  polygons: ScaffoldPolygon[];
  paths: ScaffoldPath[];
}

export interface EdgePathData {
  paths: Map<string, string>;
}

interface Edge { from: number; to: number; primeIndex: number; }

const EMPTY_SCAFFOLD: Scaffold = { lines: [], circles: [], polygons: [], paths: [] };

// ─── Shared utilities ────────────────────────────────────────────────────────

function simplexBasis(k: number, scale: number): [number, number][] {
  const raw: [number, number][] = [];
  let cx = 0, cy = 0;
  for (let i = 0; i < k; i++) {
    const theta = (2 * Math.PI * i) / k;
    raw.push([Math.cos(theta), Math.sin(theta)]);
    cx += raw[i][0]; cy += raw[i][1];
  }
  cx /= k; cy /= k;
  return raw.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale]);
}

function projectLinear(coords: number[], bv: [number, number][]): ProjectedPoint {
  let x = 0, y = 0;
  for (let i = 0; i < coords.length && i < bv.length; i++) {
    x += coords[i] * bv[i][0];
    y += coords[i] * bv[i][1];
  }
  return { x, y };
}

/** Log-pitch vector L = (log₂p₁, ..., log₂pₖ) */
function logPitchVector(primes: number[]): number[] {
  return primes.map((p) => Math.log2(p));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i] * b[i];
  return s;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

/**
 * Jacobi eigendecomposition for symmetric matrix.
 * Returns eigenvalues and eigenvectors (columns of V).
 */
function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length;
  if (n === 0) return { values: [], vectors: [] };
  if (n === 1) return { values: [matrix[0][0]], vectors: [[1]] };

  const A = matrix.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  const maxIter = 100 * n;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxOff = 0, p = 0, q = 1;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(A[i][j]) > maxOff) { maxOff = Math.abs(A[i][j]); p = i; q = j; }

    if (maxOff < 1e-12) break;

    const diff = A[q][q] - A[p][p];
    let t: number;
    if (Math.abs(A[p][q]) < 1e-15 * Math.abs(diff)) {
      t = A[p][q] / diff;
    } else {
      const phi = diff / (2 * A[p][q]);
      t = 1 / (Math.abs(phi) + Math.sqrt(phi * phi + 1));
      if (phi < 0) t = -t;
    }

    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const tau = s / (1 + c);
    const apq = A[p][q];

    A[p][q] = 0; A[q][p] = 0;
    A[p][p] -= t * apq;
    A[q][q] += t * apq;

    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue;
      const aip = A[i][p], aiq = A[i][q];
      A[i][p] = A[p][i] = aip - s * (aiq + tau * aip);
      A[i][q] = A[q][i] = aiq + s * (aip - tau * aiq);
    }

    for (let i = 0; i < n; i++) {
      const vip = V[i][p], viq = V[i][q];
      V[i][p] = vip - s * (viq + tau * vip);
      V[i][q] = viq + s * (vip - tau * viq);
    }
  }

  return {
    values: Array.from({ length: n }, (_, i) => A[i][i]),
    vectors: V,
  };
}

// ─── Vanilla (original) projection ──────────────────────────────────────────

const PRIME_BASIS_VECTORS: Record<number, [number, number]> = {
  2: [20, 0], 3: [20, 0], 5: [0, 20], 7: [7, 7],
  11: [-7, 9], 13: [-4, 2], 19: [4, 13], 23: [14, 6], 29: [3, 17],
};

export function buildProjectionBasis(primes: number[]): ProjectionBasis {
  const vectors: [number, number][] = [];
  let unknownIndex = 0;
  for (const p of primes) {
    const fixed = PRIME_BASIS_VECTORS[p];
    if (fixed) { vectors.push(fixed); }
    else {
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

function projectPointVanilla(coords: number[], basis: ProjectionBasis): ProjectedPoint {
  return projectLinear(coords, basis.vectors);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 1: Log-Affine Decomposition + Orthogonal Residual
// ═══════════════════════════════════════════════════════════════════════════════

function projectAllLogAffine(
  coordsList: number[][],
  basis: ProjectionBasis
): ProjectedPoint[] {
  const k = basis.primes.length;
  if (k === 0 || coordsList.length === 0) return coordsList.map(() => ({ x: 0, y: 0 }));

  const L = logPitchVector(basis.primes);
  const LdotL = dot(L, L);
  if (LdotL < 1e-12) return coordsList.map(() => ({ x: 0, y: 0 }));

  // Step 1: compute pitch scalar and residual for each point
  const alphas: number[] = [];
  const residuals: number[][] = [];

  for (const v of coordsList) {
    const alpha = dot(v, L) / LdotL;
    alphas.push(alpha);
    const res = v.map((vi, i) => vi - alpha * (i < L.length ? L[i] : 0));
    residuals.push(res);
  }

  // Step 2: PCA of residuals to find best 1D projection
  // Compute mean
  const mean = new Array(k).fill(0);
  for (const r of residuals) for (let i = 0; i < k; i++) mean[i] += (r[i] || 0);
  for (let i = 0; i < k; i++) mean[i] /= residuals.length;

  // Covariance matrix (k × k)
  const cov: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const r of residuals) {
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++)
        cov[i][j] += ((r[i] || 0) - mean[i]) * ((r[j] || 0) - mean[j]);
  }
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++)
      cov[i][j] /= residuals.length;

  // Eigendecomposition
  const eigen = jacobiEigen(cov);

  // Find largest eigenvalue index
  let maxEigIdx = 0;
  for (let i = 1; i < eigen.values.length; i++)
    if (eigen.values[i] > eigen.values[maxEigIdx]) maxEigIdx = i;

  // First principal component direction
  const pc1 = eigen.vectors.map((row) => row[maxEigIdx]);
  const pc1Norm = norm(pc1);

  // Step 3: Project
  const scaleX = 22;
  const scaleY = pc1Norm > 1e-10 ? 18 : 0;

  return coordsList.map((_, idx) => {
    const x = alphas[idx] * scaleX;
    let y = 0;
    if (scaleY > 0) {
      const centered = residuals[idx].map((ri, i) => (ri || 0) - mean[i]);
      y = dot(centered, pc1) / pc1Norm * scaleY;
    }
    return { x, y };
  });
}

function scaffoldLogAffine(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const L = logPitchVector(basis.primes);
  const LdotL = dot(L, L);
  const lines: ScaffoldLine[] = [];
  const circles: ScaffoldCircle[] = [];

  if (LdotL < 1e-12) return EMPTY_SCAFFOLD;

  // Compute alpha range
  let minA = Infinity, maxA = -Infinity;
  for (const v of coordsList) {
    const a = dot(v, L) / LdotL;
    minA = Math.min(minA, a); maxA = Math.max(maxA, a);
  }
  const pad = (maxA - minA) * 0.3 + 1;
  const scaleX = 22;

  // Pitch axis (horizontal)
  lines.push({
    x1: (minA - pad) * scaleX, y1: 0,
    x2: (maxA + pad) * scaleX, y2: 0,
  });

  // Vertical grid lines at integer pitch values
  for (let a = Math.floor(minA - 1); a <= Math.ceil(maxA + 1); a++) {
    lines.push({ x1: a * scaleX, y1: -80, x2: a * scaleX, y2: 80 });
  }

  // Residual magnitude contours (horizontal bands)
  for (let r = 1; r <= 4; r++) {
    lines.push({ x1: (minA - pad) * scaleX, y1: r * 18, x2: (maxA + pad) * scaleX, y2: r * 18 });
    lines.push({ x1: (minA - pad) * scaleX, y1: -r * 18, x2: (maxA + pad) * scaleX, y2: -r * 18 });
  }

  return { lines, circles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 2: Prime Interaction Tensor Field
// ═══════════════════════════════════════════════════════════════════════════════

function projectPointInteractionTensor(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);

  // x = pitch = Σ aᵢ log(pᵢ)
  let pitch = 0;
  for (let i = 0; i < coords.length && i < k; i++) pitch += coords[i] * L[i];

  // y = interaction energy E = Σᵢ<ⱼ aᵢ aⱼ log(pᵢ pⱼ)
  let E = 0;
  for (let i = 0; i < coords.length && i < k; i++)
    for (let j = i + 1; j < coords.length && j < k; j++)
      E += coords[i] * coords[j] * (L[i] + L[j]);

  return { x: pitch * 8, y: E * 5 };
}

function scaffoldInteractionTensor(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);
  const lines: ScaffoldLine[] = [];

  // Compute ranges
  let minP = Infinity, maxP = -Infinity, minE = Infinity, maxE = -Infinity;
  for (const v of coordsList) {
    let pitch = 0, E = 0;
    for (let i = 0; i < v.length && i < k; i++) pitch += v[i] * L[i];
    for (let i = 0; i < v.length && i < k; i++)
      for (let j = i + 1; j < v.length && j < k; j++)
        E += v[i] * v[j] * (L[i] + L[j]);
    minP = Math.min(minP, pitch); maxP = Math.max(maxP, pitch);
    minE = Math.min(minE, E); maxE = Math.max(maxE, E);
  }

  const padP = (maxP - minP) * 0.3 + 2;
  const padE = (maxE - minE) * 0.3 + 2;

  // Pitch axis
  lines.push({ x1: (minP - padP) * 8, y1: 0, x2: (maxP + padP) * 8, y2: 0 });

  // Zero-interaction line (E=0)
  lines.push({ x1: (minP - padP) * 8, y1: 0, x2: (maxP + padP) * 8, y2: 0 });

  // Constant-E contour lines (horizontal)
  for (let e = Math.floor(minE - 1); e <= Math.ceil(maxE + 1); e++) {
    if (e === 0) continue;
    lines.push({
      x1: (minP - padP) * 8, y1: e * 5,
      x2: (maxP + padP) * 8, y2: e * 5,
    });
  }

  // Vertical pitch grid
  for (let p = Math.floor(minP - 1); p <= Math.ceil(maxP + 1); p++) {
    lines.push({
      x1: p * 8, y1: (minE - padE) * 5,
      x2: p * 8, y2: (maxE + padE) * 5,
    });
  }

  return { lines, circles: [], polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 3: Multiplicative Flow Lines
// ═══════════════════════════════════════════════════════════════════════════════
// Node positions: vanilla. Scaffold: prime multiplication flow streamlines.

function scaffoldFlowLines(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const lines: ScaffoldLine[] = [];

  // Compute vanilla projections for all nodes
  const pts = coordsList.map((c) => projectPointVanilla(c, basis));

  // For each prime dimension, draw flow streamlines through each node
  for (let dim = 0; dim < k; dim++) {
    const bv = basis.vectors[dim];
    if (!bv) continue;

    // Draw flow lines through each node, extending ±3 steps
    const steps = 3;
    for (const pt of pts) {
      lines.push({
        x1: pt.x - bv[0] * steps, y1: pt.y - bv[1] * steps,
        x2: pt.x + bv[0] * steps, y2: pt.y + bv[1] * steps,
      });
    }
  }

  return { lines, circles: [], polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 4: Harmonic Curvature Embedding
// ═══════════════════════════════════════════════════════════════════════════════

function projectPointHarmonicCurvature(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;
  const bv = simplexBasis(k, 18);
  const L = logPitchVector(basis.primes);

  // Base position (symmetric circular)
  const base = projectLinear(coords, bv);
  const r = Math.sqrt(base.x * base.x + base.y * base.y);
  if (r < 1e-10) return { x: 0, y: 0 };

  // Curvature K = Tenney height = Σ |aᵢ| log(pᵢ)
  let K = 0;
  for (let i = 0; i < coords.length && i < k; i++) K += Math.abs(coords[i]) * L[i];

  // Curvature-induced compression: r' = r / (1 + β·K)
  const beta = 0.12;
  const rPrime = r / (1 + beta * K);
  const scale = rPrime / r;

  return { x: base.x * scale, y: base.y * scale };
}

function scaffoldHarmonicCurvature(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);
  const bv = simplexBasis(k, 18);
  const circles: ScaffoldCircle[] = [];
  const lines: ScaffoldLine[] = [];

  // Curvature contour circles: K = const
  // At a base radius r, after compression: r' = r / (1 + β·K)
  // For constant K, the contour in projected space is a circle of radius
  // that depends on both r and K. Draw circles for fixed K values
  // at their compressed radius.
  const beta = 0.12;
  const avgBasisMag = bv.reduce((s, v) => s + Math.sqrt(v[0] * v[0] + v[1] * v[1]), 0) / k;

  for (let kVal = 0; kVal <= 8; kVal++) {
    for (let shell = 1; shell <= 3; shell++) {
      const baseR = avgBasisMag * shell;
      const compR = baseR / (1 + beta * kVal);
      circles.push({ cx: 0, cy: 0, r: compR });
    }
  }

  // Deduplicate very close circles
  const uniqueCircles: ScaffoldCircle[] = [];
  const seen = new Set<number>();
  for (const c of circles) {
    const rounded = Math.round(c.r * 10);
    if (!seen.has(rounded) && c.r > 1) {
      seen.add(rounded);
      uniqueCircles.push(c);
    }
  }

  // Radial lines through each basis direction
  const maxR = avgBasisMag * 4;
  for (let i = 0; i < k; i++) {
    const mag = Math.sqrt(bv[i][0] * bv[i][0] + bv[i][1] * bv[i][1]);
    if (mag < 0.01) continue;
    const ux = bv[i][0] / mag, uy = bv[i][1] / mag;
    lines.push({ x1: -ux * maxR, y1: -uy * maxR, x2: ux * maxR, y2: uy * maxR });
  }

  return { lines, circles: uniqueCircles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 5: Dual-Space Embedding
// ═══════════════════════════════════════════════════════════════════════════════

const DUAL_LAMBDA = 0.7;

function projectPointDualSpace(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);

  // P_A: symmetric simplex
  const bv = simplexBasis(k, 18);
  const pA = projectLinear(coords, bv);

  // P_B: log-frequency pitch axis (1D → stretched along x)
  let pitch = 0;
  for (let i = 0; i < coords.length && i < k; i++) pitch += coords[i] * L[i];
  const pB = { x: pitch * 12, y: 0 };

  // Blend: P = λ·P_A + (1-λ)·P_B
  return {
    x: DUAL_LAMBDA * pA.x + (1 - DUAL_LAMBDA) * pB.x,
    y: DUAL_LAMBDA * pA.y + (1 - DUAL_LAMBDA) * pB.y,
  };
}

function scaffoldDualSpace(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);
  const bv = simplexBasis(k, 18);
  const lines: ScaffoldLine[] = [];
  const circles: ScaffoldCircle[] = [];

  // Faint simplex axes (P_A contribution)
  const maxR = 60;
  for (let i = 0; i < k; i++) {
    const mag = Math.sqrt(bv[i][0] * bv[i][0] + bv[i][1] * bv[i][1]);
    if (mag < 0.01) continue;
    const ux = bv[i][0] / mag * DUAL_LAMBDA;
    const uy = bv[i][1] / mag * DUAL_LAMBDA;
    lines.push({ x1: -ux * maxR, y1: -uy * maxR, x2: ux * maxR, y2: uy * maxR });
  }

  // Pitch axis (P_B contribution) — horizontal
  const pitchExtent = 80;
  lines.push({ x1: -pitchExtent, y1: 0, x2: pitchExtent, y2: 0 });

  // Simplex norm circles (scaled by λ)
  const avgMag = bv.reduce((s, v) => s + Math.sqrt(v[0] * v[0] + v[1] * v[1]), 0) / k;
  for (let shell = 1; shell <= 4; shell++) {
    circles.push({ cx: 0, cy: 0, r: avgMag * shell * DUAL_LAMBDA });
  }

  return { lines, circles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 6: Harmonic Simplex Collapse
// ═══════════════════════════════════════════════════════════════════════════════

function projectPointSimplexCollapse(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;

  // Total exponent magnitude (complexity)
  let totalMag = 0;
  for (let i = 0; i < coords.length && i < k; i++) totalMag += Math.abs(coords[i]);

  if (totalMag < 1e-10) return { x: 0, y: 0 }; // origin

  // Barycentric weights
  const w = coords.map((a) => Math.abs(a) / totalMag);

  // Angular position from barycentric coordinates
  let cx = 0, cy = 0;
  for (let i = 0; i < w.length && i < k; i++) {
    const theta = (2 * Math.PI * i) / k;
    cx += w[i] * Math.cos(theta);
    cy += w[i] * Math.sin(theta);
  }

  // Apply sign information: flip direction based on net sign per prime
  let signFactor = 0;
  for (let i = 0; i < coords.length && i < k; i++) {
    const theta = (2 * Math.PI * i) / k + Math.PI;
    if (coords[i] < 0) {
      signFactor += (Math.abs(coords[i]) / totalMag) * 0.5;
      cx += (Math.abs(coords[i]) / totalMag) * 0.3 * Math.cos(theta);
      cy += (Math.abs(coords[i]) / totalMag) * 0.3 * Math.sin(theta);
    }
  }

  // Radial distance = total magnitude
  const scale = 14;
  return { x: cx * totalMag * scale, y: cy * totalMag * scale };
}

function scaffoldSimplexCollapse(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const lines: ScaffoldLine[] = [];
  const circles: ScaffoldCircle[] = [];
  const scale = 14;

  // Radial lines to each prime vertex direction
  const maxMag = coordsList.reduce((m, c) => {
    let s = 0; for (const v of c) s += Math.abs(v); return Math.max(m, s);
  }, 0);
  const rayLen = (maxMag + 2) * scale;

  for (let i = 0; i < k; i++) {
    const theta = (2 * Math.PI * i) / k;
    lines.push({
      x1: 0, y1: 0,
      x2: Math.cos(theta) * rayLen, y2: Math.sin(theta) * rayLen,
    });
  }

  // Concentric circles for constant total magnitude
  for (let mag = 1; mag <= maxMag + 1; mag++) {
    circles.push({ cx: 0, cy: 0, r: mag * scale * 0.5 });
  }

  // Barycentric grid: for k primes, draw arcs connecting adjacent prime directions
  // at each magnitude level
  for (let mag = 1; mag <= maxMag + 1; mag++) {
    const pts: [number, number][] = [];
    for (let i = 0; i < k; i++) {
      const theta = (2 * Math.PI * i) / k;
      pts.push([Math.cos(theta) * mag * scale * 0.5, Math.sin(theta) * mag * scale * 0.5]);
    }
    // Connect adjacent prime directions with lines (forms a polygon)
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      lines.push({ x1: pts[i][0], y1: pts[i][1], x2: pts[j][0], y2: pts[j][1] });
    }
  }

  return { lines, circles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 7: Spectral Decomposition of Lattice Graph
// ═══════════════════════════════════════════════════════════════════════════════

function projectAllSpectral(
  coordsList: number[][],
  basis: ProjectionBasis,
  edges?: Edge[]
): ProjectedPoint[] {
  const n = coordsList.length;
  if (n < 3 || !edges || edges.length === 0) {
    // Fall back to vanilla for degenerate cases
    return coordsList.map((c) => projectPointVanilla(c, basis));
  }

  // Build graph Laplacian: L = D - A
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const edge of edges) {
    const w = Math.log2(basis.primes[edge.primeIndex] || 2); // edge weight = log(prime)
    L[edge.from][edge.from] += w;
    L[edge.to][edge.to] += w;
    L[edge.from][edge.to] -= w;
    L[edge.to][edge.from] -= w;
  }

  // Eigendecomposition
  const eigen = jacobiEigen(L);

  // Sort eigenvalues ascending, find indices
  const indexed = eigen.values.map((v, i) => ({ val: v, idx: i }));
  indexed.sort((a, b) => a.val - b.val);

  // Skip trivial eigenvalue (≈0); take 2nd and 3rd smallest
  let ev1Idx = indexed.length > 1 ? indexed[1].idx : 0;
  let ev2Idx = indexed.length > 2 ? indexed[2].idx : (indexed.length > 1 ? indexed[0].idx : 0);

  // Extract eigenvectors (columns of V)
  const x_coords = eigen.vectors.map((row) => row[ev1Idx]);
  const y_coords = eigen.vectors.map((row) => row[ev2Idx]);

  // Scale to useful pixel range
  let maxX = 0, maxY = 0;
  for (let i = 0; i < n; i++) {
    maxX = Math.max(maxX, Math.abs(x_coords[i]));
    maxY = Math.max(maxY, Math.abs(y_coords[i]));
  }
  const scaleX = maxX > 1e-10 ? 45 / maxX : 1;
  const scaleY = maxY > 1e-10 ? 45 / maxY : 1;

  return coordsList.map((_, i) => ({
    x: x_coords[i] * scaleX,
    y: y_coords[i] * scaleY,
  }));
}

function scaffoldSpectral(_basis: ProjectionBasis, _coordsList: number[][]): Scaffold {
  const lines: ScaffoldLine[] = [];
  const circles: ScaffoldCircle[] = [];

  // Axes through origin
  const extent = 60;
  lines.push({ x1: -extent, y1: 0, x2: extent, y2: 0 });
  lines.push({ x1: 0, y1: -extent, x2: 0, y2: extent });

  // Connectivity contour circles
  for (let r = 15; r <= 60; r += 15) {
    circles.push({ cx: 0, cy: 0, r });
  }

  return { lines, circles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 8: Projective Ratio Geometry
// ═══════════════════════════════════════════════════════════════════════════════

function projectPointProjectiveRatio(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);

  // log(r) = Σ aᵢ log(pᵢ)
  let logR = 0;
  for (let i = 0; i < coords.length && i < k; i++) logR += coords[i] * L[i];

  // Tenney height H = Σ |aᵢ| log(pᵢ)
  let H = 0;
  for (let i = 0; i < coords.length && i < k; i++) H += Math.abs(coords[i]) * L[i];

  const denom = 1 + H;
  const scale = 45;
  return {
    x: (logR / denom) * scale,
    y: (H / denom) * scale,
  };
}

function scaffoldProjectiveRatio(basis: ProjectionBasis, coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const L = logPitchVector(basis.primes);
  const lines: ScaffoldLine[] = [];
  const paths: ScaffoldPath[] = [];
  const scale = 45;

  // Compute data bounds
  let maxLogR = 0, maxH = 0;
  for (const v of coordsList) {
    let logR = 0, H = 0;
    for (let i = 0; i < v.length && i < k; i++) {
      logR += v[i] * L[i];
      H += Math.abs(v[i]) * L[i];
    }
    maxLogR = Math.max(maxLogR, Math.abs(logR));
    maxH = Math.max(maxH, H);
  }

  // y=0 line (H=0, only origin)
  lines.push({ x1: -scale, y1: 0, x2: scale, y2: 0 });

  // Asymptotic boundary: as H → ∞, y → scale
  lines.push({ x1: -scale, y1: scale, x2: scale, y2: scale });

  // Constant-H curves: y = H/(1+H) → horizontal lines
  for (let h = 1; h <= Math.ceil(maxH) + 2; h++) {
    const yH = (h / (1 + h)) * scale;
    lines.push({ x1: -scale, y1: yH, x2: scale, y2: yH });
  }

  // Constant log(r) curves: x = logR/(1+H), parametric in H
  // These are vertical-ish curves that converge to x=0 as H grows
  for (let lr = -Math.ceil(maxLogR + 1); lr <= Math.ceil(maxLogR + 1); lr++) {
    if (lr === 0) continue;
    const pts: string[] = [];
    for (let h = 0; h <= 20; h += 0.5) {
      const xv = (lr / (1 + h)) * scale;
      const yv = (h / (1 + h)) * scale;
      pts.push(`${pts.length === 0 ? 'M' : 'L'} ${xv} ${-yv}`);
    }
    if (pts.length > 1) paths.push({ d: pts.join(' ') });
  }

  return { lines, circles: [], polygons: [], paths };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM 9: Harmonic Phase Space
// ═══════════════════════════════════════════════════════════════════════════════

function projectPointPhaseSpace(
  coords: number[],
  basis: ProjectionBasis
): ProjectedPoint {
  const k = basis.primes.length;

  // φᵢ = aᵢ · log(pᵢ) mod 2π
  // x = Σ cos(φᵢ), y = Σ sin(φᵢ)
  let x = 0, y = 0;
  for (let i = 0; i < coords.length && i < k; i++) {
    const phi = coords[i] * Math.log(basis.primes[i]); // natural log
    x += Math.cos(phi);
    y += Math.sin(phi);
  }

  const scale = 16;
  return { x: x * scale, y: y * scale };
}

function scaffoldPhaseSpace(basis: ProjectionBasis, _coordsList: number[][]): Scaffold {
  const k = basis.primes.length;
  const scale = 16;
  const circles: ScaffoldCircle[] = [];
  const lines: ScaffoldLine[] = [];

  // Maximum coherence circle: all phases aligned → r = k
  circles.push({ cx: 0, cy: 0, r: k * scale });

  // Intermediate coherence circles
  for (let r = 1; r < k; r++) {
    circles.push({ cx: 0, cy: 0, r: r * scale });
  }

  // Phase direction markers: angles where single-prime phases = 0
  for (let i = 0; i < k; i++) {
    const omega = Math.log(basis.primes[i]);
    // At phase 0: cos(0)=1, sin(0)=0 → contributes (1,0)
    // Draw a radial line in the direction this prime "pulls" toward
    const angle = omega;
    const len = k * scale * 1.2;
    lines.push({
      x1: -Math.cos(angle) * len, y1: -Math.sin(angle) * len,
      x2: Math.cos(angle) * len, y2: Math.sin(angle) * len,
    });
  }

  // Axes
  const extent = (k + 1) * scale;
  lines.push({ x1: -extent, y1: 0, x2: extent, y2: 0 });
  lines.push({ x1: 0, y1: -extent, x2: 0, y2: extent });

  return { lines, circles, polygons: [], paths: [] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unified API
// ═══════════════════════════════════════════════════════════════════════════════

export function projectPoint(
  coords: number[],
  basis: ProjectionBasis,
  embedding: EmbeddingType = 'vanilla'
): ProjectedPoint {
  switch (embedding) {
    case 'interaction-tensor': return projectPointInteractionTensor(coords, basis);
    case 'harmonic-curvature': return projectPointHarmonicCurvature(coords, basis);
    case 'dual-space':         return projectPointDualSpace(coords, basis);
    case 'simplex-collapse':   return projectPointSimplexCollapse(coords, basis);
    case 'projective-ratio':   return projectPointProjectiveRatio(coords, basis);
    case 'phase-space':        return projectPointPhaseSpace(coords, basis);
    case 'flow-lines':         return projectPointVanilla(coords, basis);
    case 'vanilla':
    default:                   return projectPointVanilla(coords, basis);
  }
}

export function projectAll(
  coordsList: number[][],
  basis: ProjectionBasis,
  embedding: EmbeddingType = 'vanilla',
  edges?: Edge[]
): ProjectedPoint[] {
  // Batch-only embeddings
  if (embedding === 'log-affine') return projectAllLogAffine(coordsList, basis);
  if (embedding === 'spectral') return projectAllSpectral(coordsList, basis, edges);

  // Per-point embeddings
  return coordsList.map((c) => projectPoint(c, basis, embedding));
}

export function computeScaffold(
  embedding: EmbeddingType,
  basis: ProjectionBasis,
  coordsList: number[][]
): Scaffold {
  switch (embedding) {
    case 'log-affine':         return scaffoldLogAffine(basis, coordsList);
    case 'interaction-tensor': return scaffoldInteractionTensor(basis, coordsList);
    case 'flow-lines':         return scaffoldFlowLines(basis, coordsList);
    case 'harmonic-curvature': return scaffoldHarmonicCurvature(basis, coordsList);
    case 'dual-space':         return scaffoldDualSpace(basis, coordsList);
    case 'simplex-collapse':   return scaffoldSimplexCollapse(basis, coordsList);
    case 'spectral':           return scaffoldSpectral(basis, coordsList);
    case 'projective-ratio':   return scaffoldProjectiveRatio(basis, coordsList);
    case 'phase-space':        return scaffoldPhaseSpace(basis, coordsList);
    default:                   return EMPTY_SCAFFOLD;
  }
}

export function computeEdgePaths(
  _embedding: EmbeddingType,
  _projectedPoints: ProjectedPoint[],
  _edges: Edge[]
): EdgePathData {
  return { paths: new Map() };
}
