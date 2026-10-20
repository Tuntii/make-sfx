import { play } from "make-sfx-core/browser";
import {
  DEFAULT_FX_PARAMS,
  DEFAULT_MASTER_PARAMS,
  DEFAULT_SOUND_PARAMS,
  DEFAULT_TEXTURE_PARAMS,
  FX_PARAMETERS,
  MASTER_PARAMETERS,
  MODULATOR_TARGETS,
  PARAM_GROUPS,
  SYNTH_PARAMETERS,
  TEXTURE_FX_PARAMETERS,
  WAVE_SHAPES,
  DESIGN_PROFILES,
  getLayerParamSpecs,
  getModulatorParamSpecs,
  defineSound,
  encodeWav,
  paramsToZzfxArray,
  presetCatalog,
  renderSound,
  synthesizeFull,
  toConfigSnippet,
  type FxParams,
  type MasterParams,
  type ModulatorConfig,
  type OscillatorLayer,
  type PresetMeta,
  type SoundConfig,
  type SoundParams,
  type TextureParams,
} from "make-sfx-core";

const defaultOsc = (): OscillatorLayer => ({ enabled: false, mix: 0.5, detune: 0, delay: 0, params: {} });
const defaultLfo = (): ModulatorConfig => ({ enabled: false, target: "amplitude", rate: 4, depth: 0, shape: 0, phase: 0 });

let currentPreset: PresetMeta = presetCatalog[0];
let config: SoundConfig = {
  params: { ...currentPreset.params },
  fx: { ...DEFAULT_FX_PARAMS, ...currentPreset.fx },
  master: { ...DEFAULT_MASTER_PARAMS },
  texture: { ...DEFAULT_TEXTURE_PARAMS },
  oscillators: [defaultOsc(), defaultOsc(), defaultOsc()],
  modulators: [defaultLfo(), defaultLfo(), defaultLfo(), defaultLfo()],
};

const presetList = document.getElementById("preset-list")!;
const profileList = document.getElementById("profile-list")!;
const paramGroups = document.getElementById("param-groups")!;
const waveform = document.getElementById("waveform") as HTMLCanvasElement;
const envelope = document.getElementById("envelope") as HTMLCanvasElement;
const codePreview = document.getElementById("code-preview")!;
const searchInput = document.getElementById("search") as HTMLInputElement;

function makeSlider(
  spec: { key: string; labelTr: string; min: number; max: number; step: number; unit?: string; description: string; aiHint: string },
  getVal: () => number,
  setVal: (v: number) => void,
) {
  const row = document.createElement("div");
  row.className = "slider-row";
  const label = document.createElement("label");
  label.textContent = spec.labelTr;
  label.title = `${spec.description}\nAI: ${spec.aiHint}`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(getVal());
  const output = document.createElement("output");
  output.textContent = `${input.value}${spec.unit ? " " + spec.unit : ""}`;
  input.oninput = () => {
    setVal(Number(input.value));
    output.textContent = `${input.value}${spec.unit ? " " + spec.unit : ""}`;
    updatePreview();
    updateHash();
  };
  row.append(label, input, output);
  return row;
}

