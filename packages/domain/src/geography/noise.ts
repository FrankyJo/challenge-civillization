/**
 * Integer value noise. Every step is exact integer arithmetic (products stay
 * below 2^53 and divisions are by powers of two or use exact integer
 * quotients), so outputs are bit-identical on every platform.
 */
const ONE = 65_536;

/** 32-bit avalanche mix ("lowbias32", C. Wellons). */
export function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of integer lattice coordinates under a 32-bit seed word. */
export function hash3(seedWord: number, a: number, b: number, c: number): number {
  return mix32(mix32(mix32(seedWord ^ (a | 0)) ^ (b | 0)) ^ (c | 0));
}

/** Floor division for integers (exact for |n| < 2^53). */
export function floorDiv(n: number, d: number): number {
  const remainder = n % d;
  const quotient = (n - remainder) / d;
  return remainder !== 0 && n < 0 !== d < 0 ? quotient - 1 : quotient;
}

function smooth(t: number): number {
  // t²(3 − 2t) on a 16-bit fixed-point fraction.
  return Math.floor((t * t * (3 * ONE - 2 * t)) / 4_294_967_296);
}

function lerp(a: number, b: number, t: number): number {
  return a + Math.floor(((b - a) * t) / ONE);
}

/** Value noise in [0, 65535] at integer position (metres) for one wavelength (metres). */
export function valueNoise(seedWord: number, octave: number, x: number, y: number, wavelength: number): number {
  const gx = floorDiv(x, wavelength);
  const gy = floorDiv(y, wavelength);
  const fx = smooth(floorDiv((x - gx * wavelength) * ONE, wavelength));
  const fy = smooth(floorDiv((y - gy * wavelength) * ONE, wavelength));
  const v00 = hash3(seedWord, gx, gy, octave) & 0xffff;
  const v10 = hash3(seedWord, gx + 1, gy, octave) & 0xffff;
  const v01 = hash3(seedWord, gx, gy + 1, octave) & 0xffff;
  const v11 = hash3(seedWord, gx + 1, gy + 1, octave) & 0xffff;
  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
}

/**
 * Fractal sum of `octaves` value-noise layers, halving the wavelength and
 * weight each octave. Result in [0, 65535].
 */
export function fractalNoise(seedWord: number, x: number, y: number, wavelength: number, octaves: number): number {
  let total = 0;
  let weights = 0;
  let weight = 1 << (octaves - 1);
  let length = wavelength;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(seedWord, octave, x, y, Math.max(1, length)) * weight;
    weights += weight;
    weight >>= 1;
    length = Math.floor(length / 2);
  }
  return Math.floor(total / weights);
}

/** Integer square root: the largest r with r² ≤ n (n ≤ 2^53). */
export function isqrt(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("isqrt needs a non-negative safe integer");
  let r = Math.floor(Math.sqrt(n));
  while (r * r > n) r -= 1;
  while ((r + 1) * (r + 1) <= n) r += 1;
  return r;
}
