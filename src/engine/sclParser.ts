/**
 * sclParser.ts
 *
 * Parses Scala .scl tuning files.
 *
 * SCL format:
 *   - Lines starting with '!' are comments
 *   - First non-comment line: scale description
 *   - Second non-comment line: number of notes
 *   - Remaining non-comment lines: one pitch per line
 *     - Ratios: integers or "num/den" (e.g. "3/2", "5")
 *     - Cents: contain a decimal point (e.g. "700.0", "100.000")
 */

export interface SclScale {
  description: string;
  ratioStrings: string[];
}

/**
 * Parse a .scl file's text content into a description and array of ratio strings.
 * Cents values are converted to approximate ratios when they match common JI intervals,
 * otherwise they are converted using 2^(cents/1200).
 */
export function parseSclFile(text: string): SclScale {
  const lines = text.split(/\r?\n/);

  // Filter out comment lines (starting with '!')
  const dataLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('!')) continue;
    dataLines.push(trimmed);
  }

  if (dataLines.length < 2) {
    throw new Error('Invalid .scl file: not enough data lines.');
  }

  const description = dataLines[0];
  const noteCount = parseInt(dataLines[1], 10);

  if (isNaN(noteCount) || noteCount < 0) {
    throw new Error(`Invalid .scl file: bad note count "${dataLines[1]}".`);
  }

  const pitchLines = dataLines.slice(2).filter((l) => l.length > 0);
  const ratioStrings: string[] = [];

  for (const line of pitchLines) {
    // Take only the part before any whitespace (ignore trailing comments/labels)
    const token = line.split(/\s+/)[0];
    if (!token) continue;

    if (token.includes('.')) {
      // Cents value — convert to ratio
      const cents = parseFloat(token);
      if (isNaN(cents)) continue;
      const decimal = Math.pow(2, cents / 1200);
      const ratio = decimalToRatio(decimal);
      ratioStrings.push(ratio);
    } else if (token.includes('/')) {
      // Already a ratio
      ratioStrings.push(token);
    } else {
      // Plain integer (e.g. "2" means 2/1)
      const n = parseInt(token, 10);
      if (!isNaN(n) && n > 0) {
        ratioStrings.push(`${n}/1`);
      }
    }
  }

  return { description, ratioStrings };
}

/**
 * Convert a decimal frequency ratio to a simple ratio string.
 * First checks a table of common JI intervals, then falls back
 * to a continued-fraction approximation.
 */
function decimalToRatio(value: number): string {
  // Common JI intervals mapped from their cent values
  const knownRatios: [number, string][] = [
    [1.0, '1/1'],
    [16 / 15, '16/15'],
    [10 / 9, '10/9'],
    [9 / 8, '9/8'],
    [8 / 7, '8/7'],
    [7 / 6, '7/6'],
    [6 / 5, '6/5'],
    [5 / 4, '5/4'],
    [9 / 7, '9/7'],
    [4 / 3, '4/3'],
    [11 / 8, '11/8'],
    [7 / 5, '7/5'],
    [10 / 7, '10/7'],
    [3 / 2, '3/2'],
    [8 / 5, '8/5'],
    [5 / 3, '5/3'],
    [12 / 7, '12/7'],
    [7 / 4, '7/4'],
    [9 / 5, '9/5'],
    [11 / 6, '11/6'],
    [15 / 8, '15/8'],
    [2 / 1, '2/1'],
  ];

  for (const [dec, str] of knownRatios) {
    if (Math.abs(value - dec) < 0.0001) {
      return str;
    }
  }

  // Continued fraction approximation
  const maxDen = 1000;
  let bestNum = 1;
  let bestDen = 1;
  let bestErr = Math.abs(value - 1);

  let p0 = 0, q0 = 1, p1 = 1, q1 = 0;
  let x = value;

  for (let i = 0; i < 30; i++) {
    const a = Math.floor(x);
    const p2 = a * p1 + p0;
    const q2 = a * q1 + q0;

    if (q2 > maxDen) break;

    const err = Math.abs(value - p2 / q2);
    if (err < bestErr) {
      bestErr = err;
      bestNum = p2;
      bestDen = q2;
    }

    if (err < 1e-10) break;

    p0 = p1; q0 = q1;
    p1 = p2; q1 = q2;

    const remainder = x - a;
    if (remainder < 1e-12) break;
    x = 1 / remainder;
  }

  return `${bestNum}/${bestDen}`;
}
