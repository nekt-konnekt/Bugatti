const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const input = process.argv[2] || process.env.BRAG_AUDIO || "output/audio/input.wav";
const output = process.argv[3] || "output/speech-intelligence.json";
const python = process.env.PYTHON_BIN || "python3";

if (!fs.existsSync(input)) {
  console.log("No audio evidence found. Keeping visual + DOM intelligence.");
  process.exit(0);
}

const result = spawnSync(python, [
  path.join(__dirname, "transcribe.py"),
  input
], {
  encoding: "utf8",
  env: process.env
});

if (result.error || result.status !== 0) {
  console.log("Local Whisper unavailable. Keeping visual + DOM intelligence.");
  if (result.stderr) console.log(result.stderr.trim());
  process.exit(0);
}

try {
  const transcript = JSON.parse(result.stdout);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({
    version: "1.0",
    engine: "faster-whisper",
    generatedAt: new Date().toISOString(),
    evidenceFile: input,
    ...transcript
  }, null, 2));
  console.log("Local speech intelligence:", output);
} catch (error) {
  console.log("Whisper returned invalid output. Keeping visual + DOM intelligence.");
}
