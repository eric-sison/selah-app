# CLAUDE.md

## Monorepo

- pnpm + Turborepo
- apps/
  - web → Next.js App Router
  - api → Hono
- packages/ui → shared UI components
- Determine whether you're working in `web` or `api` before making changes.

## General

- Follow existing code style.
- Prefer modifying existing code over adding abstractions.
- Keep code simple and readable.
- Comments should explain **why**, not **what**.
- No `any`.
- Preserve strict TypeScript.
- Prefer named exports unless framework conventions require otherwise.

## Git

Use conventional commits.

Examples:

- feat(api): add invitation endpoint
- fix(web): correct session handling
- chore: update dependencies

---

# apps/web

## Pages

Always:

```tsx
export default function UsersPage() {}
```

Never arrow-function default exports.

## Components

Use typed function components.

```tsx
interface ButtonProps {}

export const Button: FunctionComponent<ButtonProps> = () => {}
```

- PascalCase filenames.
- Props named `<Component>Props`.

## UI

- Shared presentational components → `packages/ui`
- Feature-specific components → `apps/web/components`

## Auth

Two layers:

1. proxy.ts → cookie presence
2. getServerSession()/verifySession() → actual validation

Client auth uses `auth-client.ts`.

## Data Fetching

- TanStack Query only.
- No fetch inside `useEffect`.
- Loading UI = Skeletons (not spinners).

Forms:

- TanStack Form
- Zod validation
- Swallow `mutateAsync()` rethrows.

## API

Use generated `apiClient`.

Never hand-edit generated API types.

Run:

```
pnpm openapi:generate
```

after API changes.

## lib vs utils

- lib → clients/integrations
- utils → pure helper functions

## Testing

Vitest

- One test beside every component/util.
- 100% coverage.
- Reuse existing test utilities.

Playwright

- Reuse existing auth setup.
- Clean up created data.

---

# apps/api

## Architecture

```
Route
  ↓
Service
  ↓
Database
```

Business logic belongs in services.

## Request Context

Reuse shared `RequestContext`.

Use middleware:

- auth-session
- require-auth
- require-admin

## Errors

Let centralized error handler respond.

Reuse common error schemas.

## Environment

All env vars go through the Zod schema.

Never access `process.env` directly.

## Routes

Use `createRoute()` with OpenAPI.

Regenerate OpenAPI after route changes.

## Database

Drizzle ORM.

Conventions:

- plural table names
- singular JS exports
- snake_case columns
- UUID PK
- createdAt / updatedAt
- relations + indexes

Normal workflow:

```
db:generate
db:migrate
```

Use custom migrations for renames.

## Storage

Garage (S3-compatible)

Reuse storage helpers:

- uploadObject
- getStreamUrl
- getDownloadUrl

Object keys include DB IDs.

## Testing

Vitest

- Service tests only.
- Mock DB + Storage.
- 100% coverage.

---

# TypeScript

- interface → objects
- type → unions
- Avoid `as`
- Prefer explicit exported return types
- Respect strict mode

# Imports

1. External
2. Internal
3. Relative

Remove unused imports.

Prefer `import type`.

# Style

- Small focused functions.
- Early returns.
- Avoid deep nesting.
- Extract repeated logic.
- No semicolons.
- Double quotes.
- 110-char width.
- kebab-case files (except React components).

Follow existing project conventions when a file already establishes a pattern.
