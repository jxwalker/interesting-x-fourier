import "./styles.css";
import { dft, idftPartial, type SpectrumBin } from "./dft";
import {
  SAMPLE_COUNT,
  DEFAULT_MIX,
  PRESET_OPTIONS,
  buildPreset,
  cloneSignal,
  makeBlank,
  type HarmonicMix,
  type PresetId,
} from "./signals";
import {
  drawSpectrum,
  drawWaveform,
  pointerToAmplitude,
  pointerToSampleIndex,
} from "./viz";

const REBUILD_MS_PER_BIN = 110;
const MAX_PARTIAL_BINS = Math.floor(SAMPLE_COUNT / 2) + 1;

interface AppState {
  preset: PresetId;
  mix: HarmonicMix;
  harmonics: number;
  signal: Float64Array;
  custom: Float64Array;
  spectrum: SpectrumBin[];
  playing: boolean;
  partialBins: number;
  showPhase: boolean;
  drawing: boolean;
}

function mustEl<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  ctor: new () => T,
): T {
  const el = root.querySelector(selector);
  if (!(el instanceof ctor)) {
    throw new Error(`Missing or wrong element: ${selector}`);
  }
  return el;
}

function formatHzLabel(partial: number, total: number): string {
  return `${partial} / ${total} bins`;
}