function renderParamGroups() {
  paramGroups.innerHTML = "";

  for (const group of PARAM_GROUPS) {
    const details = document.createElement("details");
    details.className = "param-group";
    details.open = ["oscillator", "envelope", "master", "textureFx", "postFx"].includes(group.id);

    const summary = document.createElement("summary");
    summary.textContent = group.labelTr;
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "group-body";

    if (group.id === "oscillator") {
      const select = document.createElement("select");
      select.className = "shape-select";
      for (const s of WAVE_SHAPES) {
        const opt = document.createElement("option");
        opt.value = String(s.value);
        opt.textContent = `${s.value}: ${s.label}`;
        select.appendChild(opt);
      }
      select.value = String(config.params.shape ?? 0);
      select.onchange = () => {
        config.params.shape = Number(select.value);
        updatePreview();
        updateHash();
      };
      body.appendChild(select);
    }

    if (group.id === "layers") {
      for (let li = 0; li < 3; li++) {
        const osc = config.oscillators![li];
        const hdr = document.createElement("div");
        hdr.className = "layer-header";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = osc.enabled ?? false;
        cb.onchange = () => {
          osc.enabled = cb.checked;
          updatePreview();
          updateHash();
        };
        hdr.append(cb, document.createTextNode(` OSC ${li + 2}`));
        body.appendChild(hdr);
        const layerSpecs = getLayerParamSpecs(li);
        for (const spec of layerSpecs.root) {
          body.appendChild(
            makeSlider(spec, () => {
              if (spec.key === "mix") return osc.mix ?? 0.5;
              if (spec.key === "detune") return osc.detune ?? 0;
              return osc.delay ?? 0;
            }, (v) => {
              if (spec.key === "mix") osc.mix = v;
              else if (spec.key === "detune") osc.detune = v;
              else osc.delay = v;
            }),
          );
        }
        for (const spec of layerSpecs.params) {
          body.appendChild(
            makeSlider(spec, () => (osc.params as Record<string, number>)?.[spec.key] ?? spec.default, (v) => {
              osc.params = { ...osc.params, [spec.key]: v };
            }),
          );
        }
      }
      details.appendChild(summary);
      details.appendChild(body);
      paramGroups.appendChild(details);
      continue;
    }

    if (group.id === "modulators") {
      for (let mi = 0; mi < 4; mi++) {
        const lfo = config.modulators![mi];
        const hdr = document.createElement("div");
        hdr.className = "layer-header";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = lfo.enabled ?? false;
        cb.onchange = () => {
          lfo.enabled = cb.checked;
          updatePreview();
          updateHash();
        };
        hdr.append(cb, document.createTextNode(` LFO ${mi + 1}`));
        body.appendChild(hdr);

        const sel = document.createElement("select");
        sel.className = "shape-select";
        for (const t of MODULATOR_TARGETS) {
          const opt = document.createElement("option");
          opt.value = t.value;
          opt.textContent = t.labelTr;
          sel.appendChild(opt);
        }
        sel.value = lfo.target ?? "amplitude";
        sel.onchange = () => {
          lfo.target = sel.value as ModulatorConfig["target"];
          updatePreview();
          updateHash();
        };
        body.appendChild(sel);

        for (const spec of getModulatorParamSpecs(mi)) {
          body.appendChild(
            makeSlider(spec, () => (lfo as Record<string, number>)[spec.key] ?? spec.default, (v) => {
              (lfo as Record<string, number>)[spec.key] = v;
            }),
          );
        }
      }
      details.appendChild(summary);
      details.appendChild(body);
      paramGroups.appendChild(details);
      continue;
    }

    const specs =
      group.id === "master" ? MASTER_PARAMETERS
      : group.id === "textureFx" ? TEXTURE_FX_PARAMETERS
      : group.id === "postFx" ? FX_PARAMETERS
      : SYNTH_PARAMETERS.filter((p) => p.group === group.id);

    for (const spec of specs) {
      if (spec.key === "shape") continue;
      const target =
        group.id === "master" ? (config.master as MasterParams)
        : group.id === "textureFx" ? (config.texture as TextureParams)
        : group.id === "postFx" ? (config.fx as FxParams)
        : config.params;
      body.appendChild(
        makeSlider(spec, () => (target as Record<string, number>)[spec.key] ?? spec.default, (v) => {
          (target as Record<string, number>)[spec.key] = v;
        }),
      );
    }

    details.appendChild(summary);
    details.appendChild(body);
    paramGroups.appendChild(details);
  }
}

function renderPresetList(filter = "") {
  const q = filter.toLowerCase();
  presetList.innerHTML = "";
  for (const p of presetCatalog.filter(
    (x) => !q || x.id.includes(q) || x.name.toLowerCase().includes(q) || x.tags.some((t) => t.toLowerCase().includes(q)),
  )) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = p.name;
    if (p.id === currentPreset.id) btn.className = "active";
    btn.onclick = () => loadPreset(p);
    li.appendChild(btn);
    presetList.appendChild(li);
  }
}

