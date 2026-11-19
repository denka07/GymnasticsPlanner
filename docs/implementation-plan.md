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
- Drawn plans are edited on a desktop with a mouse and read on a phone, where they are opened on demand from the session page and can be zoomed with two fingers. They can be printed, one plan per page, or saved as an image.

### Drawn plans

- Drawn in SVG, so plans stay sharp at any zoom, work on phones and can be printed. The scale is metres, as in the data model.
- The editor offers a grid with snapping (0.25, 0.5 or 1 m; 0.5 m at first) and rotation snapping to 15° steps; both can be turned off. Moving with the arrow keys, multi-select, duplicate, delete, layer order, zoom and pan, undo and redo.
- One editor component is used for halls, station layouts and session plans; what can be placed differs.
- A plan is saved as a whole, in one transaction, and checked on the server: every referenced hall, equipment, station and activity must exist and be visible to the user.
- Equipment images and hall feature images are stored in the private Blob store, like attachments, and served through the app to signed-in users.
- Sizes are stored in whole centimetres. A hall's size is typed in metres with decimals (24,5 × 42 m), feature sizes in centimetres. Positions are set by dragging, snapped to 0.5 m at first.
- The editor is desktop-first: on a phone, and for users who may not edit, a drawing is shown read-only.

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

- Halls in the library (a Hallar tab), created and edited by administrators: name, size, floor (colour or image) and fixed features. The list shows each hall drawn small; a hall's page has the editor for administrators and a read-only drawing for others and on phones.
- Hall features: wall bars, door, port, storage, wall, foam pit, MD pit, stands and other, each with its own size, colour and optional image and a default look per kind; and catalogue equipment with a configuration, fixed in the hall. Feature images are uploaded and served like equipment images.
- The shared drawing editor: placing, moving by dragging and with the arrow keys, rotating with 15° snapping, grid snapping, multi-select, duplicate, delete, layer order, zoom, pan, undo and redo, and a properties panel for the selected item. Its geometry and history are pure functions with unit tests.
- A default hall per training slot in the season settings. Changing it asks whether to also change the hall of the slot's stored sessions that have not passed, showing how many.
- A hall per session on the week page, changed with edit access. Placeholders show the slot's hall, and a session gets the slot's hall when it is first stored.

Done when C-salen and AB-hallen are drawn with their wall bars and doors, and Trupp 5's training days use them.

### 9. Station layouts

- A drawing on each station's page, built from the equipment the station needs, with arrows and short texts (item kinds shared with session plans). The editor is for whoever may edit the station, on a desktop; others, and phones, see the drawing read-only.
- The layout saved with the station, as a whole. Items that no longer fit the station's equipment are removed on save, with a note saying so.
- Copying a station copies its layout; a submitted station brings its layout to the review.
- A station with a layout drawn small in lists, in the activity search dialog and in a session's activity details.

Done when the example station "Bakvänd trampett till tjockmatta med kil ovanpå" is drawn with its plint, trampett, tjockmatta and kil.

### 10. Session plans

- On the week page, each session has a "Ritningar" button that opens a page for that session's plans (`/sessions/[sessionId]/plans`). There the user adds the main plan and plans for chosen parts, each starting empty or as a copy of another plan of the session, and edits them with the shared editor. Desktop-first; read-only for view access and on phones (step 11 adds the phone reading view).
- A plan needs a hall: without one, the page asks for the session's hall first (the same setting as on the week page). The hall's floor and fixed features are drawn under the plan and cannot be moved.
- Placing stations (those the plan's parts use first, then the rest of the visible library, with search), equipment from the catalogue, text, areas, people (Coach, Passare) and arrows.
- Linking a placed station to the activity it is used for: automatic when exactly one activity in the plan's parts links to the station, otherwise picked. Numbers are never typed; they follow the activities' order in the session, counting only activities linked to a placed station in the plan, and are shown on the station and next to the activity in the plan's text.
- Adapting a placed station into a copy for that plan ("Anpassa").
- A part plan whose parts are deleted is kept, marked "inga passdelar", and can be attached to other parts or deleted.
- Plans copied along with a session's content, part plans applying to the parts at the same positions.
- Equipment and configurations drawn in a plan cannot be deleted from the catalogue; a station deleted while placed leaves adapted copies.

Done when a week 36 session for Trupp 5 has a main plan and a separate plan for its Trampett part, with numbered stations linked to activities.

### 11. Reading and printing plans

- **On the phone's session page, plans are opened on demand, never shown automatically:** the stations are built before they are used, so the drawing is only needed when the coach chooses to look. Each part that has a plan (its own, or the main plan) has a small "Ritning" button that opens that plan, and one "Ritningar" button near the top opens the session's plans. Without plans nothing is shown, and the rest of the page (parts, ticks, timer, note) is unchanged.
- The plan opens in a full-screen view with the plan's name and its parts, and arrows to the session's other plans (the main plan first, then part plans in part order). The drawing can be zoomed with two fingers and dragged, and has zoom buttons and fit-to-view. It is turned to follow the screen, as in the editor, so a portrait hall is upright on a phone held upright; labels and numbers stay upright. Tapping a numbered station closes the view, scrolls to its activity and unfolds it.
- **A print view** (`/sessions/[sessionId]/plans/print`), opened from the plans page and choosing one plan or all of them, both there and on the print view itself. Each plan gets its own page: the drawing as large as fits the page, then the plan's parts with their numbered activities' text, numbers matching the drawing. The main plan comes first, then part plans in part order. A page whose drawing is wider than tall is printed in landscape (CSS named pages with `@page { size }`, per page where the browser supports it). "Skriv ut" opens the browser's print dialog, which also saves as PDF; the app's header and controls are hidden in print. Anyone with view access can print.
- **"Spara som bild"** on the plans page and in the phone's plan view downloads the plan as a PNG, for sending in a chat. The SVG is drawn on a canvas in the browser; the hall, feature and equipment images it shows are fetched from the app and inlined first, so none go missing. The file is named after the session's date and the plan's name.

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
