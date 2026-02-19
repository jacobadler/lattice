# LATTICE — Just Intonation Tuning Lattice Visualizer

A web-based interactive 2D application that constructs and visualizes n-dimensional tuning lattices from user-supplied just-intonation ratios.

## Mathematical Model

### Prime Factor Coordinate System

Every positive rational number has a unique prime factorization:

```
r = 2^a0 · 3^a1 · 5^a2 · 7^a3 · 11^a4 · ...
```

We define the **lattice coordinate vector** as:

```
v(r) = (a0, a1, a2, ..., an)
```

where each dimension corresponds to a prime in the basis. The basis is determined by collecting all primes that appear in the factorizations of the input ratios, sorted in ascending order.

For example, the ratio 9/8:
- 9 = 3^2, 8 = 2^3
- 9/8 = 2^(-3) · 3^2
- With basis [2, 3]: v(9/8) = (-3, 2)
- With octave reduction (ignoring prime 2): v(9/8) = (2)

### Octave Handling

When "Reduce octaves" is enabled:
1. All ratios are normalized into the interval [1, 2) by multiplying/dividing by powers of 2
2. Prime 2 is removed from the coordinate system
3. This is the standard musicological convention — octave equivalence

When disabled, prime 2 becomes a full lattice dimension.

### Projection Method

For k primes in the basis, we construct a **2 x k projection matrix** P. Each prime index i (0-based) is assigned a unit basis vector in R^2 at an evenly spaced angle around the unit circle:

```
angle_i = 2pi * i / k
basis_i = (cos(angle_i), sin(angle_i))
```

The projected 2D point for lattice vector v = (a0, a1, ..., a_{k-1}) is:

```
projected = sum_i( a_i * basis_i )
         = ( sum_i( a_i * cos(angle_i) ), sum_i( a_i * sin(angle_i) ) )
```

**Special cases:**
- k = 1: single horizontal axis
- k = 2: orthogonal axes (0 deg and 90 deg) for maximum visual separation

**Properties:**
- Deterministic: depends only on prime index and basis size
- Independent of input order (prime basis is always sorted ascending)
- No randomness or manual tuning
- All primes are visually distinguishable (non-collinear for k >= 3)
- Produces symmetric layouts

### Edge Construction

Two lattice nodes are connected by an edge if and only if their coordinate vectors differ by exactly +/-1 in exactly one dimension:

```
L1_norm(v_a - v_b) = 1
```

This produces the standard lattice grid where each edge represents a single step along one prime axis.

**Performance:** Edge construction uses spatial hashing (coordinate string -> node index map) for O(n*k) time complexity instead of O(n^2) pairwise comparison.

## Architecture

```
src/
  engine/
    mathEngine.ts        — ratio parsing, prime factorization, coordinate vectors
    projectionEngine.ts  — projection matrix construction, n-D to 2-D mapping
    latticeEngine.ts     — edge construction via spatial hashing
  components/
    ControlPanel.tsx     — input UI, toggles, build button
    LatticeRenderer.tsx  — SVG rendering with D3 zoom/pan
  App.tsx                — orchestration: parse -> compute -> project -> render
  App.css                — dark-mode styling
```

## Usage

```bash
npm install
npm start
```

Enter ratios (comma, space, or newline separated), configure options, and click **Build Lattice**.

- **Zoom:** mouse wheel
- **Pan:** click and drag
- **Hover:** tooltip with decimal value and coordinates

## Input Format

Accepts positive rational numbers:
- `9/8` — fraction
- `5` — integer (interpreted as 5/1)
- Separators: comma, space, newline, or any combination

## Tech Stack

- React + TypeScript
- D3.js (zoom/pan only)
- SVG rendering
- Pure client-side, no server required
