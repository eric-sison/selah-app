"""Garage/S3 upload helper - mirrors the shape of
apps/api/src/lib/storage.ts's uploadObject, but this worker only ever needs
write access (it receives a presigned GET URL for the source audio in the
job payload, so it never needs read credentials of its own)."""

import boto3

from app.config import settings

_s3 = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    region_name=settings.s3_region,
    aws_access_key_id=settings.s3_access_key_id,
    aws_secret_access_key=settings.s3_secret_access_key,
)


def upload_stem(key: str, path: str, content_type: str) -> None:
    _s3.upload_file(path, settings.s3_bucket, key, ExtraArgs={"ContentType": content_type})
