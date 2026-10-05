const fs = require("fs");

const SAFE_GLOBAL_KEYS = new Set(["captions"]);
const SAFE_SCENE_KEYS = new Set(["skip","duration","narration","motion","cursor"]);

function validateOverride(override) {
  const errors = [];
  if (!override || typeof override !== "object" || Array.isArray(override)) return ["Override must be a JSON object."];
  for (const key of Object.keys(override.global || {})) if (!SAFE_GLOBAL_KEYS.has(key)) errors.push("Unsupported global override: " + key);
  for (const [scene, values] of Object.entries(override.scenes || {})) {
    if (!values || typeof values !== "object" || Array.isArray(values)) { errors.push("Scene override must be an object: " + scene); continue; }
    for (const key of Object.keys(values)) if (!SAFE_SCENE_KEYS.has(key)) errors.push("Unsupported scene override " + scene + ": " + key);
    if (values.duration != null && (!Number.isFinite(Number(values.duration)) || Number(values.duration) < 0.5 || Number(values.duration) > 60)) errors.push("Invalid duration for " + scene);
    if (values.skip != null && typeof values.skip !== "boolean") errors.push("skip must be boolean for " + scene);
    if (values.narration != null && typeof values.narration !== "string") errors.push("narration must be a string for " + scene);
  }
  return errors;
}

function loadOverride(file) {
  if (!fs.existsSync(file)) return { scenes:{}, global:{}, source:null, errors:[] };
  const override = JSON.parse(fs.readFileSync(file,"utf8"));
  const errors = validateOverride(override);
  if (errors.length) throw new Error("Invalid BRAG human override:\n" + errors.map(x => "- " + x).join("\n"));
  return { ...override, source:file, errors:[] };
}

module.exports = { SAFE_GLOBAL_KEYS, SAFE_SCENE_KEYS, validateOverride, loadOverride };
