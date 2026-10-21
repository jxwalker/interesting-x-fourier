/** Complex bin from a discrete Fourier transform. */
export interface SpectrumBin {
  /** Frequency index k (0 … N/1). */
  k: number;
  /** Real part of X[k]. */
  re: number;
  /** Imaginary part of X[k]. */
  im: number;
  /** |X[k]| (unnormalized). */
  magnitude: number;
  /** atan2(im, re) in radians. */
  phase: number;
}

/**
 * Naive DFT of a real-valued length-N signal.
 * X[k] = Σₙ x[n] · e^{-i 2π k n / N}
 */
export function dft(signal: Float64Array): SpectrumBin[] {
  const n = signal.length;
  if (n === 0) {
    return [];
  }

  const out: SpectrumBin[] = new Array(n);
  const twoPiOverN = (2 * Math.PI) / n;

  for (let k = 0; k < n; k += 1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 1) {
      const angle = twoPiOverN * k * i;
      const sample = signal[i]!;
      re += sample * Math.cos(angle);
      im -= sample * Math.sin(angle);
    }
    out[k] = {
      k,
      re,
      im,
      magnitude: Math.hypot(re, im),
      phase: Math.atan2(im, re),
    };
  }

  return out;
}

/**
 * Inverse DFT truncated to the first `partialBins` frequency indices
 * (plus their conjugate mirrors for a real-valued rebuild).
 * `partialBins` of 1 uses only DC; full `spectrum.length` rebuilds exactly.
 */
export function idftPartial(
  spectrum: SpectrumBin[],
  length: number,
  partialBins: number,
): Float64Array {
  const n = length;
  const out = new Float64Array(n);
  if (n === 0 || spectrum.length === 0) {
    return out;
  }

  const maxK = Math.min(Math.max(1, Math.floor(partialBins)), spectrum.length);
  const twoPiOverN = (2 * Math.PI) / n;
  const keep = new Set<number>();

  for (let k = 0; k < maxK; k += 1) {
    keep.add(k);
    if (k > 0) {
      keep.add((n - k) % n);
    }
  }

  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (const k of keep) {
      const bin = spectrum[k];
      if (!bin) continue;
      const angle = twoPiOverN * k * i;
      sum += bin.re * Math.cos(angle) - bin.im * Math.sin(angle);
    }
    out[i] = sum / n;
  }

  return out;
}

/** Positive-frequency half (including DC), useful for plotting magnitude. */
export function positiveSpectrum(spectrum: SpectrumBin[]): SpectrumBin[] {
  const half = Math.floor(spectrum.length / 2);
  return spectrum.slice(0, half + 1);
}
