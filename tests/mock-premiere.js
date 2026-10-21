// Dry-run the VizzFX plugin against a fake premierepro module + DOM.
// Usage: node tests/mock-premiere.js plugin/index.js [ghost|shattered] [twice]
// Looks: ghost | shattered | low | thermal | hud
// Env: PR26=1 (no Echo, Film Impact blur)  VTRACKS=n  BUSY=1 (title on V2)
//      AUTOADD=create|throw|clamp  DIALOG=ok|cancel  NOAUTO=1
const Module = require("module");
const path = require("path");

const TPS = 254016000000;
class TickTime {
  constructor(sec) { this.seconds = sec; this.ticks = String(Math.round(sec * TPS)); this.ticksNumber = Math.round(sec * TPS); }
  static createWithSeconds(s) { return new TickTime(s); }
  add(t) { return new TickTime(this.seconds + t.seconds); }
}

const CATALOG26 = process.env.PR26 ? true : false;
const CATALOG = {
  "AE.ADBE Echo": ["Echo", ["Echo Time (seconds)", "Number Of Echoes", "Starting Intensity", "Decay", "Echo Operator"]],
  "AE.ADBE Lumetri": ["Lumetri Color", ["Basic Correction", "Input LUT", "Exposure", "Contrast", "Highlights", "Shadows", "Whites", "Blacks", "Saturation", "Creative", "Look", "Saturation", "Amount"]],
  "AE.ADBE Posterize Time": ["Posterize Time", ["Frame Rate"]],
  "AE.ADBE Noise2": ["Noise (Legacy)", ["Amount of Noise", "Noise Type", "Clipping"]],
  "AE.ADBE_Noise_FX": ["Noise", ["Strength", "Size"]],
  "AE.ADBE Motion Blur": ["Directional Blur", ["Direction", "Blur Length"]],
  "AE.FilmImpact Blur FX": ["Directional Blur", ["Blur Type", "Angle", "Amount", "Quality"]],
  "AE.ADBE Noise": ["Noise", ["Amount of Noise", "Noise Type", "Clipping"]],
  "AE.ADBE AECrop": ["Crop", ["Left", "Top", "Right", "Bottom", "Zoom", "Edge Feather"]],
  "AE.ADBE Gaussian Blur 2": ["Gaussian Blur", ["Blurriness", "Blur Dimensions", "Repeat Edge Pixels"]],
  "AE.ADBE Linear Wipe": ["Linear Wipe", ["Transition Completion", "Wipe Angle", "Feather"]],
  "AE.ADBE Geometry2": ["Transform", ["Anchor Point", "Position", "Uniform Scale", "Scale Height", "Scale Width", "Skew", "Rotation", "Opacity"]],
  "AE.ADBE Motion": ["Motion", ["Position", "Scale", "Rotation"]],
  "AE.ADBE Opacity": ["Opacity", ["Opacity", "Blend Mode"]],
};

if (process.env.PR26) { delete CATALOG["AE.ADBE Echo"]; delete CATALOG["AE.ADBE Noise"]; }
class Param {
  constructor(name) { this.displayName = name; this.value = 0; this.keys = []; this.tv = false; }
  createKeyframe(v) { return { value: { value: v }, position: new TickTime(0) }; }
  createSetValueAction(kf) { return () => { if (this.displayName === "Input LUT" && !process.env.LUTOK) return; this.value = kf.value.value; }; }
  createSetTimeVaryingAction(b) { return () => { this.tv = b; }; }
  createAddKeyframeAction(kf) { return () => { if (!this.tv) throw new Error("not time varying"); this.keys.push([kf.position.seconds, kf.value.value]); }; }
  async getStartValue() { return { value: { value: this.value } }; }
  clone() { const p = new Param(this.displayName); p.value = this.value; p.keys = [...this.keys]; p.tv = this.tv; return p; }
}
class Component {
  constructor(match, params) { this.match = match; this.params = params || CATALOG[match][1].map((n) => new Param(n)); }
  async getMatchName() { return this.match; }
  async getDisplayName() { return CATALOG[this.match][0]; }
  getParamCount() { return this.params.length; }
  getParam(i) { return this.params[i]; }
  clone() { return new Component(this.match, this.params.map((p) => p.clone())); }
}
class Chain {
  constructor(comps) { this.comps = comps; }
  getComponentCount() { return this.comps.length; }
  getComponentAtIndex(i) { return this.comps[i]; }
  createInsertComponentAction(c, i) { return () => { if (i > this.comps.length) throw new Error("bad index"); this.comps.splice(i, 0, c); }; }
  createAppendComponentAction(c) { return () => this.comps.push(c); }
}
class VideoClipTrackItem {
  createAddVideoTransitionAction(tr, opts) { return () => logLines.push(`TRANSITION> ${tr.match} ${opts.d.seconds}s at start of ${this.name}`); }
  constructor(name, track, start, end, chain) {
    this.name = name; this.track = track; this.start = start; this.end = end; this.inPoint = 0;
    this.chain = chain || new Chain([new Component("AE.ADBE Motion"), new Component("AE.ADBE Opacity")]);
  }
  async getName() { return this.name; }
  async getComponentChain() { return this.chain; }
  async getTrackIndex() { return this.track.index; }
  async getStartTime() { return new TickTime(this.start); }
  async getEndTime() { return new TickTime(this.end); }
  async getInPoint() { return new TickTime(this.inPoint); }
  async getDuration() { return new TickTime(this.end - this.start); }
  createSetEndAction(t) { return () => { this.end = t.seconds; }; }
}
class AudioClipTrackItem {
  constructor(track, start, end) { this.track = track; this.start = start; this.end = end; }
  async getStartTime() { return new TickTime(this.start); }
}
class Track {
  constructor(index) { this.index = index; this.items = []; }
  async getTrackItems() { return [...this.items]; }
}

