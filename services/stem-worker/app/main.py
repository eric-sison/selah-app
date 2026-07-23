"""FastAPI entrypoint - accepts a separation job from apps/api, runs it in
the background, and reports the outcome via callback.py. The job payload
shape here must match what apps/api/src/services/song-stems.ts's
startStemSeparation() sends.
"""

import asyncio
import logging
import shutil
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app import callback, encode, separation, storage
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stem-worker")

app = FastAPI(title="stem-worker")

# Bounds how many Demucs runs happen at once regardless of how many jobs
# arrive - each run is CPU/RAM (or GPU) heavy, see config.py.
_job_semaphore = asyncio.Semaphore(settings.max_concurrent_jobs)


class JobRequest(BaseModel):
    # apps/api/src/services/song-stems.ts sends camelCase JSON (its own
    # TS-native field names) - aliased here rather than changing that side,
    # so each language stays idiomatic on its own end of the boundary.
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    job_id: str
    song_id: str
    source_url: str
    callback_url: str
    callback_token: str


def _require_worker_secret(authorization: str | None) -> None:
    token = (
        authorization.removeprefix("Bearer ")
        if authorization and authorization.startswith("Bearer ")
        else None
    )
    if token != settings.stem_worker_secret:
        raise HTTPException(status_code=401)


@app.post("/jobs", status_code=202)
async def create_job(
    job: JobRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict[str, str]:
    _require_worker_secret(authorization)
    # Returns immediately - apps/api doesn't wait for separation to finish,
    # it learns the outcome via the callback below once _run_job completes.
    background_tasks.add_task(_run_job, job)
    return {"status": "accepted"}


async def _run_job(job: JobRequest) -> None:
    async with _job_semaphore:
        work_dir = Path(settings.work_dir) / job.job_id
        try:
            work_dir.mkdir(parents=True, exist_ok=True)
            source_path = await _download(job.source_url, work_dir / "source")

            # Demucs/ffmpeg are both blocking, CPU-bound calls - offloaded to
            # a thread so they don't stall other jobs' downloads/callbacks
            # sharing this event loop.
            wav_paths = await asyncio.to_thread(separation.separate, source_path, work_dir / "raw")

            stem_keys: dict[str, str] = {}
            for stem_name, wav_path in wav_paths.items():
                encoded_path = await asyncio.to_thread(
                    encode.encode, wav_path, work_dir / "encoded", stem_name
                )
                key = f"songs/{job.song_id}/stems/{stem_name}.{encode.extension()}"
                await asyncio.to_thread(storage.upload_stem, key, str(encoded_path), encode.content_type())
                stem_keys[stem_name] = key

            await callback.report_success(job.callback_url, job.callback_token, stem_keys)
        except Exception as err:
            logger.exception("Stem separation job %s failed", job.job_id)
            try:
                await callback.report_failure(job.callback_url, job.callback_token, str(err))
            except Exception:
                logger.exception("Also failed to report failure for job %s", job.job_id)
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)


async def _download(url: str, dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(dest, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
    return dest
