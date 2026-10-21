/** @type {import('@adobe/premierepro').premierepro} */
const ppro = require("premierepro");

const VERSION = "1.7.1";

// ---------------------------------------------------------------------------
// Look definitions. Param keys are effect parameter display names, matched
// case-insensitively (exact, then prefix, then substring); "a|b" tries each.
// ---------------------------------------------------------------------------
const LOOKS = {
  ghost: {
    name: "Ghost Trail",
    desc: "Soft high-key B&W, dreamy smears",
    echo: { "echo time": -0.033, "number of echoes": 8, "starting intensity": 1, decay: 1 },
    // Used when Echo isn't available (Premiere 26+): late copies stacked above.
    trailLayers: [{ frames: 3, opacity: 45 }, { frames: 6, opacity: 25 }],
    lumetri: { exposure: 1.0, contrast: -25, highlights: 40, shadows: 35, whites: 55, blacks: 45, saturation: 0 },
    dirBlur: { "direction|angle": 55, "blur length|length|amount|strength": 18 },
    noise: { "amount of noise|amount": 8, "noise type|use color noise": false },
    glow: { blurriness: 70, opacity: 55 },
    slices: null,
  },
  shattered: {
    name: "Shattered Light",
    desc: "Blown-out B&W, offset glass slices",
    echo: { "echo time": -0.033, "number of echoes": 5, "starting intensity": 1, decay: 1 },
    trailLayers: [{ frames: 3, opacity: 35 }],
    lumetri: { exposure: 1.4, contrast: 60, highlights: 60, shadows: -45, whites: 80, blacks: -70, saturation: 0 },
    dirBlur: { "direction|angle": 70, "blur length|length|amount|strength": 10 },
    noise: { "amount of noise|amount": 12, "noise type|use color noise": false },
    glow: { blurriness: 45, opacity: 75 },
    // Band = region between two parallel Linear Wipes on a delayed, zoomed copy.
    slices: { scale: 112, exposureShift: -0.3, edgeA: 30, edgeB: 62, feather: 2, drift: 18 },
  },
};

// Custom looks run `apply(ctx)` instead of the layered Ghost/Shattered pipeline.
// `signature` = effects that mark a clip as already having the look.
Object.assign(LOOKS, {
  lowShutter: {
    name: "Low Shutter",
    desc: "Stepped 6 fps motion, soft smear, fade in",
    signature: ["posterizeTime"],
    apply: (ctx) => applyLowShutter(ctx),
  },
  thermal: {
    name: "Thermal",
    desc: "Heat-camera colors, grain, vignette",
    signature: ["lumetri", "gaussian"],
    apply: (ctx) => applyThermal(ctx),
  },
  led: {
    name: "LED Pixel",
    desc: "Pixel grid, RGB fringes, glow",
    signature: ["mosaic"],
    apply: (ctx) => applyLed(ctx),
  },
  diamond: {
    name: "Diamond X-Ray",
    desc: "Crystal sparkle, black and white",
    signature: ["blackWhite", "brightContrast"],
    apply: (ctx) => applyDiamond(ctx),
  },
  grain: {
    name: "Film Grain",
    desc: "Fine mono grain, adjustable",
    signature: null,
    apply: (ctx) => applyGrain(ctx),
  },
  hud: {
    name: "Tracking HUD",
    desc: "Editable sci-fi HUD over the clip",
    signature: null,
    apply: (ctx) => applyHud(ctx),
  },
});

const LETTERBOX_CROP = 12.8; // % top and bottom: 16:9 -> ~2.39:1

// key -> [display names to try, match names to try]. Names differ across
// Premiere versions (26.0 removed Echo and swapped some effects for Film Impact ones).
const EFFECTS = {
  echo: [["Echo", "Video Echo"], ["AE.ADBE Echo"]],
  lumetri: [["Lumetri Color"], ["AE.ADBE Lumetri"]],
  dirBlur: [["Directional Blur (Legacy)", "Directional Blur"], ["AE.ADBE Motion Blur"]],
  noise: [["Noise (Legacy)", "Noise"], ["AE.ADBE Noise2", "AE.ADBE Noise"]],
  posterizeTime: [["Posterize Time"], ["AE.ADBE Posterize Time"]],
  crop: [["Crop"], ["AE.ADBE AECrop", "PR.ADBE Crop"]],
  gaussian: [["Gaussian Blur (Legacy)", "Gaussian Blur"], ["AE.ADBE Gaussian Blur 2"]],
  linearWipe: [["Linear Wipe (Legacy)", "Linear Wipe"], ["AE.ADBE Linear Wipe"]],
  transform: [["Transform"], ["AE.ADBE Geometry2"]],
  mosaic: [["Mosaic (Legacy)", "Mosaic"], ["AE.ADBE Mosaic"]],
  rgbSplit: [["RGB Split"], ["AE.Impact_RGB_Split_FX"]],
  wonderGlow: [["Wonder Glow"], ["AE.Impact_Wonder_Glow_FX"]],
  glint: [["Glint"], ["AE.Impact_Glint_FX"]],
  blackWhite: [["Black & White"], ["AE.ADBE Black & White"]],
  brightContrast: [["Brightness & Contrast"], ["AE.ADBE Brightness & Contrast 2"]],
  sharpen: [["Sharpen"], ["AE.ADBE Sharpen"]],
};
const effectLabel = (key) => EFFECTS[key][0][0];

// ---------------------------------------------------------------------------
// Logging, status, options
// ---------------------------------------------------------------------------
const logLines = [];

function log(msg, cls) {
  console.log(msg);
  logLines.push(msg);
  const el = document.getElementById("log");
  if (!el) return;
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

// One-line summary under the buttons: busy | ok | warn | err.
function status(msg, cls) {
  const el = document.getElementById("status");
  if (!el) return;
  el.className = `status ${cls || ""}`;
  el.textContent = msg;
}

function errText(e) {
  return (e && (e.message || e.toString())) || String(e);
}

const OPTION_IDS = ["opt-grain", "opt-fadein", "opt-autoadd", "opt-glow", "opt-letterbox", "opt-drift", "opt-trails", "opt-delay", "opt-angle", "opt-echo-op", "opt-screen"];

function readOptions() {
  const num = (id, d) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? d : v;
  };
  const on = (id) => !!document.getElementById(id).checked;
  return {
    autoAdd: on("opt-autoadd"),
    fadeIn: on("opt-fadein"),
    grain: Math.round(num("opt-grain", 4) * 10) / 10,
    glow: on("opt-glow"),
    letterbox: on("opt-letterbox"),
    drift: on("opt-drift"),
    trails: on("opt-trails"),
    delayFrames: Math.max(0, Math.round(num("opt-delay", 8))),
    angle: num("opt-angle", 17),
    echoOperator: num("opt-echo-op", 7),
    screenBlend: num("opt-screen", 8),
  };
}

function saveOptions() {
  try {
    const o = {};
    for (const id of OPTION_IDS) {
      const el = document.getElementById(id);
      o[id] = el.tagName.toLowerCase() === "sp-checkbox" ? !!el.checked : el.value;
    }
    localStorage.setItem("vizzfx-options", JSON.stringify(o));
  } catch (e) { /* storage unavailable: defaults are fine */ }
}

