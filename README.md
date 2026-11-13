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
| `src/app` | Pages and layouts; the library is under `/library` (`stations`, `exercises`, `equipment`) |
| `src/components/ui` | shadcn/ui components |
| `src/db` | Database schema and client |
| `src/lib/auth` | Google sign-in through Neon Auth and the current user |
| `src/lib/access` | Access checks for groups, seasons, sessions and library items |
| `src/lib/data` | Data layer: reads and writes, each authorised on the server |
| `src/lib/library.ts` | Library helpers: access rules, search, equipment lines |
| `src/lib/outline.ts` | The session outline editor's model: parts, activities and their station and exercise links |
| `src/lib/weeks.ts` | Week helpers: Mondays, ISO week numbers |
| `src/i18n` | Language configuration |
| `messages` | Interface text, one file per language |
| `drizzle` | Database migrations |
