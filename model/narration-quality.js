const fs = require("fs");
const path = require("path");

const packagePath = process.argv[2] || "output/demo/package.json";
if (!fs.existsSync(packagePath)) {
  console.error("Demo package not found.");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const scenes = pkg.scenes || [];
const checks = [];

function add(id, severity, message, detail = "") { checks.push({ id, severity, message, detail }); }

const words = text => String(text || "").trim().split(/\s+/).filter(Boolean);
const normalize = text => String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

for (const scene of scenes) {
  const text = String(scene.narration || "").trim();
  const count = words(text).length;
  const chars = text.length;
  const duration = Number(scene.duration) || 0;
  const wordsPerSecond = duration ? count / duration : 0;

  if (!text) {
    add("empty-" + scene.id, "warning", "Scene has no narration.", scene.id);
  } else if (wordsPerSecond > 3.2) {
    add("pace-" + scene.id, "fail", "Narration is too dense for the scene duration.", scene.id + ": " + wordsPerSecond.toFixed(2) + " words/sec");
  } else if (wordsPerSecond > 2.7) {
    add("pace-" + scene.id, "warning", "Narration pace may be fast.", scene.id + ": " + wordsPerSecond.toFixed(2) + " words/sec");
  } else {
    add("pace-" + scene.id, "pass", "Narration pace is within the readable range.", scene.id + ": " + wordsPerSecond.toFixed(2) + " words/sec");
  }

  if (chars > 180) add("caption-" + scene.id, "warning", "Caption may be visually dense.", chars + " characters");
}

const normalized = scenes.map(s => normalize(s.narration)).filter(Boolean);
for (let i = 1; i < normalized.length; i++) {
  if (normalized[i] === normalized[i - 1]) add("repeat-" + i, "warning", "Adjacent narration is repeated.", scenes[i]?.id || String(i + 1));
}

const uniqueWords = new Set(words(normalized.join(" ")));
const totalWords = words(normalized.join(" ")).length;
const lexicalDiversity = totalWords ? uniqueWords.size / totalWords : 0;

if (lexicalDiversity < 0.45 && totalWords > 20) add("lexical-diversity", "warning", "Narration uses a narrow vocabulary.", lexicalDiversity.toFixed(2));
else add("lexical-diversity", "pass", "Narration has acceptable lexical variety.", lexicalDiversity.toFixed(2));

const failures = checks.filter(x => x.severity === "fail").length;
const warnings = checks.filter(x => x.severity === "warning").length;
const passes = checks.filter(x => x.severity === "pass").length;
const score = Math.max(0, Math.round(100 - failures * 30 - warnings * 8));

const report = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  status: failures ? "fail" : warnings ? "review" : "pass",
  score,
  summary: { passes, warnings, failures },
  lexicalDiversity: Number(lexicalDiversity.toFixed(3)),
  checks,
  rule: "Narration quality is judged by pacing, caption density, repetition, and lexical variety. It does not alter product facts."
};

const out = path.join(path.dirname(packagePath), "narration-quality.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
