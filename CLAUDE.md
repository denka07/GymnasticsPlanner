@AGENTS.md

# GymnasticsPlanner

Web app for a gymnastics coach to plan seasons and training sessions.

## Docs
- `docs/data-model.md` — source of truth for entities.
- `docs/implementation-plan.md` — stack and build order.

## Conventions
- Interface text is Swedish and lives only in `messages/sv.json`, read through next-intl. Never hard-code user-visible text in components. Code, database names, comments and docs are in English.
- Database schema lives in `src/db/schema.ts`. After changing it run `npm run db:generate` and commit the generated migration in `drizzle/`. Never edit an applied migration. Locally `DATABASE_URL` is the Neon branch `dev`; production is migrated by the `vercel-build` script on deploy, so never run migrations against production by hand.
- Every read and write is authorised on the server against ownership and shares. Hiding things in the UI is not enough.
- UI components come from shadcn/ui (`npx shadcn@latest add <name>`).
- Before committing run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
- Never commit to `main`; work on a branch. Never commit `.env.local` or print secrets.

## npm scripts
- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — run the Vitest unit tests once
- `npm run db:generate` — generate a Drizzle migration from the schema
- `npm run db:migrate` — apply migrations to `DATABASE_URL` (the `dev` branch locally)
