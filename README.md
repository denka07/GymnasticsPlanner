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
| `npm run db:generate` | Create a migration from changes in `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database in `DATABASE_URL` |

## Layout

| Path | Contents |
|---|---|
| `src/app` | Pages and layouts |
| `src/components/ui` | shadcn/ui components |
| `src/db` | Database schema and client |
| `src/i18n` | Language configuration |
| `messages` | Interface text, one file per language |
| `drizzle` | Database migrations |
