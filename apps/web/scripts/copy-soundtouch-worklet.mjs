import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const src = require.resolve("@soundtouchjs/audio-worklet/processor")

mkdirSync(new URL("../public/", import.meta.url), { recursive: true })
copyFileSync(src, new URL("../public/soundtouch-processor.js", import.meta.url))
