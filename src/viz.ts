import type { SpectrumBin } from "./dft";
import { positiveSpectrum } from "./dft";

const WAVE_PAD_X = 28;
const WAVE_PAD_Y = 22;
const SPEC_PAD_X = 28;
const SPEC_PAD_Y = 28;

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2D canvas unavailable");
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function cssSize(canvas: HTMLCanvasElement): { w: number; h: number } {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function signalExtent(signal: Float64Array): number {
  let max = 1e-6;
  for (let i = 0; i < signal.length; i += 1) {
    max = Math.max(max, Math.abs(signal[i]!));
  }
  return max;
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  original: Float64Array,
  rebuild: Float64Array | null,
  colors: { accent: string; rebuild: string; grid: string },
): void {
  const ctx = resizeCanvas(canvas);
  const { w, h } = cssSize(canvas);
  ctx.clearRect(0, 0, w, h);

  const padX = WAVE_PAD_X;
  const padY = WAVE_PAD_Y;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;
  const midY = padY + plotH / 2;
  const extent = Math.max(signalExtent(original), rebuild ? signalExtent(rebuild) : 0);

  // Grid
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, midY);
  ctx.lineTo(padX + plotW, midY);
  ctx.stroke();

  const drawPath = (signal: Float64Array, color: string, width: number) => {
    const n = signal.length;
    if (n < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const x = padX + (i / (n - 1)) * plotW;
      const y = midY - (signal[i]! / extent) * (plotH * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  drawPath(original, colors.accent, 2.25);
  if (rebuild) {
    drawPath(rebuild, colors.rebuild, 1.75);
  }

  // Soft fill under original
  {
    const n = original.length;
    const grad = ctx.createLinearGradient(0, padY, 0, padY + plotH);
    grad.addColorStop(0, "rgba(14, 116, 144, 0.18)");
    grad.addColorStop(1, "rgba(14, 116, 144, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    for (let i = 0; i < n; i += 1) {
      const x = padX + (i / (n - 1)) * plotW;
      const y = midY - (original[i]! / extent) * (plotH * 0.42);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padX + plotW, midY);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawSpectrum(
  canvas: HTMLCanvasElement,
  spectrum: SpectrumBin[],
  activeBins: number,
  showPhase: boolean,
  colors: { bar: string; active: string; phase: string; grid: string; ink: string },
): void {
  const ctx = resizeCanvas(canvas);
  const { w, h } = cssSize(canvas);
  ctx.clearRect(0, 0, w, h);

  const bins = positiveSpectrum(spectrum);
  if (bins.length === 0) return;

  const padX = SPEC_PAD_X;
  const padY = SPEC_PAD_Y;
  const plotW = w - padX * 2;
  const plotH = h - padY * 2;
  let maxMag = 1e-6;
  for (const b of bins) {
    maxMag = Math.max(maxMag, b.magnitude);
  }

  // Baseline
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, padY + plotH);
  ctx.lineTo(padX + plotW, padY + plotH);
  ctx.stroke();

  const barGap = 1.5;
  const barW = Math.max(2, plotW / bins.length - barGap);

  for (let i = 0; i < bins.length; i += 1) {
    const bin = bins[i]!;
    const x = padX + (i / bins.length) * plotW;
    const barH = (bin.magnitude / maxMag) * (plotH * 0.92);
    const isActive = bin.k < activeBins;
    ctx.fillStyle = isActive ? colors.active : colors.bar;
    ctx.globalAlpha = isActive ? 1 : 0.35;
    ctx.fillRect(x, padY + plotH - barH, barW, barH);
    ctx.globalAlpha = 1;

    if (showPhase && bin.magnitude > maxMag * 0.08) {
      const phaseY =
        padY + plotH / 2 - (bin.phase / Math.PI) * (plotH * 0.35);
      ctx.fillStyle = colors.phase;
      ctx.beginPath();
      ctx.arc(x + barW / 2, phaseY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Axis label
  ctx.fillStyle = colors.ink;
  ctx.font = "500 11px 'IBM Plex Mono', monospace";
  ctx.fillText("k →", padX + plotW - 28, padY + plotH + 16);
  ctx.fillText("|X[k]|", padX, padY - 8);
}

/** Map pointer X on the wave canvas to a sample index. */
export function pointerToSampleIndex(
  canvas: HTMLCanvasElement,
  clientX: number,
  sampleCount: number,
): number {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const padX = WAVE_PAD_X;
  const plotW = rect.width - padX * 2;
  const t = (x - padX) / plotW;
  const idx = Math.round(t * (sampleCount - 1));
  return Math.max(0, Math.min(sampleCount - 1, idx));
}

/** Map pointer Y on the wave canvas to a signal amplitude in [-1.2, 1.2]. */
export function pointerToAmplitude(
  canvas: HTMLCanvasElement,
  clientY: number,
): number {
  const rect = canvas.getBoundingClientRect();
  const y = clientY - rect.top;
  const padY = WAVE_PAD_Y;
  const plotH = rect.height - padY * 2;
  const midY = padY + plotH / 2;
  const amp = -((y - midY) / (plotH * 0.42));
  return Math.max(-1.2, Math.min(1.2, amp));
}
