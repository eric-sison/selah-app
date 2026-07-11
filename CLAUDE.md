# CLAUDE.md

## Project Structure

This repository is a pnpm + Turborepo monorepo.

```
apps/
├── web       # Next.js frontend (App Router)
└── api       # Hono backend
packages/
├── ui                 # @workspace/ui — shared shadcn-based components (Tailwind v4)
├── eslint-config       # @workspace/eslint-config
└── typescript-config   # @workspace/typescript-config
docker-compose.yml       # local Postgres, Mailpit, and Garage (S3-compatible storage) for apps/api
```

Always determine which application you are working in before making changes.

---

## General Guidelines

- Follow the existing code style of the surrounding files.
- Prefer modifying existing code over introducing new abstractions.
- Keep implementations simple and readable.
- Avoid comments that restate what the code already says. Short "why, not what"
  comments explaining a non-obvious decision, constraint, or workaround are
  expected and used throughout the codebase (e.g.
  [require-admin.ts](apps/api/src/middleware/require-admin.ts),
  [proxy.ts](apps/web/proxy.ts)) — keep that pattern, don't strip it out.
- Do not introduce `any` unless explicitly requested.
- Preserve strict TypeScript typings.
- Use named exports unless a framework convention requires otherwise (Next.js
  page components are the main exception — see below).
- There is no test framework configured anywhere in this repo (no vitest/jest,
  no `*.test.ts`). Don't invent test conventions or add test files unless
  explicitly asked to set testing up.

---

## Git Commits

Conventional commits with scope, lowercase after the colon:

```
feat(api): added global error handling
feat(auth): completed the auth flow
chore(web): re-arrange imports
chore: changed children type to PropsWithChildren
```

Use `feat`/`fix`/`chore` (and others as needed) with an `(api)`/`(web)`/`(auth)`
scope when the change is localized; omit the scope for cross-cutting changes.

---

# apps/web

## Next.js Pages

For route pages, always use a default function declaration.

```tsx
export default function UsersPage() {
  return <div />
}
```

Never use:

```tsx
const UsersPage = () => {}

export default UsersPage
```

or

```tsx
export default () => {}
```

---

## React Components

For reusable components, use typed function components.

```tsx
import type { FunctionComponent } from 'react'

interface UserCardProps {
  // ...
}

export const UserCard: FunctionComponent<UserCardProps> = () => {
  return (...)
}
```

Use Pascal case for naming component files

```tsx
ThemeProvider.tsx
SessionProvider.tsx
```

Do not use:

```tsx
export function UserCard() {}
```

or

```tsx
const UserCard = () => {}
```

---

## Component Props

- Name props as `<ComponentName>Props`.
- Declare props immediately above the component.
- Export props only when reused elsewhere.

Example:

```tsx
interface ButtonProps {
  children: ReactNode
}

export const Button: FunctionComponent<ButtonProps> = ({ children }) => {
  return <button>{children}</button>
}
```

---

## UI Components (`@workspace/ui`)

Shared, design-system-level components live in `packages/ui/src/components`
(e.g. `Button`, `Card`, `Field`, `Input`, `Sonner`) and are consumed via
subpath imports, not a barrel file:

```tsx
import { Button } from "@workspace/ui/components/Button"
```

- Add genuinely reusable, presentation-only components to `packages/ui`.
  Feature-specific components (forms, page sections) stay in
  `apps/web/components`.
- The package is Tailwind v4 + `class-variance-authority` + `@base-ui/react`
  (shadcn-style). Match that pattern for new shared components rather than
  introducing a different styling approach.
- `apps/web` marks it `transpilePackages: ["@workspace/ui"]` in
  `next.config.ts` — new components don't need extra wiring beyond that.

---

## Auth & Sessions

Two-layer defense, both required for a new protected route group — don't rely
on just one:

1. **Edge (cheap, optimistic):** [proxy.ts](apps/web/proxy.ts) is Next
   middleware that only checks for the presence of the session cookie
   (`_ssid`, matching the API's custom cookie name in
   [auth.ts](apps/api/src/lib/auth.ts)). It redirects unauthenticated users to
   `/auth/sign-in?redirect=...` and bounces authenticated users away from
   `/auth/*`. It cannot validate the session — it only knows the cookie
   exists.
