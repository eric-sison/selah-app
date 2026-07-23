"""Environment configuration - mirrors apps/api/src/utils/env.ts's pattern of
loading all config through a single validated object rather than reading
os.environ directly wherever a value is needed."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Bearer token apps/api must present when POSTing a job here - matches
    # apps/api's STEM_WORKER_SECRET.
    stem_worker_secret: str

    # Bearer token this worker presents when POSTing the completion callback
    # back to apps/api - matches apps/api's STEM_CALLBACK_SECRET.
    stem_callback_secret: str

    # Garage/S3-compatible storage this worker uploads stems to directly
    # (see services/song-stems.ts's "worker uploads directly" design note) -
    # a separate, write-only key from apps/api's own S3_ACCESS_KEY_ID,
    # ideally scoped as narrowly as Garage's permission model allows.
    s3_endpoint: str
    s3_region: str = "garage"
    s3_bucket: str = "selah-songs"
    s3_access_key_id: str
    s3_secret_access_key: str

    # htdemucs_6s is Demucs' 6-source model (vocals/drums/bass/guitar/piano/
    # other) - the only pretrained model that can isolate piano at all, so
    # this is the default despite guitar/piano separation being noticeably
    # lower quality than the plain 4-stem htdemucs model (Demucs' own docs
    # call it "experimental" - trained on far less isolated guitar/piano
    # data). Kept configurable in case that tradeoff needs revisiting.
    demucs_model: str = "htdemucs_6s"

    # FLAC (lossless) by default per the "minimal to no noise" requirement -
    # stems get pitch/time-stretched again client-side (SoundTouch), so
    # avoiding a second lossy encode matters more here than file size. Set to
    # "aac" or "mp3" to trade quality for smaller stored files.
    output_format: str = "flac"

    # How many Demucs runs to allow at once - each is CPU/RAM (or GPU)
    # heavy, so this bounds worst-case resource usage rather than queuing
    # unboundedly. Size against actual deployment hardware.
    max_concurrent_jobs: int = 1

    # Local scratch space for downloaded source audio and Demucs' own output
    # tree, cleaned up after each job regardless of outcome.
    work_dir: str = "/tmp/stem-worker"


settings = Settings()