function loadOptions() {
  try {
    const o = JSON.parse(localStorage.getItem("vizzfx-options") || "{}");
    for (const id of OPTION_IDS) {
      if (!(id in o)) continue;
      const el = document.getElementById(id);
      if (el.tagName.toLowerCase() === "sp-checkbox") el.checked = !!o[id];
      else el.value = o[id];
    }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Premiere helpers
// ---------------------------------------------------------------------------
async function getContext() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Open a project first.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Open a sequence first.");
  return { project, sequence };
}

async function getSelectedVideoClips(sequence) {
  const selection = await sequence.getSelection();
  const items = await selection.getTrackItems();
  let video = items.filter((i) => i instanceof ppro.VideoClipTrackItem);
  if (!video.length) {
    // Fallback when instanceof doesn't work across the API boundary.
    for (const i of items) {
      try {
        if ((await i.getMediaType()) === ppro.Constants.MediaType.VIDEO) video.push(i);
      } catch (e) { /* not a clip */ }
    }
  }
  log(`  selection: ${items.length} item(s), ${video.length} video`);
  return video;
}

// One undoable step. Returns true on success.
function transact(project, label, build) {
  let ok = false;
  project.lockedAccess(() => {
    ok = project.executeTransaction((compoundAction) => build(compoundAction), label);
  });
  return ok;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

let effectList = null;
async function getEffectList() {
  if (!effectList) {
    const matches = await ppro.VideoFilterFactory.getMatchNames();
    const displays = await ppro.VideoFilterFactory.getDisplayNames();
    effectList = { matches, displays };
  }
  return effectList;
}

// Match name for an effect key, or null if this Premiere doesn't have it.
const resolved = {};
async function resolveEffect(key) {
  if (key in resolved) return resolved[key];
  const [displayNames, candidates] = EFFECTS[key];
  const { matches, displays } = await getEffectList();
  let found = null;
  for (const c of candidates) {
    const i = matches.findIndex((m) => norm(m) === norm(c));
    if (i >= 0) { found = matches[i]; break; }
  }
  if (!found) {
    for (const d of displayNames) {
      const i = displays.findIndex((x) => norm(x) === norm(d));
      if (i >= 0 && matches[i]) { found = matches[i]; break; }
    }
  }
  if (!found) {
    // Loose: a match name that ends with the effect's name, e.g. "XX.Vendor Directional Blur".
    for (const d of displayNames) {
      const i = matches.findIndex((m) => norm(m).endsWith(norm(d)));
      if (i >= 0) { found = matches[i]; break; }
    }
  }
  resolved[key] = found;
  if (found) log(`  ${effectLabel(key)} → ${found}`);
  else log(`  ${effectLabel(key)}: not in this Premiere, skipped`, "warn");
  return found;
}

async function listComponents(item) {
  const chain = await item.getComponentChain();
  const n = chain.getComponentCount();
  const out = [];
  for (let i = 0; i < n; i++) {
    const comp = chain.getComponentAtIndex(i);
    out.push({ comp, index: i, match: await comp.getMatchName(), name: await comp.getDisplayName() });
  }
  return out;
}

// Last component of this kind on the clip (the one just added), or null.
const INTRINSIC = { opacity: "AE.ADBE Opacity", motion: "AE.ADBE Motion" };

async function findComponent(item, key) {
  const match = INTRINSIC[key] || (await resolveEffect(key));
  if (!match) return null;
  const comps = await listComponents(item);
  for (let i = comps.length - 1; i >= 0; i--) {
    const c = comps[i];
    if (c.match === match || (INTRINSIC[key] && c.name.toLowerCase() === key)) return c;
  }
  return null;
}

async function findComponents(item, key) {
  const match = await resolveEffect(key);
  if (!match) return [];
  return (await listComponents(item)).filter((c) => c.match === match);
}

// Insert available effects at `atIndex` (default: end of chain), in order.
// Tries insert, append, then one-by-one; throws with Premiere's error if all fail.
async function addEffects(project, item, keys, atIndex) {
  const available = [];
  for (const k of keys) if (await resolveEffect(k)) available.push(k);
  if (!available.length) return [];
  const label = available.map(effectLabel).join(", ");
  log(`  adding ${label}`);

  const attempts = [
    ["insert", (chain, comps) => {
      let i = atIndex === undefined ? chain.getComponentCount() : atIndex;
      return (ca) => { for (const c of comps) ca.addAction(chain.createInsertComponentAction(c, i++)); };
    }],
  ];
  if (atIndex === undefined) {
    attempts.push(["append", (chain, comps) => (ca) => {
      for (const c of comps) ca.addAction(chain.createAppendComponentAction(c));
    }]);
  }
  let lastErr = null;
  for (const [how, makeBuild] of attempts) {
    try {
      const chain = await item.getComponentChain();
      const comps = [];
      for (const k of available) comps.push(await ppro.VideoFilterFactory.createComponent(await resolveEffect(k)));
      if (transact(project, `VizzFX: add ${label}`, makeBuild(chain, comps))) return available;
      lastErr = new Error("Premiere returned false");
    } catch (e) {
      lastErr = e;
    }
    log(`  · ${how} failed: ${errText(lastErr)}`, "warn");
  }
  if (atIndex === undefined && available.length > 1) {
    try {
      for (const k of available) {
        const chain = await item.getComponentChain();
        const comp = await ppro.VideoFilterFactory.createComponent(await resolveEffect(k));
        const ok = transact(project, `VizzFX: add ${effectLabel(k)}`, (ca) =>
          ca.addAction(chain.createInsertComponentAction(comp, chain.getComponentCount())));
        if (!ok) throw new Error("Premiere returned false");
      }
      return available;
    } catch (e) {
      lastErr = e;
      log(`  · one-by-one failed: ${errText(lastErr)}`, "warn");
    }
  }
  throw new Error(`Could not add ${label}: ${errText(lastErr)}`);
}

function findParam(comp, key) {
  if (key.includes("|")) {
    for (const alt of key.split("|")) {
      const p = findParam(comp, alt);
      if (p) return p;
    }
    return null;
  }
  const k = key.toLowerCase();
  const params = [];
  for (let i = 0; i < comp.getParamCount(); i++) params.push(comp.getParam(i));
  const name = (p) => (p.displayName || "").toLowerCase().trim();
  return (
    params.find((p) => name(p) === k) ||
    params.find((p) => name(p).startsWith(k)) ||
    params.find((p) => name(p).includes(k)) ||
    null
  );
}

// Set static values; one undo step, falling back param-by-param.
function setParams(project, comp, values, label) {
  const targets = [];
  for (const [key, val] of Object.entries(values)) {
    const p = findParam(comp, key);
    if (!p) log(`  ? ${label}: no "${key.split("|")[0]}" parameter`, "warn");
    else targets.push([p, val]);
  }
  if (!targets.length) return;
  try {
    const ok = transact(project, `VizzFX: ${label}`, (ca) => {
      for (const [p, v] of targets) ca.addAction(p.createSetValueAction(p.createKeyframe(v), true));
    });
    if (ok) return;
  } catch (e) { /* retry individually below */ }
  for (const [p, v] of targets) {
    try {
      transact(project, `VizzFX: ${p.displayName}`, (ca) => ca.addAction(p.createSetTimeVaryingAction(false)));
      const ok = transact(project, `VizzFX: ${p.displayName}`, (ca) =>
        ca.addAction(p.createSetValueAction(p.createKeyframe(v), true)));
      if (!ok) log(`  ! ${label}: could not set ${p.displayName}`, "warn");
    } catch (e) {
      log(`  ! ${label}: ${p.displayName}: ${errText(e)}`, "warn");
    }
  }
}

// Set params on the effect of this kind if the clip has it.
async function configure(project, item, key, values, label) {
  const c = await findComponent(item, key);
  if (c) setParams(project, c.comp, values, label || (INTRINSIC[key] ? key : effectLabel(key)));
  return !!c;
}

// Two keyframes from clip start to clip end (clip-relative media time).
async function animateParam(project, item, comp, key, from, to, label) {
  const p = findParam(comp, key);
  if (!p) return log(`  ? ${label}: no "${key}" parameter`, "warn");
  const inPoint = await item.getInPoint();
  const dur = await item.getDuration();
  try {
    transact(project, `VizzFX: animate ${label}`, (ca) => ca.addAction(p.createSetTimeVaryingAction(true)));
    transact(project, `VizzFX: animate ${label}`, (ca) => {
      const k1 = p.createKeyframe(from);
      k1.position = inPoint;
      const k2 = p.createKeyframe(to);
      k2.position = inPoint.add(dur);
      ca.addAction(p.createAddKeyframeAction(k1));
      ca.addAction(p.createAddKeyframeAction(k2));
    });
  } catch (e) {
    log(`  ! could not animate ${label}: ${errText(e)}`, "warn");
  }
}

async function fpsOf(sequence) {
  try {
    const ticksPerFrame = Number(await sequence.getTimebase());
    if (ticksPerFrame > 0) return 254016000000 / ticksPerFrame;
  } catch (e) { /* fall through */ }
  return 30;
}

async function itemsOnTrack(track) {
  return await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
}

async function nameOf(item) {
  try {
    return await item.getName();
  } catch (e) {
    return "clip";
  }
}

// Names of clips on `track` overlapping [start, end] seconds.
async function clipsInRange(track, start, end) {
  const names = [];
  for (const it of await itemsOnTrack(track)) {
    const s = (await it.getStartTime()).seconds;
    const e = (await it.getEndTime()).seconds;
    if (s < end - 1e-6 && e > start + 1e-6) names.push(await nameOf(it));
  }
  return names;
}

// "kind:trackIndex:startTicks" for every clip, to spot items an action created.
async function snapshot(sequence, kind) {
  const keys = new Set();
  const video = kind === "video";
  const n = video ? await sequence.getVideoTrackCount() : await sequence.getAudioTrackCount();
  for (let t = 0; t < n; t++) {
    const track = video ? await sequence.getVideoTrack(t) : await sequence.getAudioTrack(t);
    for (const it of await itemsOnTrack(track)) keys.add(`${t}:${(await it.getStartTime()).ticks}`);
  }
  return keys;
}

async function newItems(sequence, kind, before, start, fps) {
  const out = [];
  const video = kind === "video";
  const n = video ? await sequence.getVideoTrackCount() : await sequence.getAudioTrackCount();
  for (let t = 0; t < n; t++) {
    const track = video ? await sequence.getVideoTrack(t) : await sequence.getAudioTrack(t);
    for (const it of await itemsOnTrack(track)) {
      const st = await it.getStartTime();
      if (!before.has(`${t}:${st.ticks}`) && Math.abs(st.seconds - start) < 0.5 / fps) out.push({ item: it, track: t });
    }
  }
  return out;
}

function removeItems(project, sequence, items, mediaType, label) {
  if (!items.length) return;
  const editor = ppro.SequenceEditor.getEditor(sequence);
  ppro.TrackItemSelection.createEmptySelection((sel) => {
    for (const it of items) sel.addItem(it);
    transact(project, label, (ca) => ca.addAction(editor.createRemoveItemsAction(sel, false, mediaType, false)));
  });
}

// --- Track planning --------------------------------------------------------
// Most important first; dropped from the end when tracks run out.
const LAYER_PRIORITY = ["hud", "slice", "trail1", "glow", "trail2"];

function buildLayers(look, opts, hasEcho, hasWipe, fps) {
  const layers = [];
  if (!hasEcho && opts.trails) {
    look.trailLayers.forEach((layer, i) =>
      layers.push({ id: `trail${i + 1}`, kind: "trail", label: `trail ${i + 1}`, layer, offset: layer.frames / fps }));
  }
  if (look.slices && hasWipe) layers.push({ id: "slice", kind: "slice", label: "slices", offset: opts.delayFrames / fps });
  if (opts.glow) layers.push({ id: "glow", kind: "glow", label: "glow", offset: 0 });
  return layers;
}

// Give each layer (bottom to top) the next track above the clip that is empty
// over the clip's time range; tracks with other clips are skipped.
async function assignTracks(sequence, item, layers) {
  const base = await item.getTrackIndex();
  const count = await sequence.getVideoTrackCount();
  const start = (await item.getStartTime()).seconds;
  const end = (await item.getEndTime()).seconds;
  const busy = [];
  let t = base + 1;
  for (const l of layers) {
    l.target = null;
    while (t < count) {
      const names = await clipsInRange(await sequence.getVideoTrack(t), start, end + l.offset);
      if (!names.length) {
        l.target = t++;
        break;
      }
      busy.push({ index: t, names });
      t++;
    }
  }
  const missing = layers.filter((l) => l.target === null);
  const top = Math.max(-1, ...layers.filter((l) => l.target !== null).map((l) => l.target));
  // Busy tracks end up under (and covered by) our layers.
  const covered = missing.length ? busy : busy.filter((b) => b.index < top);
  return { base, count, start, end, missing, covered };
}

// --- Experimental: add a track by duplicating onto the slot above the top track.
let hostVersion = "";

function autoAddKnown() {
  try {
    const s = JSON.parse(localStorage.getItem("vizzfx-autoadd") || "null");
    return s && s.host === hostVersion ? s.ok : null;
  } catch (e) {
    return null;
  }
}

function rememberAutoAdd(ok) {
  try {
    localStorage.setItem("vizzfx-autoadd", JSON.stringify({ host: hostVersion, ok }));
  } catch (e) { /* not remembered: probe again next time */ }
}

// Returns true if a new empty video track now exists at the top.
async function tryAddTrack(project, sequence, item, fps) {
  const count = await sequence.getVideoTrackCount();
  const base = await item.getTrackIndex();
  const start = (await item.getStartTime()).seconds;
  const end = (await item.getEndTime()).seconds;
  // If Premiere drops the copy onto an existing track instead, it must land on empty space.
  if ((await clipsInRange(await sequence.getVideoTrack(count - 1), start, end)).length) {
    log(`  auto-add skipped: top track V${count} has clips here`, "warn");
    return false;
  }
  const videoBefore = await snapshot(sequence, "video");
  const audioBefore = await snapshot(sequence, "audio");
  const editor = ppro.SequenceEditor.getEditor(sequence);
  let err = null;
  try {
    transact(project, "VizzFX: add track", (ca) =>
      ca.addAction(editor.createCloneTrackItemAction(item, ppro.TickTime.createWithSeconds(0), count - base, 1, true, false)));
  } catch (e) {
    err = e;
  }
  // Remove the probe copy (and any linked audio); a newly created track stays.
  removeItems(project, sequence, (await newItems(sequence, "video", videoBefore, start, fps)).map((x) => x.item),
    ppro.Constants.MediaType.VIDEO, "VizzFX: remove probe");
  removeItems(project, sequence, (await newItems(sequence, "audio", audioBefore, start, fps)).map((x) => x.item),
    ppro.Constants.MediaType.AUDIO, "VizzFX: remove probe audio");
  const added = (await sequence.getVideoTrackCount()) > count;
  rememberAutoAdd(added);
  log(added ? `  added track V${count + 1}` : `  auto-add not supported${err ? `: ${errText(err)}` : ""}`, added ? "ok" : "warn");
  return added;
}

// --- Dialog ----------------------------------------------------------------
async function confirmDialog(title, text, okLabel) {
  const dlg = document.getElementById("confirm");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-text").textContent = text;
  document.getElementById("confirm-ok").textContent = okLabel;
  const res = await dlg.uxpShowModal({ title: "VizzFX", resize: "none", size: { width: 400, height: 260 } });
  return res === "ok";
}

async function alreadyHasLook(item, look) {
  const keys = look.signature === undefined ? ["lumetri", "dirBlur"] : look.signature;
  if (!keys || !keys.length) return false;
  const matches = (await listComponents(item)).map((c) => c.match);
  for (const k of keys) {
    const m = await resolveEffect(k);
    if (m && !matches.includes(m)) return false;
  }
  return true;
}

// Ask before covering clips that already sit on tracks above.
async function confirmCovered(plan, layers) {
  const list = plan.covered.map((b) => `V${b.index + 1} (${b.names.slice(0, 2).join(", ")})`).join(", ");
  const many = plan.covered.length > 1;
  const where = layers.every((l) => l.target !== null)
    ? ` (on ${layers.map((l) => `V${l.target + 1}`).join(", ")})`
    : "";
  return confirmDialog(
    "Tracks above are in use",
    `${list} already ${many ? "have" : "has"} clips over this part of the timeline. ` +
      `The FX layers will be placed above ${many ? "them" : "it"}${where} and will cover ${many ? "them" : "it"}.`,
    "Continue"
  );
}

// Make sure every layer has a track; returns layers to build, or null if cancelled.
// Questions come before any change, so Cancel leaves the timeline untouched.
async function prepareTracks(project, sequence, item, layers, opts, fps) {
  let plan = await assignTracks(sequence, item, layers);
  let askedCovered = false;
  if (plan.covered.length) {
    if (!(await confirmCovered(plan, layers))) return null;
    askedCovered = true;
  }

  if (plan.missing.length) {
    const byPriority = [...layers].sort((a, b) => LAYER_PRIORITY.indexOf(a.id) - LAYER_PRIORITY.indexOf(b.id));
    const drop = byPriority.slice(layers.length - plan.missing.length);
    const free = layers.length - plan.missing.length;
    const n = plan.missing.length;
    const message = (why) =>
      `This look uses ${layers.length} layers above the clip, but only ${free} free track${free === 1 ? " is" : "s are"} available. ` +
      `${why}Add ${n} video track${n > 1 ? "s" : ""} (right-click a track header > Add Tracks), ` +
      `or build now without: ${drop.map((l) => l.label).join(", ")}.`;
    const dropLabel = `Build without ${drop.map((l) => l.label).join(", ")}`;

    let added = false;
    if (opts.autoAdd && autoAddKnown() !== false) {
      // The probe adds nothing when it fails, and only empty tracks when it works.
      for (let i = 0; i < n; i++) {
        if (!(await tryAddTrack(project, sequence, item, fps))) break;
      }
      plan = await assignTracks(sequence, item, layers);
      added = !plan.missing.length;
    }
    if (!added) {
      const why = opts.autoAdd && autoAddKnown() === false ? "This Premiere doesn't let plugins add tracks. " : "";
      if (!(await confirmDialog("Not enough video tracks", message(why), dropLabel))) return null;
      layers = layers.filter((l) => !drop.includes(l));
      plan = await assignTracks(sequence, item, layers);
    }
  }

  if (plan.covered.length && !askedCovered && !(await confirmCovered(plan, layers))) return null;
  return layers;
}

// Duplicate `item` onto video track `target`, `offsetSec` later, trimmed to the original end.
async function cloneTo(project, sequence, item, target, offsetSec, fps) {
  const base = await item.getTrackIndex();
  const start = (await item.getStartTime()).seconds + offsetSec;
  const track = await sequence.getVideoTrack(target);
  const end = (await item.getEndTime()).seconds;
  if ((await clipsInRange(track, start - offsetSec, end + offsetSec)).length) {
    throw new Error(`V${target + 1} is no longer empty here.`);
  }

  const audioBefore = await snapshot(sequence, "audio");
  const editor = ppro.SequenceEditor.getEditor(sequence);
  // Audio offset fixed at 1: any duplicated linked audio is removed below.
  const ok = transact(project, "VizzFX: duplicate layer", (ca) => {
    ca.addAction(editor.createCloneTrackItemAction(item, ppro.TickTime.createWithSeconds(offsetSec), target - base, 1, true, false));
  });
  if (!ok) throw new Error("Premiere refused to duplicate the clip.");

  let clone = null;
  for (const it of await itemsOnTrack(track)) {
    if (Math.abs((await it.getStartTime()).seconds - start) < 0.5 / fps) clone = it;
  }
  if (!clone) throw new Error(`Duplicated clip not found on V${target + 1}.`);

  if (offsetSec > 0) {
    const endTime = await item.getEndTime();
    transact(project, "VizzFX: trim layer", (ca) => ca.addAction(clone.createSetEndAction(endTime)));
  }
  try {
    removeItems(project, sequence, (await newItems(sequence, "audio", audioBefore, start, fps)).map((x) => x.item),
      ppro.Constants.MediaType.AUDIO, "VizzFX: remove duplicate audio");
  } catch (e) {
    log("  ! a duplicate audio clip may remain on an audio track; delete it by hand.", "warn");
  }
  return clone;
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------
async function applyBaseLook(project, item, look, opts, hasEcho) {
  const keys = hasEcho ? ["echo", "lumetri", "dirBlur", "noise"] : ["lumetri", "dirBlur", "noise"];
  if (opts.letterbox) keys.push("crop");
  await addEffects(project, item, keys);

  if (hasEcho) await configure(project, item, "echo", { ...look.echo, "echo operator": opts.echoOperator });
  await configure(project, item, "lumetri", look.lumetri);
  await configure(project, item, "dirBlur", look.dirBlur);
  await configure(project, item, "noise", look.noise);
  if (opts.letterbox) await configure(project, item, "crop", { top: LETTERBOX_CROP, bottom: LETTERBOX_CROP });
  log("  base look applied", "ok");
}

// Echo replacement: late copies with reduced opacity blend into ghost trails.
async function addTrailLayer(project, sequence, item, layer, target, fps) {
  const clone = await cloneTo(project, sequence, item, target, layer.frames / fps, fps);
  await configure(project, clone, "opacity", { opacity: layer.opacity });
  log(`  trail layer on V${target + 1} (${layer.frames} frames late, ${layer.opacity}%)`, "ok");
}

async function addSliceLayer(project, sequence, item, look, opts, target, fps) {
  const s = look.slices;
  const clone = await cloneTo(project, sequence, item, target, opts.delayFrames / fps, fps);

  // Zoom before the look's own effects so the letterbox stays put.
  const lum = (await findComponents(clone, "lumetri"))[0];
  await addEffects(project, clone, ["transform"], lum ? lum.index : undefined);
  await configure(project, clone, "transform", { scale: s.scale });
  await configure(project, clone, "lumetri", { exposure: look.lumetri.exposure + s.exposureShift }, "Slice tone");

  // Two opposite linear wipes leave a diagonal band.
  await addEffects(project, clone, ["linearWipe", "linearWipe"]);
  const [wipeA, wipeB] = (await findComponents(clone, "linearWipe")).slice(-2);
  setParams(project, wipeA.comp, { "transition completion": s.edgeA, "wipe angle": opts.angle, feather: s.feather }, "Linear Wipe A");
  setParams(project, wipeB.comp, { "transition completion": 100 - s.edgeB, "wipe angle": opts.angle + 180, feather: s.feather }, "Linear Wipe B");
  if (opts.drift) {
    await animateParam(project, clone, wipeA.comp, "transition completion", s.edgeA - s.drift, s.edgeA + s.drift, "slice edge A");
    await animateParam(project, clone, wipeB.comp, "transition completion", 100 - s.edgeB + s.drift, 100 - s.edgeB - s.drift, "slice edge B");
  }
  log(`  slice layer on V${target + 1} (${opts.delayFrames} frames late)`, "ok");
}

async function addGlowLayer(project, sequence, item, look, opts, target, fps) {
  const clone = await cloneTo(project, sequence, item, target, 0, fps);
  await addEffects(project, clone, ["gaussian"]);
  await configure(project, clone, "gaussian", { blurriness: look.glow.blurriness, "repeat edge pixels": true });
  if (!(await configure(project, clone, "opacity", { opacity: look.glow.opacity, "blend mode": opts.screenBlend }))) {
    log("  ? Opacity not found; set Blend Mode to Screen by hand.", "warn");
  }
  log(`  glow layer on V${target + 1}`, "ok");
}

// ---------------------------------------------------------------------------
// Custom looks (from reference edits)
// ---------------------------------------------------------------------------
const THERMAL_LUT = "VizzFX_Thermal.cube";
const HUD_MOGRT = "VizzFX_HUD.mogrt";

async function pluginFile(rel) {
  try {
    const folder = await require("uxp").storage.localFileSystem.getPluginFolder();
    return `${folder.nativePath}/${rel}`;
  } catch (e) {
    return null;
  }
}

// Fade from black at the clip start using Premiere's own Dip to Black transition.
async function addDipFromBlack(project, item, seconds) {
  try {
    const names = await ppro.TransitionFactory.getVideoTransitionMatchNames();
    const match = names.find((n) => /dip.*black/i.test(n));
    if (!match) return log("  ? no Dip to Black transition found; skipped fade", "warn");
    const transition = await ppro.TransitionFactory.createVideoTransition(match);
    const options = ppro.AddTransitionOptions();
    options.setApplyToStart(true);
    options.setDuration(ppro.TickTime.createWithSeconds(seconds));
    transact(project, "VizzFX: fade in", (ca) => ca.addAction(item.createAddVideoTransitionAction(transition, options)));
    log(`  fade in from black (${seconds}s)`, "ok");
  } catch (e) {
    log(`  ! fade in skipped: ${errText(e)}`, "warn");
  }
}

// Shot 1 of the reference: motion steps at 6 fps, frames soft and smeared, grain, fade up.
async function applyLowShutter({ project, item, opts }) {
  if (!(await resolveEffect("posterizeTime"))) throw new Error("Posterize Time is missing in this Premiere.");
  await addEffects(project, item, ["posterizeTime", "gaussian", "dirBlur", "lumetri", "noise"]);
  await configure(project, item, "posterizeTime", { "frame rate": 6 });
  await configure(project, item, "gaussian", { blurriness: 4, "repeat edge pixels": true });
  await configure(project, item, "dirBlur", { "direction|angle": 90, "blur length|length": 8 });
  await configure(project, item, "lumetri", { contrast: 15, blacks: -15, saturation: 95 });
  await configure(project, item, "noise", { "amount of noise|amount": 6, "noise type|use color noise": false });
  if (opts.fadeIn) await addDipFromBlack(project, item, 0.4);
  log("  low shutter applied", "ok");
  return true;
}

// Shot 3: heat-camera palette through a LUT in Lumetri, softened, with grain and vignette.
async function applyThermal({ project, item }) {
  await addEffects(project, item, ["gaussian", "lumetri", "noise"]);
  await configure(project, item, "gaussian", { blurriness: 3, "repeat edge pixels": true });
  await configure(project, item, "noise", { "amount of noise|amount": 10, "noise type|use color noise": false });

  const lut = await pluginFile(`luts/${THERMAL_LUT}`);
  const lum = await findComponent(item, "lumetri");
  let lutSet = false;
  if (lum && lut) {
    const p = findParam(lum.comp, "input lut|look");
    if (p) {
      try {
        transact(project, "VizzFX: thermal LUT", (ca) => ca.addAction(p.createSetValueAction(p.createKeyframe(lut), true)));
        // Only trust it if the value reads back as our file.
        const kf = await p.getStartValue();
        lutSet = String(kf && kf.value ? kf.value.value : kf).includes(THERMAL_LUT);
      } catch (e) {
        log(`  · LUT could not be set automatically: ${errText(e)}`, "warn");
      }
    }
  }
  if (lum) setParams(project, lum.comp, { amount: -1.4 }, "Vignette");
  log("  thermal effects applied", "ok");

  if (!lutSet) {
    const saved = await offerLutCopy();
    LOOKS.thermal.doneMessage = saved
      ? `Thermal added. Now pick ${THERMAL_LUT} in Lumetri > Input LUT > Browse.`
      : "Thermal added. Pick the LUT in Lumetri to finish.";
  }
  return true;
}

// Premiere won't let plugins load a LUT, and the plugin's own folder is hidden,
// so offer to save a copy of the LUT wherever the user likes, then they browse to it once.
async function offerLutCopy() {
  let known = null;
  try {
    known = localStorage.getItem("vizzfx-lut-path");
  } catch (e) { /* no storage */ }
  const text = known
    ? `Premiere doesn't let plugins load a LUT. Pick it once: Lumetri Color > Basic Correction > Input LUT > Browse, ` +
      `and choose ${known}. Then save the effects as a preset so you never repeat this.`
    : "Premiere doesn't let plugins load a LUT, so this takes one manual step. Save the LUT file somewhere easy " +
      "(like Documents), then pick it in Lumetri Color > Basic Correction > Input LUT > Browse. " +
      "Afterwards, save the effects as a preset so you never repeat this.";
  const go = await confirmDialog("One step to finish Thermal", text, known ? "OK" : "Save LUT file…");
  if (!go || known) return !!known;
  try {
    const lfs = require("uxp").storage.localFileSystem;
    const src = await (await lfs.getPluginFolder()).getEntry(`luts/${THERMAL_LUT}`);
    const data = await src.read();
    const dest = await lfs.getFileForSaving(THERMAL_LUT, { types: ["cube"] });
    if (!dest) return false;
    await dest.write(data);
    const where = dest.nativePath || dest.name;
    try {
      localStorage.setItem("vizzfx-lut-path", where);
    } catch (e) { /* not remembered */ }
    log(`  LUT saved: ${where}`, "ok");
    return true;
  } catch (e) {
    log(`  ! could not save the LUT: ${errText(e)}. Download it from github.com/visuraW/vizzfx (plugin/luts).`, "warn");
    return false;
  }
}

// Grain matched to the reference flyer: monochrome, ~1px, luma std ~4.6/255.
// Re-applying updates the existing grain instead of stacking another Noise.
async function applyGrain({ project, item, opts }) {
  const amount = { "amount of noise|amount": opts.grain, "noise type|use color noise": false, clipping: true };
  if (await configure(project, item, "noise", amount)) {
    log(`  grain updated to ${opts.grain}`, "ok");
  } else {
    await addEffects(project, item, ["noise"]);
    await configure(project, item, "noise", amount);
    log(`  grain added (${opts.grain})`, "ok");
  }
  LOOKS.grain.doneMessage = `Grain set to ${opts.grain}. Drag the slider to change it.`;
  return true;
}

// Slider: live-update grain on selected clips that already have it.
async function updateGrainLive() {
  const opts = readOptions();
  saveOptions();
  try {
    const { project, sequence } = await getContext();
    let n = 0;
    for (const item of await getSelectedVideoClips(sequence)) {
      const c = await findComponent(item, "noise");
      if (!c) continue;
      setParams(project, c.comp, { "amount of noise|amount": opts.grain }, "Grain");
      n++;
    }
    status(n ? `Grain ${opts.grain} on ${n} clip${n > 1 ? "s" : ""}.` : `Grain ${opts.grain}. Click Film Grain to apply.`, n ? "ok" : "");
  } catch (e) {
    status(`Grain ${opts.grain}`, "");
  }
}

// HUD: inserts the VizzFX HUD template on a free track above the clip, trimmed to the clip.
async function hudPath() {
  try {
    const folder = await require("uxp").storage.localFileSystem.getPluginFolder();
    const entry = await folder.getEntry(`mogrt/${HUD_MOGRT}`);
    if (entry) return entry.nativePath;
  } catch (e) { /* not bundled */ }
  try {
    const saved = localStorage.getItem("vizzfx-hud-path");
    if (saved) return saved;
  } catch (e) { /* no storage */ }
  const pick = await confirmDialog(
    "HUD template not found",
    "Build it once in After Effects with after-effects/build-hud-mogrt.jsx (it exports VizzFX_HUD.mogrt to your Desktop), then pick that file.",
    "Choose .mogrt file"
  );
  if (!pick) return null;
  const file = await require("uxp").storage.localFileSystem.getFileForOpening({ types: ["mogrt"] });
  if (!file) return null;
  try {
    localStorage.setItem("vizzfx-hud-path", file.nativePath);
  } catch (e) { /* not remembered */ }
  return file.nativePath;
}

async function applyHud({ project, sequence, item, opts, fps }) {
  const layers = await prepareTracks(project, sequence, item, [{ id: "hud", kind: "hud", label: "HUD", offset: 0 }], opts, fps);
  if (!layers || !layers.length) return false;
  const path = await hudPath();
  if (!path) return false;

  const target = layers[0].target;
  const start = await item.getStartTime();
  const editor = ppro.SequenceEditor.getEditor(sequence);
  let inserted = [];
  try {
    project.lockedAccess(() => {
      inserted = editor.insertMogrtFromPath(path, start, target, 0) || [];
    });
  } catch (e) {
    log(`  · insert under lock failed (${errText(e)}), retrying`, "warn");
    inserted = editor.insertMogrtFromPath(path, start, target, 0) || [];
  }
  const hud = inserted.find((i) => i instanceof ppro.VideoClipTrackItem) || inserted[0];
  if (!hud) throw new Error("Premiere didn't insert the HUD template.");
  const end = await item.getEndTime();
  transact(project, "VizzFX: trim HUD", (ca) => ca.addAction(hud.createSetEndAction(end)));
  log(`  HUD on V${target + 1}`, "ok");
  log("  Edit its text, box position and size in Window > Essential Graphics.");
  log("  To track a face: keyframe Box Center (and Box Size) there.");
  LOOKS.hud.doneMessage = "HUD added. Edit text and box in Essential Graphics.";
  return true;
}

// ---------------------------------------------------------------------------
// LED Pixel and Diamond X-Ray, with live sliders
// ---------------------------------------------------------------------------
const LED_MOGRT = "VizzFX_LED_Grid.mogrt";

async function frameSize(sequence) {
  try {
    const r = await sequence.getFrameSize();
    if (r && r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
  } catch (e) { /* fall through */ }
  return { w: 1920, h: 1080 };
}

// Columns follow the frame's shape so pixels stay square (works for vertical video too).
function ledGrid(rows, frame) {
  const r = Math.max(1, Math.round(rows));
  return { rows: r, cols: Math.max(1, Math.round((r * frame.w) / frame.h)) };
}

// The grid overlay sitting above `item`: a template clip starting where the item starts.
async function findOverlay(sequence, item, paramName) {
  const base = await item.getTrackIndex();
  const start = (await item.getStartTime()).seconds;
  const n = await sequence.getVideoTrackCount();
  for (let t = base + 1; t < n; t++) {
    for (const it of await itemsOnTrack(await sequence.getVideoTrack(t))) {
      if (Math.abs((await it.getStartTime()).seconds - start) > 0.05) continue;
      for (const c of await listComponents(it)) {
        if (c.match === "AE.ADBE Capsule" && findParam(c.comp, paramName)) return { item: it, comp: c.comp };
      }
    }
  }
  return null;
}

async function ledSetPixels(project, sequence, item, rows) {
  const frame = await frameSize(sequence);
  const g = ledGrid(rows, frame);
  await configure(project, item, "mosaic", { "horizontal blocks": g.cols, "vertical blocks": g.rows, "sharp colors": true });
  const ov = await findOverlay(sequence, item, "Rows");
  if (ov) setParams(project, ov.comp, { rows: g.rows, "frame width": frame.w, "frame height": frame.h }, "LED grid");
  return g;
}

async function applyLed({ project, sequence, item, opts, fps }) {
  if (!(await resolveEffect("mosaic"))) throw new Error("Mosaic is missing in this Premiere.");
  await addEffects(project, item, ["mosaic", "lumetri", "rgbSplit", "wonderGlow"]);
  const c = LOOK_CONTROLS.led;
  const g = await ledSetPixels(project, sequence, item, c.pixels);
  await configure(project, item, "lumetri", { exposure: 0.3, contrast: 25, saturation: c.saturation });
  await configure(project, item, "rgbSplit", { [SPLIT_PARAM]: c.split });
  await configure(project, item, "wonderGlow", { [GLOW_PARAM]: c.glow });
  log(`  pixels: ${g.cols} x ${g.rows}`, "ok");

  // Gaps and subpixel lines come from the grid template on the track above.
  const path = await bundledFile(`mogrt/${LED_MOGRT}`);
  if (!path) {
    log("  LED grid template not installed yet: pixels without gaps (see after-effects/build-led-grid-mogrt.jsx)", "warn");
    return true;
  }
  const layers = await prepareTracks(project, sequence, item, [{ id: "hud", kind: "grid", label: "LED grid", offset: 0 }], opts, fps);
  if (!layers || !layers.length) return true;
  const grid = await insertTemplate(project, sequence, item, path, layers[0].target);
  const frame = await frameSize(sequence);
  const capsule = (await listComponents(grid)).find((x) => x.match === "AE.ADBE Capsule");
  if (capsule) {
    setParams(project, capsule.comp, { rows: g.rows, "frame width": frame.w, "frame height": frame.h, "gap %": c.gap }, "LED grid");
  }
  // The template is 1920 square; scale it to cover larger frames.
  const scale = (Math.max(frame.w, frame.h) / 1920) * 100;
  if (Math.abs(scale - 100) > 0.5) await configure(project, grid, "motion", { scale });
  log(`  LED grid on V${layers[0].target + 1}`, "ok");
  return true;
}

async function applyDiamond({ project, item }) {
  await addEffects(project, item, ["blackWhite", "lumetri", "noise", "gaussian", "brightContrast", "sharpen", "glint", "wonderGlow"]);
  const c = LOOK_CONTROLS.diamond;
  await configure(project, item, "lumetri", { exposure: 0.6, contrast: 60, whites: 40, blacks: -40 });
  await configure(project, item, "noise", { "amount of noise|amount": c.sparkle, "noise type|use color noise": false, clipping: true });
  await configure(project, item, "gaussian", { blurriness: c.crystal, "repeat edge pixels": true });
  await configure(project, item, "brightContrast", { brightness: c.brightness, contrast: c.crush });
  await configure(project, item, "sharpen", { "sharpen amount|amount": 30 });
  await configure(project, item, "wonderGlow", { [GLOW_PARAM]: c.glow });
  log("  diamond x-ray applied", "ok");
  return true;
}

// Film Impact parameter names aren't documented; these try the likely ones.
const SPLIT_PARAM = "amount|distance|offset|strength|split";
const GLOW_PARAM = "intensity|amount|strength|glow";

// Slider definitions per look. `apply` updates one selected clip.
const CONTROL_DEFS = {
  led: [
    { id: "pixels", label: "Pixels (rows)", min: 8, max: 240, step: 1, value: 54,
      apply: (x, v) => ledSetPixels(x.project, x.sequence, x.item, v) },
    { id: "gap", label: "Gap", min: 0, max: 60, step: 1, value: 18,
      apply: async (x, v) => {
        const ov = await findOverlay(x.sequence, x.item, "Gap %");
        if (ov) setParams(x.project, ov.comp, { "gap %": v }, "LED gap");
      } },
    { id: "split", label: "RGB split", min: 0, max: 100, step: 1, value: 20,
      apply: (x, v) => configure(x.project, x.item, "rgbSplit", { [SPLIT_PARAM]: v }) },
    { id: "glow", label: "Glow", min: 0, max: 100, step: 1, value: 40,
      apply: (x, v) => configure(x.project, x.item, "wonderGlow", { [GLOW_PARAM]: v }) },
    { id: "saturation", label: "Saturation", min: 0, max: 200, step: 1, value: 130,
      apply: (x, v) => configure(x.project, x.item, "lumetri", { saturation: v }) },
  ],
  diamond: [
    { id: "sparkle", label: "Sparkle", min: 0, max: 100, step: 1, value: 35,
      apply: (x, v) => configure(x.project, x.item, "noise", { "amount of noise|amount": v }) },
    { id: "crystal", label: "Crystal size", min: 0, max: 10, step: 0.5, value: 2,
      apply: (x, v) => configure(x.project, x.item, "gaussian", { blurriness: v }) },
    { id: "crush", label: "Crush", min: 0, max: 100, step: 1, value: 60,
      apply: (x, v) => configure(x.project, x.item, "brightContrast", { contrast: v }) },
    { id: "brightness", label: "Brightness", min: -100, max: 100, step: 1, value: -10,
      apply: (x, v) => configure(x.project, x.item, "brightContrast", { brightness: v }) },
    { id: "glow", label: "Glow", min: 0, max: 100, step: 1, value: 50,
      apply: (x, v) => configure(x.project, x.item, "wonderGlow", { [GLOW_PARAM]: v }) },
  ],
};

// Current slider values per look, persisted.
const LOOK_CONTROLS = {};
function loadControls() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("vizzfx-controls") || "{}");
  } catch (e) { /* defaults */ }
  for (const [look, defs] of Object.entries(CONTROL_DEFS)) {
    LOOK_CONTROLS[look] = {};
    for (const d of defs) LOOK_CONTROLS[look][d.id] = saved[look] && saved[look][d.id] !== undefined ? saved[look][d.id] : d.value;
  }
}
function saveControls() {
  try {
    localStorage.setItem("vizzfx-controls", JSON.stringify(LOOK_CONTROLS));
  } catch (e) { /* not saved */ }
}

// Show the sliders of `lookKey` under the cards; changes apply live to selected clips.
function renderControls(lookKey) {
  const box = document.getElementById("controls");
  if (!box) return;
  box.textContent = "";
  const defs = CONTROL_DEFS[lookKey];
  if (!defs) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  const title = document.createElement("div");
  title.className = "section-label";
  title.textContent = `ADJUST ${LOOKS[lookKey].name.toUpperCase()}`;
  box.appendChild(title);
  for (const d of defs) {
    const row = document.createElement("div");
    row.className = "slider-row";
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = d.label;
    const slider = document.createElement("sp-slider");
    slider.className = "slider";
    slider.setAttribute("min", d.min);
    slider.setAttribute("max", d.max);
    slider.setAttribute("step", d.step);
    slider.setAttribute("value", LOOK_CONTROLS[lookKey][d.id]);
    const val = document.createElement("span");
    val.className = "slider-value";
    val.textContent = LOOK_CONTROLS[lookKey][d.id];
    slider.addEventListener("input", () => (val.textContent = slider.value));
    slider.addEventListener("change", safe(async () => {
      const v = Number(slider.value);
      LOOK_CONTROLS[lookKey][d.id] = v;
      val.textContent = v;
      saveControls();
      await applyControl(lookKey, d, v);
    }));
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(val);
    box.appendChild(row);
  }
}

async function applyControl(lookKey, def, value) {
  const { project, sequence } = await getContext();
  const clips = await getSelectedVideoClips(sequence);
  if (!clips.length) return status(`${def.label}: ${value}. Select a clip with ${LOOKS[lookKey].name} to update it.`);
  for (const item of clips) await def.apply({ project, sequence, item }, value);
  status(`${def.label}: ${value} on ${clips.length} clip${clips.length > 1 ? "s" : ""}.`, "ok");
}

async function bundledFile(rel) {
  try {
    const folder = await require("uxp").storage.localFileSystem.getPluginFolder();
    const entry = await folder.getEntry(rel);
    if (entry) return entry.nativePath;
  } catch (e) { /* not bundled */ }
  return null;
}

// Insert a .mogrt at `item`'s start on video track `target`, trimmed to the item.
async function insertTemplate(project, sequence, item, path, target) {
  const start = await item.getStartTime();
  const editor = ppro.SequenceEditor.getEditor(sequence);
  let inserted = [];
  try {
    project.lockedAccess(() => {
      inserted = editor.insertMogrtFromPath(path, start, target, 0) || [];
    });
  } catch (e) {
    log(`  · insert under lock failed (${errText(e)}), retrying`, "warn");
    inserted = editor.insertMogrtFromPath(path, start, target, 0) || [];
  }
  const clip = inserted.find((i) => i instanceof ppro.VideoClipTrackItem) || inserted[0];
  if (!clip) throw new Error("Premiere didn't insert the template.");
  const end = await item.getEndTime();
  transact(project, "VizzFX: trim template", (ca) => ca.addAction(clip.createSetEndAction(end)));
  return clip;
}

let busy = false;

async function applyLook(lookKey) {
  if (busy) return;
  renderControls(lookKey);
  busy = true;
  document.body.classList.add("busy");
  try {
    await buildLook(lookKey);
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}

async function buildLook(lookKey) {
  const look = LOOKS[lookKey];
  const opts = readOptions();
  saveOptions();
  log(look.name, "head");
  status(`Building ${look.name}…`, "busy");
  try {
    const { project, sequence } = await getContext();
    const clips = await getSelectedVideoClips(sequence);
    if (!clips.length) throw new Error("Select at least one video clip on the timeline.");
    if (!(await resolveEffect("lumetri"))) throw new Error("Lumetri Color is missing; it's required for the look.");
    const fps = await fpsOf(sequence);

    const hasEcho = look.apply ? false : !!(await resolveEffect("echo"));
    const hasWipe = look.apply ? false : !!(await resolveEffect("linearWipe"));
    if (look.slices && !hasWipe) log("  slices need Linear Wipe; skipping the slice layer", "warn");

    let built = 0;
    for (const item of clips) {
      log(`- ${await nameOf(item)}`);
      if (await alreadyHasLook(item, look)) {
        const again = await confirmDialog(
          "Look already applied?",
          `"${await nameOf(item)}" already looks like it has ${look.name}. Applying again stacks a second set of effects.`,
          "Apply again"
        );
        if (!again) {
          log("  skipped: already has the look", "warn");
          continue;
        }
      }
      if (look.apply) {
        if (await look.apply({ project, sequence, item, opts, fps })) built++;
        continue;
      }
      // Settle tracks first so nothing changes if the user cancels.
      const layers = await prepareTracks(project, sequence, item, buildLayers(look, opts, hasEcho, hasWipe, fps), opts, fps);
      if (!layers) {
        log("  cancelled, clip left unchanged", "warn");
        continue;
      }
      await applyBaseLook(project, item, look, opts, hasEcho);
      for (const l of layers) {
        if (l.kind === "trail") await addTrailLayer(project, sequence, item, l.layer, l.target, fps);
        if (l.kind === "slice") await addSliceLayer(project, sequence, item, look, opts, l.target, fps);
        if (l.kind === "glow") await addGlowLayer(project, sequence, item, look, opts, l.target, fps);
      }
      built++;
    }
    if (!built) {
      status("Cancelled. Nothing was changed.", "warn");
      return;
    }
    const skipped = Object.keys(resolved).filter((k) => !resolved[k]);
    status(look.doneMessage || `${look.name} added.`, "ok");
    look.doneMessage = null;
    if (skipped.length) log(`  (this Premiere has no ${skipped.map(effectLabel).join(", ")})`);
    if (look.apply) return;
    log("Done. Check in Effect Controls:", "ok");
    if (hasEcho) log("  Echo > Echo Operator = Blend.");
    if (opts.glow) log("  Glow layer > Opacity > Blend Mode = Screen.");
    log("  Wrong? Fix by hand, click Inspect, and copy the number into Advanced.");
    log("Save as preset: select the effects on a clip > right-click > Save Preset.");
  } catch (e) {
    status(`Failed: ${errText(e)}`, "err");
    log(`Error: ${errText(e)}`, "err");
  }
}

async function inspect() {
  log("Inspect", "head");
  status("Inspecting… see log below.", "busy");
  const { sequence } = await getContext();
  const clips = await getSelectedVideoClips(sequence);
  if (!clips.length) throw new Error("Select a video clip on the timeline.");
  for (const comp of await listComponents(clips[0])) {
    log(`[${comp.index}] ${comp.name}  (${comp.match})`);
    for (let i = 0; i < comp.comp.getParamCount(); i++) {
      const p = comp.comp.getParam(i);
      let value = "";
      try {
        const kf = await p.getStartValue();
        const v = kf && kf.value !== undefined ? kf.value.value : kf;
        value = typeof v === "object" ? JSON.stringify(v) : String(v);
      } catch (e) {
        value = "(unreadable)";
      }
      log(`    ${i}: ${p.displayName} = ${value}`);
    }
  }
  status("Inspect done. See log below.", "ok");
}

async function listEffects() {
  log("Available video effects", "head");
  const { matches, displays } = await getEffectList();
  const rows = matches.map((m, i) => `${displays[i] || "?"}  |  ${m}`).sort((a, b) => a.localeCompare(b));
  for (const r of rows) log(`  ${r}`);
  try {
    await copyText([`Premiere video effects (${rows.length})`, ...rows].join("\n"));
    status(`${rows.length} effects listed and copied to clipboard.`, "ok");
  } catch (e) {
    status(`${rows.length} effects listed in the log (clipboard unavailable: use Copy log).`, "warn");
  }
}

async function copyText(text) {
  if (navigator.clipboard.setContent) await navigator.clipboard.setContent({ "text/plain": text });
  else await navigator.clipboard.writeText(text);
}

async function copyLog() {
  await copyText(logLines.join("\n"));
  status("Log copied to clipboard.", "ok");
}

function safe(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      status(`Failed: ${errText(e)}`, "err");
      log(`Error: ${errText(e)}`, "err");
    }
  };
}

