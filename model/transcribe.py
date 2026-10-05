import json
import os
import sys

audio_path = sys.argv[1]

try:
    from faster_whisper import WhisperModel
except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(2)

model_name = os.environ.get("WHISPER_MODEL", "small")
device = os.environ.get("WHISPER_DEVICE", "cpu")
compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

try:
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, info = model.transcribe(audio_path, vad_filter=True)

    items = []
    text_parts = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            items.append({
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text
            })
            text_parts.append(text)

    print(json.dumps({
        "language": info.language,
        "languageProbability": round(float(info.language_probability), 4),
        "text": " ".join(text_parts).strip(),
        "segments": items
    }))
except Exception as exc:
    print(str(exc), file=sys.stderr)
    sys.exit(3)