2. **Server (real validation):** [lib/session.ts](apps/web/lib/session.ts)'s
   `getServerSession()` (wrapped in React `cache()` for per-request dedup)
   calls the API's `/api/auth/get-session` with forwarded cookies;
   `verifySession()` redirects if null. Protected layouts (e.g.
   `app/(protected)/layout.tsx`) call this and wrap children in
   `SessionProvider` (`components/SessionProvider.tsx`) so client components
   can read the session via `useSession()` without refetching.

Client-side auth actions (sign in/up, social, link account) go through
[lib/auth-client.ts](apps/web/lib/auth-client.ts) (`better-auth/react`), not
manual API calls.

---

## Data Fetching & Forms

- Use TanStack Query (`useMutation`/`useQuery`) for all API interaction from
  client components — never fetch-on-render via `useEffect`. `QueryProvider`
  creates one `QueryClient` per component instance (`useState(() => new
QueryClient())`) to avoid cross-request state leakage; follow that when
  adding providers.
- Forms use TanStack Form (`@tanstack/react-form`), consistent across
  `SignInForm.tsx`, `SignUpForm.tsx`, `InviteForm.tsx`: a Zod schema passed as
  `validators: { onSubmit: schema }`, `defaultValues`, and `onSubmit`
  delegating to a `useMutation`'s `mutateAsync`. Field rendering uses
  `@workspace/ui`'s `Field`/`FieldLabel`/`FieldError`/`FieldGroup` with:

  ```ts
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  ```

  Match this shape for new forms rather than introducing a different form
  library or validation pattern.
- `mutateAsync` rethrows on failure (so `onError` fires and a caller can also
  react), and TanStack Form's `handleSubmit` rethrows again on top of that.
  Forms here submit via `void form.handleSubmit()` (fire-and-forget) — if
  that rethrown error isn't caught, it becomes an unhandled promise
  rejection, which surfaces as a crashed-looking page instead of the toast
  you already show. Since the mutation's `onError` is the actual user-facing
  error handling, swallow the rethrow at the call site rather than letting
  it propagate:

  ```ts
  onSubmit: async ({ value }) => {
    await mutation.mutateAsync(value).catch(() => {})
  },
  ```

---

## Calling the API

