"""Runs Demucs source separation on a local audio file.

Demucs (not classic DSP like center-channel cancellation or notch filtering)
is what actually produces clean, low-artifact stems - see the model choice
rationale in the feature's plan doc. This wraps demucs' programmatic API
(not the `demucs` CLI) so the worker can run inference in-process.
"""

from pathlib import Path

from demucs.api import Separator, save_audio

from app.config import settings

# Demucs' documented, fixed source order for htdemucs_6s - see
# https://github.com/facebookresearch/demucs. Not derived from the model at
# runtime: if a future model swap changes this, separate() below fails loudly
# with a KeyError (caught by main.py's job runner and reported as a failed
# job) rather than silently mislabeling stems.
STEM_NAMES = ("vocals", "drums", "bass", "guitar", "piano", "other")


def separate(source_path: Path, out_dir: Path) -> dict[str, Path]:
    """Splits `source_path` into the 6 htdemucs_6s stems as raw WAV files
    under `out_dir`, returning each stem name mapped to its output path.

    Runs on CPU (Separator's own default), with `shifts` left at Separator's
    own default (1 pass, no ensembling) - see config.py's
    MAX_CONCURRENT_JOBS for the concurrency bound that exists precisely
    because each run is this heavy; GPU hosting is a separate deployment
    decision, not handled here.
    """
    separator = Separator(model=settings.demucs_model)
    _origin, separated = separator.separate_audio_file(str(source_path))

    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for stem_name in STEM_NAMES:
        stem_path = out_dir / f"{stem_name}.wav"
        save_audio(separated[stem_name], str(stem_path), samplerate=separator.samplerate)
        paths[stem_name] = stem_path

    return paths
