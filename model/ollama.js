const DEFAULT_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";

function endpoint(pathname) {
  return DEFAULT_URL.replace(/\/$/, "") + pathname;
}

async function generate({ system, prompt, model = DEFAULT_MODEL, format = "json", images = [] }) {
  const userMessage = { role: "user", content: prompt };
  if (Array.isArray(images) && images.length) userMessage.images = images;

  const response = await fetch(endpoint("/api/chat"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format,
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: system },
        userMessage
      ]
    }),
    signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 120000))
  });

  if (!response.ok) {
    throw new Error("Ollama request failed: HTTP " + response.status);
  }

  const data = await response.json();
  const content = data?.message?.content;
  if (!content) throw new Error("Ollama returned no model content.");
  return JSON.parse(content);
}

async function isAvailable() {
  try {
    const response = await fetch(endpoint("/api/tags"), {
      signal: AbortSignal.timeout(1500)
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { generate, isAvailable, DEFAULT_MODEL, DEFAULT_URL };
