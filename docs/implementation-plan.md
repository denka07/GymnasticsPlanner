# Implementation plan

How GymnasticsPlanner is built: the technology choices and the order of work. The entities are described in the [data model](data-model.md).

## Technology

| Area | Choice |
|---|---|
| Application | Next.js (App Router) with TypeScript |
| Hosting | Vercel, deployed from GitHub |
| Database | Postgres on Neon |
| Database access | Drizzle ORM, with migrations kept in the repo |
| Sign-in | Google sign-in through Neon Auth |
| Interface | Tailwind CSS with shadcn/ui components |
| Interface text | next-intl message catalogue |
| Tests | Vitest for logic, Playwright for the main flows |

## Decisions

### Sign-in

- Google is the only sign-in method in the first version.
- A user record is created the first time someone signs in.
- The first administrator is set directly in the database. Administrators can then be managed from there until an admin page is needed.

### Access control

- Every read and write is checked on the server against ownership and shares, following the rules in the data model.
- The interface hides what a user may not do, but never replaces the server check.

### Language

- The interface is in Swedish only.
- All interface text lives in a message catalogue from the start, so that another language can be added later without rewriting pages.
- Code, database names and documentation are in English.
- Content that users type (names of exercises, stations, focus items) is stored as written and is not translated.

### Devices

- A normal responsive web application. No offline support.
- The season plan grid is designed for desktop.
- The session view is designed for a phone, since it replaces the note used in the gym.

### Environments

- Local development against the Neon branch `dev`.
- A preview deployment for each pull request, with its own database branch.
- Production on Vercel, deployed when a pull request is merged into `main`. Pending migrations are applied to the production database as part of that build.

## Build order

Each step ends with something usable.

### 1. Foundation

- Next.js project, Tailwind, shadcn/ui and the message catalogue.
- Database connection, Drizzle and the first migration.
- Google sign-in and the user record.
- Deployment to Vercel.

Done when a user can sign in on the deployed site and see an empty start page.

### 2. Season plan

- Groups and seasons, with training slots.
- Disciplines and focus items, including sort order and categories.
- The season plan grid: weeks across, focus items down, click or drag to set the focus level.
- Break weeks, week notes and events.
- Creating a season as a copy of an earlier one.

Done when the 2026 HT plan for Trupp 5 can be recreated in the application.

### 3. Sessions

- Sessions generated from the season's training slots.
- Session parts and activities as ordered lists, with free text.
- The week's focus shown beside the sessions while planning.
- The phone view of a single session.
- The note after a session.

Done when a week of sessions can be planned and read on a phone in the gym.

### 4. Library

- Equipment catalogue, editable by administrators.
- Personal stations with needed equipment and supported exercises.
- Personal exercises with focus cues and variants.
- Linking a station and exercises from an activity.

Done when an activity can be built from a station and its exercises.

### 5. Sharing

- Sharing a group, season or session with another user, with view or edit access.
- Help coaches see what is shared with them, including the personal library items those sessions use.

Done when a help coach can open a shared session on their own account.

### 6. Global library and review

- Global exercises and stations, maintained by administrators.
- Copying a global item into a personal one.
- Submitting a personal item for review, and the administrator's approve and reject flow.

Done when a submitted station can be approved and then seen by another user.

## Importing existing plans

Existing plans in Google Sheets are imported rather than typed in again.

- First import: the 2026 HT plan for Trupp 5, used as real data while building steps 2 and 3.
- Before going live: 2026 HT and 2026 VT for further groups. The 2026 VT seasons serve as templates for 2027 VT through the copy-season function.

The import reads an exported sheet and creates the season, its disciplines, focus items, allocations and events. Weekly session text is imported as session parts and free-text activities. The exact format is decided when step 2 is in place.

## Out of scope for the first version

- Drawn station layouts of the hall.
- Gymnasts and attendance.
- Offline use.
- Languages other than Swedish.
- Sign-in methods other than Google.