function renderProfiles() {
  profileList.innerHTML = "";
  for (const p of DESIGN_PROFILES) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.textContent = p.nameTr;
    btn.onclick = () => {
      config.params = { ...DEFAULT_SOUND_PARAMS, ...p.params };
      config.fx = { ...DEFAULT_FX_PARAMS, ...p.fx };
      updateAll();
    };
    li.appendChild(btn);
    profileList.appendChild(li);
  }
}

function loadPreset(p: PresetMeta) {
  currentPreset = p;
  config.params = { ...p.params };
  config.fx = { ...DEFAULT_FX_PARAMS, ...p.fx };
  config.master = { ...DEFAULT_MASTER_PARAMS, ...p.master };
  config.texture = { ...DEFAULT_TEXTURE_PARAMS, ...p.texture };
  config.voice = p.voice ? structuredClone(p.voice) : undefined;
  renderPresetList(searchInput.value);
  updateAll();
}

function drawWaveform(samples: Float32Array) {
  const ctx = waveform.getContext("2d")!;
  const { width, height } = waveform;
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#6ea8fe";
  ctx.beginPath();
  const mid = height / 2;
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x++) {
    const y = mid - (samples[x * step] ?? 0) * (height / 2 - 2);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawEnvelope() {
  const ctx = envelope.getContext("2d")!;
  const { width, height } = envelope;
  const m = config.master ?? {};
  const scale = m.duration && m.duration > 0
    ? m.duration / ((config.params.attack ?? 0) + (config.params.decay ?? 0) + (config.params.sustain ?? 0) + (config.params.release ?? 0.1) || 0.1)
    : m.durationScale ?? 1;
  const attack = (config.params.attack ?? 0) * scale;
  const decay = (config.params.decay ?? 0) * scale;
  const sustain = (config.params.sustain ?? 0) * scale;
  const release = (config.params.release ?? 0) * scale;
  const sustainVol = config.params.sustainVolume ?? 1;
  const total = attack + decay + sustain + release || 0.1;

  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, width, height);
  const pts = [
    [0, height], [0, 4],
    [(attack / total) * width, 4],
    [((attack + decay) / total) * width, height - sustainVol * (height - 8)],
    [((attack + decay + sustain) / total) * width, height - sustainVol * (height - 8)],
    [width, height],
  ];
  ctx.fillStyle = "rgba(110,168,254,0.25)";
  ctx.strokeStyle = "#6ea8fe";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (m.duration) {
    ctx.fillStyle = "#8fd48f";
    ctx.font = "10px system-ui";
    ctx.fillText(`${m.duration.toFixed(2)}s`, 4, 12);
  }
}

function updatePreview() {
  const samples = synthesizeFull(config);
  drawWaveform(samples);
  drawEnvelope();
  codePreview.textContent = toConfigSnippet(currentPreset.id, config);
}

function updateHash() {
  location.hash = encodeURIComponent(JSON.stringify({ preset: currentPreset.id, ...config }));
}

function updateAll() {
  renderParamGroups();
  updatePreview();
  updateHash();
}

searchInput.oninput = () => renderPresetList(searchInput.value);
document.getElementById("play-btn")!.onclick = () => play(config);
document.getElementById("download-btn")!.onclick = () => {
  const wav = renderSound(config);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([wav.buffer], { type: "audio/wav" }));
  a.download = `${currentPreset.id}.wav`;
  a.click();
};
document.getElementById("copy-btn")!.onclick = async () => {
  await navigator.clipboard.writeText(
    `${codePreview.textContent}\n\n// zzfx: ${JSON.stringify(paramsToZzfxArray(config.params))}`,
  );
};

// Quick A/B style micro-variation (seed). Addresses "random varyasyonlarla A/B test"
const variationSeed = document.createElement("button");
variationSeed.textContent = "🎲 Random variation (seed)";
variationSeed.style.marginLeft = "8px";
variationSeed.onclick = () => {
  const newSeed = (Date.now() % 900000) + 1000;
  (config as any).seed = newSeed;
  updatePreview();
  updateHash();
  console.log("[playground] variation seed =", newSeed);
};
const actions = document.getElementById("code-preview")?.parentElement;
if (actions) actions.appendChild(variationSeed);

renderPresetList();
renderProfiles();
renderParamGroups();
updatePreview();