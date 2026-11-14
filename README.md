# GymnasticsPlanner

A web platform for planning gymnastics seasons and the training sessions within them.

- [Data model](docs/data-model.md)
- [Implementation plan](docs/implementation-plan.md)

## Development

Requires Node.js 20 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The site runs at http://localhost:3000.

### Trying it without Google, with several accounts

Set `DEV_SIGN_IN_EMAIL` in `.env.local` (see `.env.example`) to be signed in as the test user "Dev Coach" without Google. This works only under `npm run dev`; production builds and tests ignore it (`src/lib/auth/dev-sign-in.ts`).

While it is on, the header shows a "Testanvändare" switcher for trying sharing with two accounts: Coach (`DEV_SIGN_IN_EMAIL`), Hjälptränare (`helper@example.test`) and Ny (`newcomer@example.test`). The choice is kept in the `dev_user` cookie. Share something as Coach with `helper@example.test`, then switch to Hjälptränare to see it under "Delat med mig". Ny has not signed in until you first switch to it, so it shows how a share waits for someone who has not signed in yet.

Dev Coach is an administrator in the `dev` database, so the switcher also tries the global library: as Coach, create a global station or exercise (or use "Gör global" on a personal one) and review submissions under Bibliotek → Granskning; as Hjälptränare, see global items read-only, use "Kopiera till mina", add your own exercises to a global station and send a personal item with "Skicka in för granskning".

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run the TypeScript compiler without output |
| `npm test` | Run the unit tests with Vitest |
| `npm run db:generate` | Create a migration from changes in `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL` (locally: the `dev` branch) |

## Databases

The Neon project has two branches. Production deployments on Vercel use the default branch. Local development uses the branch `dev`, set as `DATABASE_URL` in `.env.local`.

Run `npm run db:migrate` locally to apply migrations to `dev`. Production is migrated automatically: Vercel runs the `vercel-build` script, which applies pending migrations before building a production deployment. Preview deployments are never migrated.

## Layout

| Path | Contents |
|---|---|
| `src/app` | Pages and layouts; the library is under `/library` (`stations`, `exercises`, `equipment`, and `review` for administrators) |
| `src/components/ui` | shadcn/ui components |
| `src/db` | Database schema and client |
| `src/lib/auth` | Google sign-in through Neon Auth and the current user |
| `src/lib/access` | Access checks for groups, seasons, sessions and library items, from ownership and shares; the pure rules are in `levels.ts` |
| `src/lib/data` | Data layer: reads and writes, each authorised on the server |
| `src/lib/library.ts` | Library rules and helpers: access, who may change which station–exercise links, copy, submit, withdraw, review and make global; search, equipment lines |
| `src/lib/outline.ts` | The session outline editor's model: parts, activities and their station and exercise links |
| `src/lib/weeks.ts` | Week helpers: Mondays, ISO week numbers |
| `src/i18n` | Language configuration |
| `messages` | Interface text, one file per language |
| `drizzle` | Database migrations |
