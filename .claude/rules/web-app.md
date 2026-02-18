---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Web App Rules (Next.js / React)

## Stack
- Next.js 16 + React 19 (App Router)
- TypeScript strict mode
- Supabase Auth (SSR)
- shadcn/ui + TailwindCSS 4
- Zustand (state management)
- next-intl (i18n)

## Code Style
- 함수형 컴포넌트 + hooks only
- camelCase (variables, functions), PascalCase (components, types)
- Custom hooks: `use` prefix
- 'use client' directive for client components

## Project Structure
- `app/` — Next.js App Router pages + API routes
- `app/api/` — Server-side API routes
- `components/` — React components by domain
- `components/ui/` — shadcn/ui base components
- `hooks/` — Custom React hooks
- `lib/` — Utilities, API clients, Supabase
- `lib/audio/` — Web Audio API utilities (recorder, player, VAD)
- `shared/` — Type definitions
- `messages/` — i18n translations

## Patterns
- API Routes: Next.js Route Handlers (app/api/)
- State: Zustand stores (hooks/useDashboard.ts)
- Data fetching: Server Components or client fetch via lib/api.ts
- Auth: Supabase SSR middleware (middleware.ts + lib/supabase/)
- Audio: Web Audio API (AudioWorklet + ScriptProcessorNode fallback)
