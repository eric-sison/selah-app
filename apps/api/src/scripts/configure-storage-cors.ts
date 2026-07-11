import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3"
import { env } from "../utils/env.js"

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
})

// The Web Audio API (used for the "now playing" waveform) requires CORS-
// cleared audio, unlike plain <audio> playback which doesn't care - without
// this, AnalyserNode silently reads zeros instead of throwing, which looks
// like a bug rather than a missing bucket policy.
//
// Uses "*" rather than env.ALLOWED_ORIGINS: the Access-Control-Allow-Origin
// response header can only ever hold a single value (or "*"), never a list -
// real S3 is supposed to match the request's Origin against multiple
// configured AllowedOrigins and echo back just the match, but Garage
// (v2.3.0) instead echoes all configured origins joined together, which
// browsers reject outright. A wildcard sidesteps that, and is safe here
// since these are unauthenticated presigned-URL requests, not
// cookie/credentialed ones.
async function configureStorageCors() {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: env.S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  )

  console.log(`CORS policy applied to bucket "${env.S3_BUCKET}" (AllowedOrigins: *).`)
}

configureStorageCors().catch((err: unknown) => {
  console.error("Failed to configure bucket CORS:", err)
  process.exit(1)
})
