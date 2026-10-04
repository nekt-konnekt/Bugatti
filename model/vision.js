const fs = require("fs");
const path = require("path");
const { generate, isAvailable } = require("./ollama");

const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || process.env.OLLAMA_MODEL || "qwen3:8b";

const SYSTEM = `You are BRAG's visual product analyst.
You are looking at a screenshot captured from a real product.
Describe only what is visibly present. Never infer hidden capabilities or invent user outcomes.
Identify the clearest visible product purpose, primary action, important interface regions, proof/results, and any visual friction.
Return JSON only.

Schema:
{
  "purpose": "short visible description",
  "primaryAction": "most prominent visible action or null",
  "regions": ["visible region"],
  "proof": ["visible evidence or result"],
  "friction": ["visible issue"],
  "confidence": 0
}`;

async function run(inputPath = "output/home.png", outputPath = "output/visual-intelligence.json") {
  if (!(await isAvailable())) {
    console.log("Local vision unavailable. Keeping DOM-only intelligence.");
    return null;
  }

  if (!fs.existsSync(inputPath)) {
    console.log("Screenshot unavailable. Keeping DOM-only intelligence.");
    return null;
  }

  const image = fs.readFileSync(inputPath).toString("base64");
  const result = await generate({
    system: SYSTEM,
    model: VISION_MODEL,
    prompt: "Analyze this screenshot as visual evidence for BRAG.",
    images: [image]
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    version: "1.0",
    engine: "ollama-vision",
    model: VISION_MODEL,
    generatedAt: new Date().toISOString(),
    evidenceFile: inputPath,
    ...result
  }, null, 2));

  console.log("Local visual intelligence:", outputPath);
  return result;
}

if (require.main === module) {
  run().catch(error => {
    console.error("Visual Director failed:", error.message);
    process.exit(1);
  });
}

module.exports = { run };