window.addEventListener("unhandledrejection", (ev) => {
  log(`Unhandled: ${errText(ev.reason)}`, "err");
});

// Cards are generated from LOOKS, so a new look only needs a LOOKS entry.
function renderLooks() {
  const grid = document.getElementById("looks");
  for (const [key, look] of Object.entries(LOOKS)) {
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = look.name;
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = look.desc || "";
    card.appendChild(title);
    card.appendChild(desc);
    card.addEventListener("click", safe(() => applyLook(key)));
    grid.appendChild(card);
  }
}

function toggle(buttonId, sectionId) {
  const btn = document.getElementById(buttonId);
  const section = document.getElementById(sectionId);
  btn.addEventListener("click", () => {
    const open = section.style.display !== "block";
    section.style.display = open ? "block" : "none";
    btn.classList.toggle("active", open);
  });
}

window.addEventListener("load", () => {
  loadOptions();
  loadControls();
  renderLooks();
  toggle("btn-settings", "settings");
  toggle("btn-log", "logwrap");
  let host = "";
  try {
    const h = require("uxp").host;
    hostVersion = `${h.name} ${h.version}`;
    host = ` (${hostVersion})`;
  } catch (e) { /* host info unavailable */ }
  document.getElementById("version").textContent = `v${VERSION}`;
  log(`VizzFX ${VERSION} ready${host}`);
  document.getElementById("btn-inspect").addEventListener("click", safe(inspect));
  document.getElementById("btn-effects").addEventListener("click", safe(listEffects));
  document.getElementById("btn-copy").addEventListener("click", safe(copyLog));
  document.getElementById("btn-clear").addEventListener("click", () => {
    document.getElementById("log").textContent = "";
    logLines.length = 0;
  });
  for (const id of OPTION_IDS) document.getElementById(id).addEventListener("change", saveOptions);
  const grain = document.getElementById("opt-grain");
  grain.addEventListener("input", () => (document.getElementById("grain-value").textContent = Number(grain.value).toFixed(1)));
  grain.addEventListener("change", safe(updateGrainLive));
  document.getElementById("grain-value").textContent = Number(grain.value).toFixed(1);
  const dlg = document.getElementById("confirm");
  document.getElementById("confirm-ok").addEventListener("click", () => dlg.close("ok"));
  document.getElementById("confirm-cancel").addEventListener("click", () => dlg.close("cancel"));
});
