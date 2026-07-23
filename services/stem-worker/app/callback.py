"""Reports a job's outcome back to apps/api - the other end of this is
apps/api/src/routes/song-stems.ts's callback route, gated by the
requireWorkerSecret middleware."""

import httpx

from app.config import settings


async def report_success(callback_url: str, callback_token: str, stems: dict[str, str]) -> None:
    await _post(callback_url, {"callbackToken": callback_token, "stems": stems})


async def report_failure(callback_url: str, callback_token: str, error: str) -> None:
    await _post(callback_url, {"callbackToken": callback_token, "error": error})


async def _post(callback_url: str, body: dict) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            callback_url,
            json=body,
            headers={"Authorization": f"Bearer {settings.stem_callback_secret}"},
        )
        response.raise_for_status()
