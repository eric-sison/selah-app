import { writeFile } from "node:fs/promises"
import path from "node:path"
import { app, openApiConfig } from "../app.js"

const document = app.getOpenAPIDocument(openApiConfig)
const outPath = path.resolve(import.meta.dirname, "../../openapi.json")

await writeFile(outPath, JSON.stringify(document, null, 2) + "\n")

console.log(`Wrote OpenAPI spec to ${outPath}`)
