# Skincare Routine Tracker
Full-stack web app: React + Vite (client/), Node/Express + SQLite (server/).

## Roadmap (update checkboxes as you finish each step)
- [x] 1. Express API, SQLite schema, product CRUD + tests
- [x] 2. React frontend: product library + add/edit form, proxy /api to :3001
- [x] 3. Routines API + routine builder UI (AM/PM, ordered steps)
- [x] 4. Today's checklist + streak counter (consider soft-deleting steps)
- [x] 5. Skin log (daily note + 1-5 rating)
- [x] 6. Ingredient conflict checker (retinol + vitamin C, retinol + AHA/BHA) with unit tests
- [x] 7. Expiry warnings + progress chart (Chart.js)
- [x] 8. README with setup, screenshots, design decisions

## Rules
- Do one roadmap step per request. Don't start the next step unprompted.
- Run tests before committing. Commit with a descriptive message after each step.
- Keep summaries short: what changed, how to run it, any decisions I should check.
- Record design decisions in a "Decisions" section below.

## Decisions
- Products used in a routine can't be deleted (409) to protect history.
- Ingredients stored as JSON text; normalize later if querying by ingredient.
- Client refetches the product list after each change instead of mirroring the API's sort order in JS.
- Ingredients form splits on newlines and commas, but keeps commas between digits (1,2-hexanediol).
- Category is free text with suggestions, matching the API, rather than a fixed list.
- K-beauty seed data is an explicit `npm run seed`, not run on startup, so deleted products don't return. It lists key ingredients only.
- Routine steps are added, removed and reordered individually, never replaced in bulk, so step ids stay stable for step_completions.
- Steps are not soft-deleted. Each day's result is stored as daily_logs.is_complete instead, so edits can't rewrite past streak days, and no step query needs a removed filter or leaves a product undeletable. Removing a step still deletes its step_completions, so step 7 has per-step history only for steps that still exist.
- A day counts when each time of day that has steps has one fully ticked routine, so routines can alternate (retinol night or acid night).
- An unfinished today doesn't break the streak until the day is over.
- The client sends today's date, because "today" depends on the browser's time zone. Fetching the checklist refreshes that date's stored result, so the UI only ever fetches today.
- Today is the second tab; Routines stays the default page.
- Expiry warnings start 30 days out and show on product cards, routine steps and Today, because that's where a product gets used. The expiry date itself still counts as usable. Status is worked out in the browser, which knows the local date.
- Skin rating and routine completion are two charts, never one with two axes, because their scales are unrelated. They live on the Skin log tab rather than a fifth tab.
- Chart.js is used directly, not through react-chartjs-2, so there's one less dependency. Canvas can't read CSS variables, so charts rebuild when the color scheme changes.
- Conflicts compare different products in the same routine only. Using actives at different times of day is the usual advice, and a single formula with both was made to work together.
- Conflict matching is deliberately narrow (see the comment in conflicts.js) and was tuned against the real catalog. Exfoliating acids and vitamin C in the last third of a full label count as traces. Retinoids never do, since they work at around 0.1%.
- Conflicts are warnings, never blocks. Products with no ingredient list are named as not checked, so silence isn't read as safe.
- The percent counts the furthest routine per time of day, not every routine, so an untouched alternate can't hold a finished day below 100%. It rounds down, so 100% always means the day counted.
- daily_logs also stores steps_done and steps_total, so the calendar keeps past percentages after routines change. Step 7's chart should read these, not step_completions.
- The progress ring and calendar live on the Today tab rather than a fifth tab, so ticks update them in place.
- Skin log entries live on daily_logs with the checklist, so saving always updates in place and clearing means setting both fields to null. Never delete a daily_logs row: it cascades to that day's ticks.
- Past days can be logged or edited from the skin log, but future dates can't be picked.
- Steps reorder with up/down buttons rather than drag and drop: no dependency, and works by keyboard.
- The current tab lives in the URL hash via replaceState, so reloads keep it and Back can't skip the unsaved-changes check.
- Product pictures are uploads, stored in an uploads folder next to the database (gitignored, so back it up with the db). Type is checked from the bytes; JPEG, PNG and WebP only, 5 MB max.
- Pictures aren't scraped from brand or retail sites; products without one show their first letter.
- Upload is a separate raw request after the product saves, so no multipart dependency. If it fails the product stays saved and the form closes, so a retry can't create a duplicate.
- Schema changes to existing tables go in openDatabase, because CREATE TABLE IF NOT EXISTS won't alter them.
- Routines is the first tab and default page.
- Add product can search a local copy of Open Beauty Facts (`npm run import:catalog` in server/, table catalog_products). Never call their API for search: they block scraping and limit it to one call per real scan.
- Search only fills in the form. Nothing saves until Save, because the data is volunteer-written and step 6 will rely on the ingredients.
- A chosen result's picture is copied to uploads on save, from the URL in the catalog only, never one sent by the client.
- Open Beauty Facts data is ODbL and pictures are CC BY-SA: keep the footer credit and per-product source link, and check share-alike before publishing the app or its data. The catalog stays gitignored inside server/data/.
- A routine can use the same product twice (e.g. double cleanse), and a period can have several routines.
