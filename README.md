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

Set `DEV_SIGN_IN_EMAIL` in `.env.local` (see `.env.example`) to be signed in as the test user "Dev Coach" without Google. This works only under `npm run dev`; production builds and unit tests ignore it (`src/lib/auth/dev-sign-in.ts`).

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
| `npm run test:e2e` | Run the browser tests headless (see [Browser tests](#browser-tests)) |
| `npm run test:e2e:ui` | Run the browser tests in Playwright's UI mode |
| `npm run test:e2e:clean` | Remove data the browser tests left in the database |

## Browser tests

The main flows have Playwright tests in `e2e/`, one spec file per flow:

| Spec | Covers |
|---|---|
| `season-plan.spec.ts` | Creating a group and a season with a training day, disciplines and focus items; painting the grid by click, drag and keyboard; a break week clearing its column; kept after a reload |
| `session-planning.spec.ts` | Typing parts and activities in the week page's outline editor, durations and clock times; copying another session's content |
| `session-page.spec.ts` | The session page at phone size: ticks and progress, resetting ticks, the note after the session, expanding a linked activity |
| `session-timer.spec.ts` | The part timer at phone size, with Playwright's clock: a countdown with "+1 min" kept across a reload, the alert and "Bocka av"; a timer by the plan, replacing a running timer, stopping, a planned end that has passed |
| `library.spec.ts` | Equipment, a station with equipment and exercises; linking a station and exercises from an activity (creating an exercise by name); deleting an exercise an activity uses |
| `sharing.spec.ts` | The Dela dialog: view and edit access, removing a share, a share waiting for someone who has not signed in |
| `review.spec.ts` | Submitting a station with some of its exercises, withdrawing, rejecting with a comment, approving; what other users see; "Gör global" and "Kopiera till mina" |
| `start-page.spec.ts` | The week view and its navigation; the test-user switcher |

Install the browser once, then run them:

```bash
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e:ui` opens Playwright's UI mode. A run takes one to two minutes.

What they need:

- `.env.local` with `DATABASE_URL` (the `dev` branch) and `DEV_SIGN_IN_EMAIL`. The tests sign in through the development sign-in, choosing Dev Coach, Dev Helper or Dev Newcomer with the `dev_user` cookie, so they only work against `next dev`. The configuration starts `npm run dev` itself, or uses a dev server already running on port 3000.
- Dev Coach must be an administrator in that database (equipment and review flows).
- Chromium only. Most tests run at desktop size; `session-page.spec.ts` and `session-timer.spec.ts` run in a phone-sized project with touch. Tests run one at a time, since they share the test users and the database.

How data is cleaned up: the tests run against the `dev` database next to real example data, so they never read or change data they did not create. Each test names everything it creates `E2E <run id> <test id> …` and removes all of it when it ends, whether it passed or not; the run starts and ends by removing anything named `E2E …` that is left, and `npm run test:e2e:clean` does the same by hand (`e2e/support/clean.mjs`; it refuses any prefix other than `E2E `). One exception: the sharing test deletes the Dev Newcomer user row, which owns nothing, so that a share can wait for a first sign-in; the row comes back the next time Dev Newcomer opens a page.

Set-up that is not the subject of a test (a season with sessions, library items) is written straight to the database by `e2e/support/seed.ts`. The browser tests are not part of the required checks before committing; run them when a change touches a covered flow.

### On pull requests

The workflow `.github/workflows/e2e.yml` runs the browser tests on every pull request (and by hand from the Actions tab). Each run creates its own Neon branch from `dev`, so the test users exist and Dev Coach is already an administrator; applies pending migrations to it; runs the tests against `next dev`; and deletes the branch when it ends, whatever the outcome. A run takes about five minutes. On failure the Playwright report and traces are kept as the artifact `playwright-report` for 14 days. A newer push to the same pull request cancels the run in progress.

It needs the repository variables `NEON_PROJECT_ID` and `NEON_AUTH_BASE_URL` and the secret `NEON_API_KEY` (shared with `cleanup-preview-branch.yml`). The cookie secret is generated for each run, since the development sign-in never uses it.

A test that needs new data in the test users (for example a new administrator) must create it itself or be added to `dev`, since each run starts from a copy of `dev`.

## Neon branches

Besides `main` (production) and `dev`, the Vercel integration creates a branch `preview/<git-branch>` for each pull request's preview deployment, and `cleanup-preview-branch.yml` deletes it when the pull request is merged or closed. The browser test workflow's `ci/e2e-…` branches live only while a run lasts. The plan allows 10 branches; if a preview or test run fails with "Resource provisioning failed", look for left-over branches.

## Databases

The Neon project has two long-lived branches (see "Neon branches" above for the others). Production deployments on Vercel use the default branch. Local development uses the branch `dev`, set as `DATABASE_URL` in `.env.local`.

Run `npm run db:migrate` locally to apply migrations to `dev`. Production is migrated automatically: Vercel runs the `vercel-build` script, which applies pending migrations before building a production deployment.

Preview deployments work the same way on their own database: the Vercel integration gives each one a Neon branch `preview/<git-branch>` copied from production, and `vercel-build` applies the pending migrations to that copy (the script stops the build if a preview's database is ever the production endpoint). Each preview branch has its own Neon Auth, which already trusts the preview's addresses; on a preview the app always derives that address from the preview's `DATABASE_URL` (`src/lib/auth/base-url.ts`; the integration's `DATABASE_NEON_AUTH_BASE_URL` points at production's Neon Auth). `NEON_AUTH_COOKIE_SECRET` must be set for the Preview environment too.

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