`web` calls typed JSON endpoints through the generated client, not raw
`fetch` (server-only concerns like reading the session cookie in
[lib/session.ts](apps/web/lib/session.ts) are the deliberate exception —
that endpoint isn't part of the OpenAPI-described contract surface):

```ts
import { apiClient } from "@/lib/api-client"

const { data, error } = await apiClient.GET("/api/invitations/{token}", {
  params: { path: { token } },
})
```

- `apps/web/lib/api-client.ts` — the `openapi-fetch` client (`apiClient`),
  typed against the API's OpenAPI spec.
- `apps/web/types/api.ts` — generated `paths`/`operations` types. **Do not
  hand-edit this file.**
- After adding or changing a route in `apps/api`, regenerate both from the
  repo root: `pnpm openapi:generate`. Commit the regenerated files — they're
  checked in, not gitignored, so `web` can build without needing the API's
  env vars available.
- Known exception not yet cleaned up: `components/InviteForm.tsx` currently
  calls `fetch("/api/invitations", ...)` directly instead of `apiClient`. Follow
  the `apiClient` pattern for new code regardless.

---

# apps/api

- Prefer named exports.
- Keep business logic out of route handlers whenever practical.
- Validate external input before processing.
- Maintain strong TypeScript types throughout the request lifecycle.

## Layering

`route → service → db`. Routes ([routes/invitations.ts](apps/api/src/routes/invitations.ts))
define the Zod-OpenAPI contract and a thin handler; business logic lives in
`services/*.ts` (e.g. `services/invitations.ts`); services call `db`
(Drizzle) directly. Don't put query logic or business rules in route
handlers — add or extend a service function instead.

## Request Context & Middleware

Every route/middleware shares one Hono generic,
[types/request-context.ts](apps/api/src/types/request-context.ts)'s
`RequestContext` (`Variables: { logger, user, session }`). Use
`Context<RequestContext>` / `createMiddleware<RequestContext>` for any new
middleware or handler rather than an ad hoc context type.

- `middleware/auth-session.ts` runs globally, resolves the session, and sets
  `user`/`session` to `null` on failure rather than rejecting — it does not
  enforce auth.
- `middleware/require-auth.ts` throws `HTTPException(401)` if there's no user;
  `middleware/require-admin.ts` is self-contained (not composed from
  `requireAuth`) so it 401s before it 403s. Attach these via
  `createRoute({ middleware: [...] })` on individual routes, not `app.use`.

## Error Handling

Errors are centralized in
[middleware/error-handler.ts](apps/api/src/middleware/error-handler.ts),
branching in this order: `ZodError` → 422 (`z.treeifyError`) → `better-auth`'s
`APIError` → its status → `HTTPException` → its status → fallback 500 (stack
trace only outside production). Every response uses the shared
`{status, message, code?}` shape (`ErrorResponseSchema` in
[error-reponses.ts](apps/api/src/utils/error-reponses.ts)). When adding a
route, reuse `jsonBody`/`jsonResponse`/`commonErrors` from that file for
request/response schemas instead of writing shapes inline, and let unexpected
errors bubble up to `onError` rather than catching and reformatting them
locally.

## Environment Variables

Validate env with a single Zod schema, `safeParse`d once at module load,
throwing on failure — see [utils/env.ts](apps/api/src/utils/env.ts) (and
`AdminSeedEnvSchema` in `scripts/seed-admin.ts` for a script-scoped example).
New env vars go through this schema, not `process.env` accessed directly at
the call site.

## Routes & OpenAPI

- Routes are defined with `createRoute` + `OpenAPIHono` from
  `@hono/zod-openapi` (see
  [invitations.ts](apps/api/src/routes/invitations.ts)), not plain Hono
  handlers — this is what generates the OpenAPI spec `web` relies on for
  typed API calls.
- `src/app.ts` builds and exports the `OpenAPIHono` app (routes, middleware,
  the `/api/docs` Scalar UI); `src/index.ts` only imports it and calls
  `serve`. Keep it this way — `src/scripts/generate-openapi-spec.ts` imports
  `app.ts` directly so it can produce `openapi.json` without booting a
  server.
- Every new/changed route needs `pnpm openapi:generate` (from repo root)
  rerun and its output committed, or `web`'s generated types go stale.

## Database

Drizzle ORM over `pg` (`drizzle-orm/node-postgres`), config in
[drizzle.config.ts](apps/api/drizzle.config.ts). Schema is split across
[db/schema.ts](apps/api/src/db/schema.ts) (better-auth-owned tables, JS
exports `user`/`session`/`account`/`verification` backed by SQL tables
`users`/`sessions`/`accounts`/`verifications`) and
[db/app-schema.ts](apps/api/src/db/app-schema.ts) (app-owned tables, e.g. JS
export `invitation` backed by SQL table `invitations`, importing `user` from
`schema.ts` for FKs); [db/index.ts](apps/api/src/db/index.ts) merges both
into one `db` client.

Conventions to follow for new tables:

- SQL table names are plural (`songs`, not `song`); the JS export/variable
  name stays singular (`export const song = pgTable("songs", ...)`) since
  it's referred to elsewhere as a single-row concept. better-auth's adapter
  is configured with `usePlural: true` in
  [lib/auth.ts](apps/api/src/lib/auth.ts) to match this for its own tables.
- SQL columns are `snake_case`, mapped from `camelCase` JS fields.
- `id: uuid().primaryKey().defaultRandom()` — DB-generated via Postgres's
  `gen_random_uuid()`, not a serial column and not app-generated in JS. This
  applies to app-owned tables only (`invitation`, `song`); better-auth's own
  tables (`user`/`session`/`account`/`verification` in `schema.ts`) keep
  `text` ids because better-auth generates and sets those itself. If a
  table's row needs its own id before insert (e.g. to build a derived value
  like an object storage key), insert first, read the generated id back off
  `.returning()`, then `update` — see `services/songs.ts`'s `createSong`.
- `createdAt`/`updatedAt` use `.defaultNow()` and `.$onUpdate(() => new Date())`.
- Declare `relations(...)` separately per table.
- Index FK columns (see `session_userId_idx`, `account_userId_idx`).

Workflow: `pnpm db:generate` (drizzle-kit generate) → `pnpm db:migrate`.
Migrations are committed under `src/db/migrations` — never hand-edit a
generated migration file. `pnpm db:studio` for local inspection;
`pnpm db:seed:admin` seeds an admin user from `ADMIN_EMAIL`/`PASSWORD`/`NAME`
env vars (requires local Postgres via `docker-compose.yml`).

