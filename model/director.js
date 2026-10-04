const fs = require("fs");
const { generate, isAvailable, DEFAULT_MODEL } = require("./ollama");

const SYSTEM = `You are BRAG's product director.
You are given observed evidence from a real web product.
Never invent capabilities, users, workflows, metrics, integrations, or outcomes.
Choose the smallest compelling workflow that can be demonstrated safely from the evidence.
Return JSON only.

Schema:
{
  "product": "short product name",
  "problem": "problem visibly supported by the evidence",
  "user": "likely user supported by the evidence",
  "promise": "one sentence",
  "archetype": "product|ai-workflow|data-workflow|commerce|creation-workflow|game",
  "strongestAction": "exact observed action text or null",
  "workflow": ["step 1", "step 2", "step 3"],
  "proof": "specific visible proof moment",
  "hook": "short opening line",
  "confidence": 0
}`;

function evidenceFromInspection(inspection) {
  return {
    url: inspection.url,
    title: inspection.title,
    description: inspection.description,
    headings: (inspection.headings || []).slice(0, 20),
    buttons: (inspection.buttons || []).slice(0, 30),
    links: (inspection.links || []).slice(0, 40),
    consoleErrors: (inspection.consoleErrors || []).slice(0, 20)
  };
}

function readVisualEvidence() {
  try {
    return JSON.parse(fs.readFileSync("output/visual-intelligence.json", "utf8"));
  } catch {
    return null;
  }
}

function readSpeechEvidence() {
  try {
    return JSON.parse(fs.readFileSync("output/speech-intelligence.json", "utf8"));
  } catch {
    return null;
  }
}

async function buildAIDirector(inspection) {
  if (!(await isAvailable())) return null;
  const evidence = {
    ...evidenceFromInspection(inspection),
    visual: readVisualEvidence(),
    speech: readSpeechEvidence()
  };
  return generate({
    system: SYSTEM,
    model: DEFAULT_MODEL,
    prompt: JSON.stringify(evidence)
  });
}

async function run(inspectionPath = "output/inspection.json", outputPath = "output/ai-intelligence.json") {
  const inspection = JSON.parse(fs.readFileSync(inspectionPath, "utf8"));
  const result = await buildAIDirector(inspection);
  if (!result) {
    console.log("Local LLM unavailable. Keeping deterministic Director.");
    return null;
  }
  fs.mkdirSync(require("path").dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    version: "1.1",
    engine: "ollama",
    model: DEFAULT_MODEL,
    generatedAt: new Date().toISOString(),
    evidenceUrl: inspection.url,
    visualEvidence: Boolean(readVisualEvidence()),
    speechEvidence: Boolean(readSpeechEvidence()),
    ...result
  }, null, 2));
  console.log("Local AI Director:", outputPath);
  return result;
}

if (require.main === module) {
  run().catch(error => {
    console.error("AI Director failed:", error.message);
    process.exit(1);
  });
}

module.exports = { buildAIDirector, run };
