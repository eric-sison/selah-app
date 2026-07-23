"""Encodes raw WAV stems to the configured output format via an ffmpeg
subprocess. A raw WAV stem is often larger than the original compressed
source file, so this matters for storage size even at the default lossless
(FLAC) setting - see config.py's OUTPUT_FORMAT for the quality/size tradeoff
this is deliberately left configurable for.
"""

import subprocess
from pathlib import Path

from app.config import settings

_EXTENSIONS = {"flac": "flac", "aac": "m4a", "mp3": "mp3"}
_CONTENT_TYPES = {"flac": "audio/flac", "aac": "audio/mp4", "mp3": "audio/mpeg"}
_CODEC_ARGS = {
    "flac": ["-c:a", "flac"],
    "aac": ["-c:a", "aac", "-b:a", "192k"],
    "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"],
}


def extension() -> str:
    return _EXTENSIONS[settings.output_format]


def content_type() -> str:
    return _CONTENT_TYPES[settings.output_format]


def encode(wav_path: Path, out_dir: Path, stem_name: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{stem_name}.{extension()}"

    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wav_path), *_CODEC_ARGS[settings.output_format], str(out_path)],
        check=True,
        capture_output=True,
    )
    return out_path