const vTracks = [...Array(Number(process.env.VTRACKS || 3)).keys()].map((i) => new Track(i));
const aTracks = [0, 1, 2].map((i) => new Track(i));
const clip = new VideoClipTrackItem("runner.mp4", vTracks[0], 2, 10);
vTracks[0].items.push(clip);
aTracks[0].items.push(new AudioClipTrackItem(aTracks[0], 2, 10));
if (process.env.BUSY) { const t = new VideoClipTrackItem("Title 01", vTracks[1], 4, 6); vTracks[1].items.push(t); }

const sequence = {
  async getSelection() { return { getTrackItems: async () => [clip, aTracks[0].items[0]] }; },
  async getVideoTrackCount() { return vTracks.length; },
  async getVideoTrack(i) { return vTracks[i]; },
  async getAudioTrackCount() { return aTracks.length; },
  async getAudioTrack(i) { return aTracks[i]; },
  async getTimebase() { return String(TPS / 30); },
};
let undoSteps = 0;
const project = {
  async getActiveSequence() { return sequence; },
  lockedAccess(cb) { cb(); },
  executeTransaction(cb, label) {
    const actions = [];
    cb({ addAction: (a) => actions.push(a) });
    actions.forEach((a) => a());
    undoSteps++;
    return true;
  },
};

const ppro = {
  TickTime, VideoClipTrackItem, AudioClipTrackItem,
  Constants: { TrackItemType: { CLIP: 1 }, MediaType: { AUDIO: 3 } },
  Project: { getActiveProject: async () => project },
  VideoFilterFactory: {
    getMatchNames: async () => Object.keys(CATALOG),
    getDisplayNames: async () => Object.values(CATALOG).map((v) => v[0]),
    createComponent: async (m) => { if (!CATALOG[m]) throw new Error("unknown " + m); return new Component(m); },
  },
  SequenceEditor: {
    getEditor: () => ({
      createCloneTrackItemAction: (item, off, vUp, aUp) => () => {
        let t = vTracks[item.track.index + vUp];
        if (!t) {
          const mode = process.env.AUTOADD || "throw";
          if (mode === "throw") throw new Error("Illegal Parameter: track index out of range");
          if (mode === "create") { t = new Track(vTracks.length); vTracks.push(t); }
          if (mode === "clamp") t = vTracks[vTracks.length - 1];
        }
        const c = new VideoClipTrackItem(item.name + " copy", t, item.start + off.seconds, item.end + off.seconds,
          new Chain(item.chain.comps.map((x) => x.clone())));
        t.items.push(c);
        const at = aTracks[aUp]; if (!at) throw new Error("audio track " + aUp + " does not exist");
        at.items.push(new AudioClipTrackItem(at, c.start, c.end)); // simulate linked audio duplicated
      },
      insertMogrtFromPath: (path, t, vIdx) => {
        const tr = vTracks[vIdx];
        const c = new VideoClipTrackItem("VizzFX HUD", tr, t.seconds, t.seconds + 10);
        tr.items.push(c);
        logLines.push(`MOGRT> ${path.split("/").slice(-2).join("/")} on V${vIdx + 1}`);
        return [c];
      },
      createRemoveItemsAction: (sel) => () => {
        for (const it of sel.items) it.track.items = it.track.items.filter((x) => x !== it);
      },
    }),
  },
  TransitionFactory: {
    getVideoTransitionMatchNames: async () => ["AE.ADBE Cross Dissolve New", "AE.ADBE Dip To Black", "AE.ADBE Dip To White"],
    createVideoTransition: async (m) => ({ match: m }),
  },
  AddTransitionOptions: () => ({ setApplyToStart() { return this; }, setDuration(d) { this.d = d; return this; } }),
  TrackItemSelection: { createEmptySelection: (cb) => { const sel = { items: [], addItem(i) { this.items.push(i); return true; } }; cb(sel); return true; } },
};