Renaming a table or column: plain `drizzle-kit generate` can't detect a
rename non-interactively (it needs a TTY prompt to disambiguate "renamed"
from "dropped + created", and errors out otherwise rather than guessing —
never work around this by letting it fall back to drop + create, since that
cascades and deletes real data). Instead run
`drizzle-kit generate --custom --name <name>` to get a blank migration, write
the real `ALTER TABLE ... RENAME ...` SQL into it by hand, and manually
update the table's `"name"` field (and any `foreignKeys[].tableFrom` /
`tableTo` referencing it) in the newly generated snapshot under
`src/db/migrations/meta/` so future `db:generate` diffs against the correct
state instead of re-proposing the same rename.

## Object Storage (Garage)

File uploads (currently: song audio + album art) go to
[Garage](https://garagehq.deuxfleurs.fr/), a self-hosted, FOSS,
S3-API-compatible object store — chosen deliberately over MinIO. It runs as
the `garage` service in [docker-compose.yml](docker-compose.yml) (config at
`garage/garage.toml`), alongside `garage-webui` (an unofficial third-party
browser dashboard, http://localhost:3909, no auth — local dev only) for
browsing bucket contents.

- A fresh Garage node has no cluster layout, bucket, or key until
  `pnpm garage:init` ([scripts/garage-init.sh](scripts/garage-init.sh)) runs
  once — unlike Postgres/Mailpit, this isn't zero-config. The script is
  idempotent and re-prints the existing key's secret on repeat runs instead
  of failing.
- [lib/storage.ts](apps/api/src/lib/storage.ts) wraps `@aws-sdk/client-s3`
  with `forcePathStyle: true` (required for Garage) and exports a single
  `uploadObject(key, body, contentType)` helper — reuse it for any new
  object type rather than writing another S3 client.
- Config comes through the same `env.ts` Zod schema as everything else:
  `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`.
- Object keys embed the owning row's DB-generated id (e.g.
  `songs/${id}/...`) — since the id isn't known until insert, services
  insert first, read the id back off `.returning()`, upload, then `update`
  the row with the storage key(s). See `services/songs.ts`'s `createSong`.
- No route serves stored files back to the browser yet (no playback, no
  album-art thumbnails) — this was deliberately deferred, not an oversight.
  Adding it means either presigned GET URLs (`@aws-sdk/s3-request-presigner`,
  not yet a dependency) or a proxy route; pick one deliberately rather than
  bolting on an ad hoc `fetch` from a component.
- Garage major-version upgrades (e.g. v1→v2) are in-place image-tag swaps
  with no data migration needed, but do rework the CLI's output formats —
  re-verify `garage-init.sh`'s `grep` checks against the new version's output
  before assuming it still works.

---

## TypeScript

- Prefer `interface` for object shapes.
- Prefer `type` for unions, mapped types, and utility types.
- Avoid `as` casts unless unavoidable.
- Prefer explicit return types for exported functions.
- Both `apps/api` and `apps/web` extend `@workspace/typescript-config` with
  `strict: true` and `noUncheckedIndexedAccess: true` — don't work around
  either with non-null assertions unless a comment explains why it's safe
  (see the `requireAdmin`-guarantees-non-null pattern in
  [invitations.ts](apps/api/src/routes/invitations.ts)).

---

## Imports

- Group imports by:
  1. External packages
  2. Internal packages
  3. Relative imports

- Remove unused imports.

- Prefer type-only imports where applicable.

---

## Code Style

- Keep functions focused on a single responsibility.
- Prefer early returns over nested conditionals.
- Avoid deeply nested logic.
- Extract repeated logic into reusable utilities.
- No semicolons, double quotes, 110-char print width (Prettier, `.prettierrc`
  — run `pnpm format` rather than hand-formatting).
- `apps/api` and `apps/web` internal files use kebab-case (`error-handler.ts`,
  `auth-session.ts`, `api-client.ts`); component files are PascalCase (see
  React Components above). Exception: TanStack Table column definitions
  (`apps/web/components/features/`) are named `columns-<name>.tsx` — e.g.
  `columns-songs.tsx` exporting `songsColumns`.

---

When generating code, follow these conventions unless the existing file clearly uses a different established pattern.
