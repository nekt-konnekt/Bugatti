const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const renderDir = process.argv[2] || "output/render";
const expected = {
  "16x9": [1280, 720],
  "9x16": [720, 1280],
  "1x1": [1080, 1080]
};
const checks = [];

function add(id, severity, message, detail = "") { checks.push({ id, severity, message, detail }); }
function probe(file) {
  try {
    return JSON.parse(execFileSync("ffprobe", [
      "-v","error","-show_entries","format=duration,size:stream=codec_type,width,height,r_frame_rate,codec_name",
      "-of","json",file
    ], { encoding:"utf8" }));
  } catch { return null; }
}

for (const [key, [width, height]] of Object.entries(expected)) {
  const file = path.join(renderDir, "brag-demo-" + key + ".mp4");
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    add("file-" + key, "fail", "Rendered video is missing or empty.");
    continue;
  }

  const info = probe(file);
  if (!info) {
    add("probe-" + key, "fail", "ffprobe could not inspect the rendered video.");
    continue;
  }

  const video = (info.streams || []).find(s => s.codec_type === "video");
  const audio = (info.streams || []).find(s => s.codec_type === "audio");
  const duration = Number(info.format?.duration || 0);
  const size = Number(info.format?.size || 0);

  if (video?.width !== width || video?.height !== height) add("dimensions-" + key, "fail", "Output dimensions are incorrect.", JSON.stringify({ actual:[video?.width,video?.height], expected:[width,height] }));
  else add("dimensions-" + key, "pass", "Output dimensions are correct.", width + "x" + height);

  if (!video?.codec_name || video.codec_name !== "h264") add("codec-" + key, "fail", "Video codec is not H.264.", video?.codec_name || "missing");
  else add("codec-" + key, "pass", "Video codec is H.264.");

  if (!Number.isFinite(duration) || duration < 1) add("duration-" + key, "fail", "Video duration is invalid.", String(duration));
  else add("duration-" + key, "pass", "Video duration is valid.", duration.toFixed(2) + "s");

  if (size < 10000) add("size-" + key, "fail", "Rendered file is suspiciously small.", size + " bytes");
  else add("size-" + key, "pass", "Rendered file has non-trivial media size.", size + " bytes");

  if (audio) {
    if (audio.codec_name !== "aac") add("audio-codec-" + key, "warning", "Audio exists but is not AAC.", audio.codec_name || "unknown");
    else add("audio-codec-" + key, "pass", "Audio codec is AAC.");
  }
}

let ffmpegAvailable = true;
try { execFileSync("ffprobe", ["-version"], { stdio:"ignore" }); } catch { ffmpegAvailable = false; }
if (!ffmpegAvailable) add("ffprobe", "fail", "ffprobe is unavailable; video quality cannot be validated.");

const failures = checks.filter(x=>x.severity==="fail").length;
const warnings = checks.filter(x=>x.severity==="warning").length;
const passes = checks.filter(x=>x.severity==="pass").length;
const score = Math.max(0, Math.round(100 - failures*25 - warnings*7));
const report = {
  version:"1.0",
  generatedAt:new Date().toISOString(),
  status:failures ? "fail" : warnings ? "review" : "pass",
  score,
  summary:{passes,warnings,failures},
  checks,
  rule:"Video quality is validated from rendered media metadata. It does not judge creative taste or invent product facts."
};

fs.mkdirSync("output/qa",{recursive:true});
fs.writeFileSync("output/qa/video-quality.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (failures) process.exitCode=1;
