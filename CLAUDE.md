# CLAUDE.md

## Project Structure

This repository is a monorepo.

```
apps/
├── web    # Next.js frontend
└── api    # Backend API
```

Always determine which application you are working in before making changes.

---

## General Guidelines

- Follow the existing code style of the surrounding files.
- Prefer modifying existing code over introducing new abstractions.
- Keep implementations simple and readable.
- Avoid unnecessary comments. Write self-documenting code instead.
- Do not introduce `any` unless explicitly requested.
- Preserve strict TypeScript typings.
- Use named exports unless a framework convention requires otherwise.

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

# apps/api

- Prefer named exports.
- Keep business logic out of route handlers whenever practical.
- Validate external input before processing.
- Maintain strong TypeScript types throughout the request lifecycle.

---

## TypeScript

- Prefer `interface` for object shapes.
- Prefer `type` for unions, mapped types, and utility types.
- Avoid `as` casts unless unavoidable.
- Prefer explicit return types for exported functions.

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

---

When generating code, follow these conventions unless the existing file clearly uses a different established pattern.
