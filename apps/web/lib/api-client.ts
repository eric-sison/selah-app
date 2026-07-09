import createClient from "openapi-fetch"
import type { paths } from "@/types/api"

const API_URL = process.env.API_URL ?? "http://localhost:4000"

export const apiClient = createClient<paths>({ baseUrl: API_URL })
