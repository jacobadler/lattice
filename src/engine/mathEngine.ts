/**
 * mathEngine.ts
 *
 * Handles parsing of rational frequency ratios, prime factorization,
 * and computation of integer coordinate vectors in ℤⁿ.
 *
 * Each ratio r = p1^a1 · p2^a2 · ... · pn^an maps to
 * the lattice coordinate vector v(r) = (a1, a2, ..., an),
 * where each pi is a prime in the basis extracted from all input ratios.
 */

// ─── GCD & fraction utilities ───────────────────────────────────────────────

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export interface Ratio {
  num: number;
  den: number;
}

/** Reduce a fraction to lowest terms. */
export function reduce(num: number, den: number): Ratio {
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(Math.abs(num), den);
  return { num: num / g, den: den / g };
}

/** Format ratio as string. */
export function ratioToString(r: Ratio): string {
  return r.den === 1 ? `${r.num}` : `${r.num}/${r.den}`;
}

/** Ratio to decimal value. */
export function ratioToDecimal(r: Ratio): number {
  return r.num / r.den;
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse a user-supplied string into an array of Ratios.
 * Accepts comma, space, or newline separated entries.
 * Each entry is either "a/b" or "a" (interpreted as a/1).
 * Validates: positive integers only, no floats.
 */
export function parseRatios(input: string): Ratio[] {
  const tokens = input
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const ratios: Ratio[] = [];

  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:\/(\d+))?$/);
    if (!match) {
      throw new Error(`Invalid ratio: "${token}". Use positive integers like 9/8 or 5.`);
    }
    const num = parseInt(match[1], 10);
    const den = match[2] ? parseInt(match[2], 10) : 1;
    if (num <= 0 || den <= 0) {
      throw new Error(`Ratio must be positive: "${token}".`);
    }
    ratios.push(reduce(num, den));
  }

  return ratios;
}

// ─── Prime factorization ────────────────────────────────────────────────────

/** Returns a map of prime -> exponent for a positive integer. */
export function primeFactorize(n: number): Map<number, number> {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Cannot factorize ${n}`);
  }
  const factors = new Map<number, number>();
  if (n === 1) return factors;

  let d = 2;
  while (d * d <= n) {
    while (n % d === 0) {
      factors.set(d, (factors.get(d) || 0) + 1);
      n /= d;
    }
    d++;
  }
  if (n > 1) {
    factors.set(n, (factors.get(n) || 0) + 1);
  }
  return factors;
}

/**
 * Factorize a ratio into prime exponents.
 * For r = num/den, if num = p1^a1 · p2^a2 and den = p1^b1 · p3^b3,
 * then the exponent of pi is (ai - bi).
 */
export function factorizeRatio(r: Ratio): Map<number, number> {
  const numFactors = primeFactorize(r.num);
  const denFactors = primeFactorize(r.den);

  const result = new Map<number, number>();

  // Add positive exponents from numerator
  Array.from(numFactors.entries()).forEach(([p, e]) => {
    result.set(p, e);
  });

  // Subtract exponents from denominator
  Array.from(denFactors.entries()).forEach(([p, e]) => {
    const current = result.get(p) || 0;
    const newExp = current - e;
    if (newExp === 0) {
      result.delete(p);
    } else {
      result.set(p, newExp);
    }
  });

  return result;
}

// ─── Octave normalization ───────────────────────────────────────────────────

/**
 * Normalize a ratio into the interval [1, 2).
 * Multiply or divide by 2 until in range.
 */
export function normalizeToOctave(r: Ratio): Ratio {
  let num = r.num;
  let den = r.den;

  // Bring into [1, 2): value = num/den
  while (num < den) {
    num *= 2;
  }
  while (num >= 2 * den) {
    den *= 2;
  }

  return reduce(num, den);
}

// ─── Coordinate vector computation ─────────────────────────────────────────

export interface LatticePoint {
  ratio: Ratio;
  /** Integer coordinates in ℤⁿ, indexed by prime basis order. */
  coordinates: number[];
  /** The prime factorization as a map. */
  factors: Map<number, number>;
}

/**
 * Given a set of ratios, determine the prime basis, compute coordinate
 * vectors, and return lattice points.
 *
 * @param ratios - parsed ratios
 * @param reduceOctaves - if true, normalize to [1,2) and exclude prime 2
 * @returns primeBasis (sorted primes) and lattice points
 */
export function computeLattice(
  ratios: Ratio[],
  reduceOctaves: boolean
): { primeBasis: number[]; points: LatticePoint[] } {
  // Optionally normalize
  const processed = reduceOctaves
    ? ratios.map((r) => normalizeToOctave(r))
    : ratios;

  // Deduplicate ratios
  const seen = new Set<string>();
  const unique: Ratio[] = [];
  for (const r of processed) {
    const key = `${r.num}/${r.den}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  // Always include the origin (1/1) if not present
  if (!seen.has('1/1')) {
    unique.unshift({ num: 1, den: 1 });
  }

  // Sort ratios in ascending order by their decimal value
  unique.sort((a, b) => (a.num / a.den) - (b.num / b.den));

  // Factorize all ratios and collect primes
  const allFactors: Map<number, number>[] = [];
  const primeSet = new Set<number>();

  for (const r of unique) {
    const f = factorizeRatio(r);
    allFactors.push(f);
    Array.from(f.keys()).forEach((p) => {
      primeSet.add(p);
    });
  }

  // Build sorted prime basis (exclude 2 if reducing octaves)
  let primeBasis = Array.from(primeSet).sort((a, b) => a - b);
  if (reduceOctaves) {
    primeBasis = primeBasis.filter((p) => p !== 2);
  }

  // Compute coordinate vectors
  const points: LatticePoint[] = unique.map((r, i) => {
    const factors = allFactors[i];
    const coordinates = primeBasis.map((p) => factors.get(p) || 0);
    return { ratio: r, coordinates, factors };
  });

  return { primeBasis, points };
}