function mount(): void {
  const appRoot = document.getElementById("app");
  if (!(appRoot instanceof HTMLElement)) {
    throw new Error("Missing #app");
  }
  const root: HTMLElement = appRoot;

  const custom = makeBlank(SAMPLE_COUNT);
  const initialSignal = buildPreset("sines", DEFAULT_MIX, 8, custom);

  const state: AppState = {
    preset: "sines",
    mix: { ...DEFAULT_MIX },
    harmonics: 8,
    signal: initialSignal,
    custom,
    spectrum: dft(initialSignal),
    playing: false,
    partialBins: MAX_PARTIAL_BINS,
    showPhase: false,
    drawing: false,
  };

  root.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <div class="wash" aria-hidden="true"></div>

    <header class="hero">
      <p class="brand">Interesting X</p>
      <h1 class="title">Fourier playground</h1>
      <p class="lede">
        A time signal is a recipe of frequencies. Edit the wave, read the spectrum,
        then rebuild it harmonic by harmonic — Gilbert Strang style, in your browser.
      </p>
    </header>

    <section class="stage" aria-label="Time and frequency views">
      <div class="panel wave-panel">
        <div class="panel-head">
          <p class="panel-label">Time domain · x[n]</p>
          <p class="panel-meta" id="wave-meta">original + rebuild</p>
        </div>
        <canvas id="wave" role="img" aria-label="Time-domain waveform"></canvas>
      </div>

      <div class="panel spec-panel">
        <div class="panel-head">
          <p class="panel-label">Frequency domain · |X[k]|</p>
          <p class="panel-meta" id="spec-meta">${formatHzLabel(state.partialBins, MAX_PARTIAL_BINS)}</p>
        </div>
        <canvas id="spectrum" role="img" aria-label="Magnitude spectrum"></canvas>
      </div>
    </section>

    <section class="controls" aria-label="Signal controls">
      <div class="presets" role="group" aria-label="Presets">
        ${PRESET_OPTIONS.map(
          (p) =>
            `<button type="button" class="chip${p.id === state.preset ? " is-active" : ""}" id="preset-${p.id}" data-preset="${p.id}">${p.label}</button>`,
        ).join("")}
      </div>

      <div class="sliders">
        <div class="field" id="field-mix">
          <label for="mix-a2">2nd harmonic</label>
          <input id="mix-a2" type="range" min="0" max="1" step="0.05" value="${state.mix.a2}" />
          <div class="range-meta"><span>0</span><span id="mix-a2-val">${state.mix.a2.toFixed(2)}</span><span>1</span></div>
        </div>
        <div class="field" id="field-harmonics">
          <label for="harmonics">Series terms</label>
          <input id="harmonics" type="range" min="1" max="32" step="1" value="${state.harmonics}" />
          <div class="range-meta"><span>1</span><span id="harmonics-val">${state.harmonics}</span><span>32</span></div>
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn primary" id="btn-play">Animate rebuild</button>
        <button type="button" class="btn" id="btn-reset">Reset</button>
        <label class="toggle">
          <input type="checkbox" id="toggle-phase" />
          <span>Show phase</span>
        </label>
      </div>
    </section>

    <p class="caption">
      DFT is the change-of-basis that turns samples into frequency coefficients.
      Gold bars are the bins currently included in the inverse rebuild; teal is the source wave.
      Inspired by
      <a href="https://x.com/Zyphorrl/status/2092573687799066962" target="_blank" rel="noreferrer">@Zyphorrl</a>
      and Strang’s Fourier teaching.
    </p>

    <footer class="foot">
      <span>apps/fourier</span>
      <span aria-hidden="true">·</span>
      <span>pure JS DFT · no ML libs</span>
    </footer>
  `;

  const wave = mustEl(root, "#wave", HTMLCanvasElement);
  const spectrumCanvas = mustEl(root, "#spectrum", HTMLCanvasElement);
  const btnPlay = mustEl(root, "#btn-play", HTMLButtonElement);
  const btnReset = mustEl(root, "#btn-reset", HTMLButtonElement);
  const mixA2 = mustEl(root, "#mix-a2", HTMLInputElement);
  const mixA2Val = mustEl(root, "#mix-a2-val", HTMLElement);
  const harmonics = mustEl(root, "#harmonics", HTMLInputElement);
  const harmonicsVal = mustEl(root, "#harmonics-val", HTMLElement);
  const fieldMix = mustEl(root, "#field-mix", HTMLElement);
  const fieldHarmonics = mustEl(root, "#field-harmonics", HTMLElement);
  const togglePhase = mustEl(root, "#toggle-phase", HTMLInputElement);
  const waveMeta = mustEl(root, "#wave-meta", HTMLElement);
  const specMeta = mustEl(root, "#spec-meta", HTMLElement);

  let animToken = 0;

  const colors = {
    wave: {
      accent: "#0e7490",
      rebuild: "#c2410c",
      grid: "rgba(11, 31, 42, 0.12)",
    },
    spec: {
      bar: "#64748b",
      active: "#d97706",
      phase: "#be185d",
      grid: "rgba(11, 31, 42, 0.12)",
      ink: "rgba(11, 31, 42, 0.55)",
    },
  };

  function syncFieldVisibility(): void {
    const isSines = state.preset === "sines";
    const isSeries = state.preset === "square" || state.preset === "saw";
    fieldMix.hidden = !isSines;
    fieldHarmonics.hidden = !isSeries;
    wave.classList.toggle("is-drawable", state.preset === "custom");
  }

  function syncChips(): void {
    for (const opt of PRESET_OPTIONS) {
      const btn = mustEl(root, `#preset-${opt.id}`, HTMLButtonElement);
      btn.classList.toggle("is-active", opt.id === state.preset);
    }
  }

  function recomputeSpectrum(): void {
    state.spectrum = dft(state.signal);
  }

  function applyPreset(id: PresetId): void {
    state.preset = id;
    state.playing = false;
    animToken += 1;
    btnPlay.textContent = "Animate rebuild";
    state.signal = buildPreset(id, state.mix, state.harmonics, state.custom);
    state.partialBins = MAX_PARTIAL_BINS;
    recomputeSpectrum();
    syncChips();
    syncFieldVisibility();
    paint();
  }

  function paint(): void {
    const rebuild =
      state.partialBins < MAX_PARTIAL_BINS
        ? idftPartial(state.spectrum, SAMPLE_COUNT, state.partialBins)
        : null;

    drawWaveform(wave, state.signal, rebuild, colors.wave);
    drawSpectrum(
      spectrumCanvas,
      state.spectrum,
      state.partialBins,
      state.showPhase,
      colors.spec,
    );

    waveMeta.textContent =
      rebuild === null ? "full signal" : `rebuild · ${state.partialBins} bins`;
    specMeta.textContent = formatHzLabel(state.partialBins, MAX_PARTIAL_BINS);
  }

  async function animateRebuild(): Promise<void> {
    const token = ++animToken;
    state.playing = true;
    btnPlay.textContent = "Pause";
    state.partialBins = 1;
    paint();

    for (let k = 2; k <= MAX_PARTIAL_BINS; k += 1) {
      if (animToken !== token || !state.playing) break;
      await new Promise<void>((r) => setTimeout(r, REBUILD_MS_PER_BIN));
      if (animToken !== token || !state.playing) break;
      state.partialBins = k;
      paint();
    }

    if (animToken === token) {
      state.playing = false;
      state.partialBins = MAX_PARTIAL_BINS;
      btnPlay.textContent = "Animate rebuild";
      paint();
    }
  }

  for (const opt of PRESET_OPTIONS) {
    mustEl(root, `#preset-${opt.id}`, HTMLButtonElement).addEventListener(
      "click",
      () => applyPreset(opt.id),
    );
  }

  mixA2.addEventListener("input", () => {
    state.mix.a2 = Number(mixA2.value);
    mixA2Val.textContent = state.mix.a2.toFixed(2);
    if (state.preset === "sines") {
      state.signal = buildPreset("sines", state.mix, state.harmonics, state.custom);
      state.partialBins = MAX_PARTIAL_BINS;
      recomputeSpectrum();
      paint();
    }
  });

  harmonics.addEventListener("input", () => {
    state.harmonics = Number(harmonics.value);
    harmonicsVal.textContent = String(state.harmonics);
    if (state.preset === "square" || state.preset === "saw") {
      state.signal = buildPreset(
        state.preset,
        state.mix,
        state.harmonics,
        state.custom,
      );
      state.partialBins = MAX_PARTIAL_BINS;
      recomputeSpectrum();
      paint();
    }
  });

  btnPlay.addEventListener("click", () => {
    if (state.playing) {
      state.playing = false;
      animToken += 1;
      btnPlay.textContent = "Animate rebuild";
      return;
    }
    void animateRebuild();
  });

  btnReset.addEventListener("click", () => {
    state.mix = { ...DEFAULT_MIX };
    state.harmonics = 8;
    mixA2.value = String(state.mix.a2);
    mixA2Val.textContent = state.mix.a2.toFixed(2);
    harmonics.value = String(state.harmonics);
    harmonicsVal.textContent = String(state.harmonics);
    state.custom = makeBlank(SAMPLE_COUNT);
    applyPreset(state.preset === "custom" ? "sines" : state.preset);
  });

  togglePhase.addEventListener("change", () => {
    state.showPhase = togglePhase.checked;
    paint();
  });

  function paintCustomAt(clientX: number, clientY: number): void {
    const idx = pointerToSampleIndex(wave, clientX, SAMPLE_COUNT);
    const amp = pointerToAmplitude(wave, clientY);
    state.custom[idx] = amp;
    // Soft neighbor smear so freehand looks continuous
    if (idx > 0) {
      state.custom[idx - 1] = state.custom[idx - 1]! * 0.35 + amp * 0.65;
    }
    if (idx < SAMPLE_COUNT - 1) {
      state.custom[idx + 1] = state.custom[idx + 1]! * 0.35 + amp * 0.65;
    }
    state.signal = cloneSignal(state.custom);
    state.partialBins = MAX_PARTIAL_BINS;
    recomputeSpectrum();
    paint();
  }

  wave.addEventListener("pointerdown", (e) => {
    if (state.preset !== "custom") return;
    state.drawing = true;
    wave.setPointerCapture(e.pointerId);
    paintCustomAt(e.clientX, e.clientY);
  });

  wave.addEventListener("pointermove", (e) => {
    if (!state.drawing || state.preset !== "custom") return;
    paintCustomAt(e.clientX, e.clientY);
  });

  wave.addEventListener("pointerup", () => {
    state.drawing = false;
  });

  wave.addEventListener("pointercancel", () => {
    state.drawing = false;
  });

  const onResize = (): void => {
    paint();
  };
  window.addEventListener("resize", onResize);

  syncFieldVisibility();
  paint();
}

mount();
