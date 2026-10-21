export const SAMPLE_COUNT = 256;
export const PERIODS = 4;

export type PresetId = "sines" | "square" | "saw" | "custom";

export interface PresetOption {
  id: PresetId;
  label: string;
}

export const PRESET_OPTIONS: readonly PresetOption[] = [
  { id: "sines", label: "Sum of sines" },
  { id: "square", label: "Square" },
  { id: "saw", label: "Sawtooth" },
  { id: "custom", label: "Custom draw" },
] as const;

export interface HarmonicMix {
  /** Fundamental amplitude. */
  a1: number;
  /** 2nd harmonic amplitude. */
  a2: number;
  /** 3rd harmonic amplitude. */
  a3: number;
}

export const DEFAULT_MIX: HarmonicMix = { a1: 1, a2: 0.45, a3: 0.25 };

function sampleIndexToPhase(i: number, n: number): number {
  return (2 * Math.PI * PERIODS * i) / n;
}

/** Three-tone sum — the Strang "it is just a recipe of frequencies" starter. */
export function makeSines(n: number, mix: HarmonicMix): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = sampleIndexToPhase(i, n);
    out[i] =
      mix.a1 * Math.sin(t) +
      mix.a2 * Math.sin(2 * t) +
      mix.a3 * Math.sin(3 * t);
  }
  return out;
}

/** Square wave via odd-harmonic Fourier series truncated to `harmonics`. */
export function makeSquare(n: number, harmonics: number): Float64Array {
  const out = new Float64Array(n);
  const terms = Math.max(1, Math.floor(harmonics));
  for (let i = 0; i < n; i += 1) {
    const t = sampleIndexToPhase(i, n);
    let sum = 0;
    for (let k = 0; k < terms; k += 1) {
      const odd = 2 * k + 1;
      sum += Math.sin(odd * t) / odd;
    }
    out[i] = (4 / Math.PI) * sum;
  }
  return out;
}

/** Sawtooth via all-harmonic series truncated to `harmonics`. */
export function makeSaw(n: number, harmonics: number): Float64Array {
  const out = new Float64Array(n);
  const terms = Math.max(1, Math.floor(harmonics));
  for (let i = 0; i < n; i += 1) {
    const t = sampleIndexToPhase(i, n);
    let sum = 0;
    for (let k = 1; k <= terms; k += 1) {
      sum += ((k % 2 === 0 ? -1 : 1) * Math.sin(k * t)) / k;
    }
    out[i] = (2 / Math.PI) * sum;
  }
  return out;
}

/** Flat zero buffer for freehand drawing. */
export function makeBlank(n: number): Float64Array {
  return new Float64Array(n);
}

export function cloneSignal(signal: Float64Array): Float64Array {
  return new Float64Array(signal);
}

export function buildPreset(
  id: PresetId,
  mix: HarmonicMix,
  harmonics: number,
  custom: Float64Array | null,
): Float64Array {
  switch (id) {
    case "sines":
      return makeSines(SAMPLE_COUNT, mix);
    case "square":
      return makeSquare(SAMPLE_COUNT, harmonics);
    case "saw":
      return makeSaw(SAMPLE_COUNT, harmonics);
    case "custom":
      return custom ? cloneSignal(custom) : makeBlank(SAMPLE_COUNT);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}
