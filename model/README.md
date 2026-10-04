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


## Visual intelligence

BRAG can optionally send the captured screenshot to a local multimodal Ollama model.

```bash
ollama pull <your-vision-model>
OLLAMA_VISION_MODEL=<your-vision-model> npm run visual-director
```

Set `OLLAMA_VISION_MODEL` separately from `OLLAMA_MODEL` when the text and vision models differ. Visual analysis is advisory and never receives unrestricted browser control. If the model is unavailable or cannot process images, BRAG continues with DOM-only intelligence.


## Speech intelligence

BRAG can optionally transcribe an audio evidence file with local faster-whisper.

Install the Python dependency:

```bash
pip install faster-whisper
```

Then:

```bash
BRAG_AUDIO=output/audio/input.wav WHISPER_MODEL=small npm run transcribe
```

Useful environment variables:

- `WHISPER_MODEL`: model size, default `small`
- `WHISPER_DEVICE`: default `cpu`
- `WHISPER_COMPUTE_TYPE`: default `int8`
- `PYTHON_BIN`: Python executable, default `python3`

Speech is optional. If no audio exists or faster-whisper is unavailable, BRAG continues with visual and DOM evidence.
