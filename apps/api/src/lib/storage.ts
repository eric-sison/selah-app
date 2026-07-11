import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../utils/env.js"

// Long enough that a full song plays back without the browser's mid-stream
// range requests hitting an expired signature.
const STREAM_URL_TTL_SECONDS = 60 * 60

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true, // required for Garage's S3-compatible API
})

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
}

// Plain presigned GET, meant for <audio> playback - no Content-Disposition
// override, so the browser treats it as a normal streamable resource.
export async function getStreamUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn: STREAM_URL_TTL_SECONDS,
  })
}

// Same object, but with Content-Disposition: attachment so navigating to it
// triggers a save-as download instead of inline playback - this works even
// though the URL is cross-origin, since it's a response header from Garage
// itself rather than the <a download> attribute (which browsers ignore for
// cross-origin URLs).
export async function getDownloadUrl(key: string, filename: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: STREAM_URL_TTL_SECONDS }
  )
}
