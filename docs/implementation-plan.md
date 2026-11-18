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
| File storage | Vercel Blob, private store, files served through the app after an access check |
| Drawn plans | SVG drawn by the application's own React components, no drawing library |

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
- Drawn plans are edited on a desktop with a mouse and read on a phone, where they can be zoomed with two fingers.

### Drawn plans

- Drawn in SVG, so plans stay sharp at any zoom, work on phones and can be printed. The scale is metres, as in the data model.
- The editor offers a grid with snapping (0.25, 0.5 or 1 m; 0.5 m at first) and rotation snapping to 15° steps; both can be turned off. Moving with the arrow keys, multi-select, duplicate, delete, layer order, zoom and pan, undo and redo.
- One editor component is used for halls, station layouts and session plans; what can be placed differs.
- A plan is saved as a whole, in one transaction, and checked on the server: every referenced hall, equipment, station and activity must exist and be visible to the user.
- Equipment images are stored in the private Blob store, like attachments, and served through the app.

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
- Personal exercises (name, description, discipline name).
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

### 7. Equipment for drawing

- Configurations on equipment, each with a name, width, length, colour and image, set by administrators on the Redskap tab; one is the default.
- Image upload to the private Blob store, with the same checks as attachments.
- Each configuration drawn as a preview in the list: image stretched to its size, or a coloured rectangle.

Done when an administrator can give Tunnmatta the configurations Liggande and Stående på långsidan, each with its size and image, and see both drawn to scale.

### 8. Halls and the drawing editor

- Halls in the library (a Hallar tab), created and edited by administrators: name, size and fixed features.
- The shared drawing editor: placing, moving, rotating, snapping, zoom, pan, undo.
- A default hall per training slot in the season settings, and a hall per session on the week page.

Done when C-salen and AB-hallen are drawn with their wall bars and doors, and Trupp 5's training days use them.

### 9. Station layouts

- A drawing on each station's page, built from the equipment the station needs.
- The station drawn small in lists and in the activity search dialog.

Done when the example station "Bakvänd trampett till tjockmatta med kil ovanpå" is drawn with its plint, trampett, tjockmatta and kil.

### 10. Session plans

- On the week page: a main plan per session and plans for chosen parts, each starting empty or as a copy of another plan of the session.
- Placing stations (the session's own first), equipment, text, areas, people and arrows in the session's hall.
- Linking a placed station to the activity it is used for, shown as a number.
- Adapting a placed station into a copy for that plan.
- Plans copied along with a session's content.

Done when a week 36 session for Trupp 5 has a main plan and a separate plan for its Trampett part, with numbered stations linked to activities.

### 11. Reading and printing plans

- On the phone's session page, the plan for the current part (or the part the timer runs for), zoomable, with each numbered station leading to its activity.
- A print view: the plan on one page, followed by the parts and the numbered activities' text, to save as PDF or print. Saving the drawing as an image.

Done when a help coach can follow the plan on a phone in the hall and the coach can print it.

## Importing existing plans

Existing plans in Google Sheets are imported rather than typed in again.

- First import: the 2026 HT plan for Trupp 5, used as real data while building steps 2 and 3.
- Before going live: 2026 HT and 2026 VT for further groups. The 2026 VT seasons serve as templates for 2027 VT through the copy-season function.

The import reads an exported sheet and creates the season, its disciplines, focus items, allocations and events. Weekly session text is imported as session parts and free-text activities. The exact format is decided when step 2 is in place.

## Out of scope for the first version

- Gymnasts and attendance.
- Offline use.
- Languages other than Swedish.
- Sign-in methods other than Google.