// Fake DOM: any element id resolves to a generic element.
const logLines = [];
const els = {};
const defaults = {
  "opt-autoadd": { tag: "sp-checkbox", checked: !process.env.NOAUTO }, "opt-fadein": { tag: "sp-checkbox", checked: true }, "opt-trails": { tag: "sp-checkbox", checked: true },
  "opt-glow": { tag: "sp-checkbox", checked: true }, "opt-letterbox": { tag: "sp-checkbox", checked: true },
  "opt-drift": { tag: "sp-checkbox", checked: true }, "opt-delay": { tag: "sp-textfield", value: "8" },
  "opt-angle": { tag: "sp-textfield", value: "17" }, "opt-echo-op": { tag: "sp-textfield", value: "7" },
  "opt-screen": { tag: "sp-textfield", value: "8" },
};
function makeEl(id) {
  const d = defaults[id] || {};
  return {
    id, tagName: d.tag || "div", value: d.value, checked: d.checked, children: [], style: {}, handlers: {},
    className: "", textContent: "", scrollHeight: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(c) { this.children.push(c); if (id === "log") logLines.push(`${c.className ? "[" + c.className + "] " : ""}${c.textContent}`); },
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
  };
}
const getEl = (id) => (els[id] = els[id] || makeEl(id));
getEl("status");
Object.defineProperty(els.status, "textContent", { set(v) { logLines.push("STATUS> " + v); }, get() { return ""; } });
els["confirm"] = Object.assign(makeEl("confirm"), {
  uxpShowModal: async () => {
    logLines.push(`DIALOG> ${getEl("confirm-title").textContent}: ${getEl("confirm-text").textContent} [${getEl("confirm-ok").textContent}]`);
    return process.env.DIALOG || "ok";
  },
  close() {},
});
global.document = { getElementById: getEl, createElement: () => makeEl(), body: makeEl("body") };
let onload;
global.window = { addEventListener: (ev, fn) => { if (ev === "load") onload = fn; } };
const LS = {};
global.localStorage = { getItem: (k) => (k in LS ? LS[k] : null), setItem: (k, v) => { LS[k] = v; } };
console.log = () => {};
const clickLook = async (name) => {
  const card = els.looks.children.find((c) => c.children[0].textContent === name);
  await card.handlers.click();
};

const origLoad = Module._load;
const uxpMock = {
  host: { name: "premierepro", version: "26.3.2" },
  storage: { localFileSystem: {
    getPluginFolder: async () => {
      const dir = path.resolve(path.dirname(process.argv[2]));
      return {
        nativePath: dir,
        getEntry: async (rel) => {
          const full = path.join(dir, rel);
          if (!require("fs").existsSync(full)) throw new Error("not found: " + rel);
          return { nativePath: full, read: async () => require("fs").readFileSync(full, "utf8") };
        },
      };
    },
    getFileForOpening: async () => ({ nativePath: "/Users/me/Desktop/VizzFX_HUD.mogrt" }),
    getFileForSaving: async (name) => ({
      nativePath: "/Users/me/Documents/" + name,
      write: async (d) => logLines.push(`SAVED> /Users/me/Documents/${name} (${d.length} bytes)`),
    }),
  } },
};
Module._load = function (req, ...rest) {
  if (req === "premierepro") return ppro;
  if (req === "uxp") return uxpMock;
  return origLoad.call(this, req, ...rest);
};
require(path.resolve(process.argv[2]));
onload();

(async () => {
  const which = process.argv[3] || "shattered";
  const name = { ghost: "Ghost Trail", shattered: "Shattered Light", low: "Low Shutter", thermal: "Thermal", hud: "Tracking HUD" }[which];
  await clickLook(name);
  if (process.argv[4] === "twice") await clickLook(name);
  process.stdout.write(logLines.join("\n") + "\n\n");
  const dump = (label, items) => {
    for (const it of items) {
      process.stdout.write(`${label} ${it.name || "audio"} ${it.start.toFixed(2)}-${it.end.toFixed(2)}\n`);
      if (!it.chain) continue;
      for (const c of it.chain.comps) {
        const vals = c.params.filter((p) => p.value !== 0 || p.keys.length).map((p) => `${p.displayName}=${p.value}${p.keys.length ? " keys" + JSON.stringify(p.keys) : ""}`);
        process.stdout.write(`   ${CATALOG[c.match][0]}: ${vals.join(", ")}\n`);
      }
    }
  };
  vTracks.forEach((t) => dump(`V${t.index + 1}`, t.items));
  aTracks.forEach((t) => dump(`A${t.index + 1}`, t.items));
  process.stdout.write(`undo steps: ${undoSteps}\n`);
})();
