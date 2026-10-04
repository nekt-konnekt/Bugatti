# BRAG Local Model Layer

BRAG can use a local Ollama model as an optional intelligence layer.

## Setup

Install Ollama, then pull a local model:

    ollama pull qwen3:8b

BRAG uses:

    OLLAMA_URL=http://127.0.0.1:11434
    OLLAMA_MODEL=qwen3:8b

No cloud LLM API is required.

## Design

The local model receives observed product evidence only. It proposes product intelligence and a story direction.

It does not receive unrestricted browser control.

The deterministic Director and Runner remain the safety boundary.
