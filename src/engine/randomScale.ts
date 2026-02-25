/**
 * randomScale.ts
 *
 * Generates random just-intonation scales by performing random walks
 * in the prime-factor lattice. Each new pitch is one lattice step from
 * an existing pitch, guaranteeing that every ratio connects to at least
 * one other ratio in the lattice.
 */

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Generate a random just-intonation scale.
 *
 * @param count - Number of pitches (not including 1/1)
 * @returns Array of ratio strings like ["9/8", "5/4", ...]
 */
export function generateRandomScale(count: number): string[] {
  const clampedCount = Math.min(Math.max(1, count), 250);
  const MAX_VAL = 999999; // 6-digit limit

  // Choose primes based on scale size
  const ALL_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23];
  const numPrimes = clampedCount <= 5 ? 2
    : clampedCount <= 15 ? 3
    : clampedCount <= 40 ? 4
    : clampedCount <= 100 ? 5
    : Math.min(6, ALL_PRIMES.length);

  // Shuffle and pick primes
  const shuffled = [...ALL_PRIMES].sort(() => Math.random() - 0.5);
  const primes = shuffled.slice(0, numPrimes).sort((a, b) => a - b);

  // Each point is an exponent vector (Map<primeIndex, exponent>)
  type ExponentVector = Map<number, number>;

  const points: ExponentVector[] = [new Map()]; // start with 1/1
  const ratioSet = new Set<string>(['1/1']);
  const ratios: string[] = [];

  let attempts = 0;
  const maxAttempts = clampedCount * 100;

  while (ratios.length < clampedCount && attempts < maxAttempts) {
    attempts++;

    // Pick a random existing point to branch from
    const baseIdx = Math.floor(Math.random() * points.length);
    const newPoint: ExponentVector = new Map(points[baseIdx]);

    // Take 1-2 random steps (more likely to explore further)
    const steps = Math.random() < 0.7 ? 1 : 2;
    for (let s = 0; s < steps; s++) {
      const primeIdx = Math.floor(Math.random() * primes.length);
      const prime = primes[primeIdx];
      const direction = Math.random() < 0.5 ? 1 : -1;
      const currentExp = newPoint.get(prime) || 0;
      const newExp = currentExp + direction;

      // Limit exponents to keep numbers reasonable
      if (Math.abs(newExp) > 5) continue;
      if (newExp === 0) {
        newPoint.delete(prime);
      } else {
        newPoint.set(prime, newExp);
      }
    }

    // Compute numerator and denominator from exponents
    let num = 1;
    let den = 1;
    let tooLarge = false;

    for (const [prime, exp] of newPoint) {
      if (exp > 0) {
        for (let i = 0; i < exp; i++) {
          num *= prime;
          if (num > MAX_VAL * 4) { tooLarge = true; break; }
        }
      } else {
        for (let i = 0; i < -exp; i++) {
          den *= prime;
          if (den > MAX_VAL * 4) { tooLarge = true; break; }
        }
      }
      if (tooLarge) break;
    }
    if (tooLarge) continue;

    // Normalize to [1, 2)
    while (num < den) num *= 2;
    while (num >= 2 * den) den *= 2;

    // Reduce
    const g = gcd(num, den);
    num /= g;
    den /= g;

    // Check digit limits
    if (num > MAX_VAL || den > MAX_VAL) continue;

    // Check for 1/1 or duplicates
    const key = den === 1 ? `${num}` : `${num}/${den}`;
    if (key === '1/1' || key === '1' || ratioSet.has(key)) continue;

    ratioSet.add(key);
    points.push(newPoint);
    ratios.push(key);
  }

  return ratios;
}
