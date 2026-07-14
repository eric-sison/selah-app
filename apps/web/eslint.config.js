import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    // Copied verbatim from @soundtouchjs/audio-worklet at dev/build time
    // (see scripts/copy-soundtouch-worklet.mjs) - gitignored, not app source.
    ignores: ["public/soundtouch-processor.js"],
  },
]
