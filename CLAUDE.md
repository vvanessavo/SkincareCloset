# Skincare Routine Tracker
Full-stack web app: React + Vite (client/), Node/Express + SQLite (server/).

## Roadmap (update checkboxes as you finish each step)
- [x] 1. Express API, SQLite schema, product CRUD + tests
- [x] 2. React frontend: product library + add/edit form, proxy /api to :3001
- [x] 3. Routines API + routine builder UI (AM/PM, ordered steps)
- [ ] 4. Today's checklist + streak counter (consider soft-deleting steps)
- [ ] 5. Skin log (daily note + 1-5 rating)
- [ ] 6. Ingredient conflict checker (retinol + vitamin C, retinol + AHA/BHA) with unit tests
- [ ] 7. Expiry warnings + progress chart (Chart.js)
- [ ] 8. README with setup, screenshots, design decisions

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
- Removing a step or deleting a routine is a hard delete for now and cascades to step_completions. Revisit in step 4 (soft delete).
- Steps reorder with up/down buttons rather than drag and drop: no dependency, and works by keyboard.
- The current tab lives in the URL hash via replaceState, so reloads keep it and Back can't skip the unsaved-changes check.
- Product pictures are uploads, stored in an uploads folder next to the database (gitignored, so back it up with the db). Type is checked from the bytes; JPEG, PNG and WebP only, 5 MB max.
- Pictures aren't scraped from brand or retail sites; products without one show their first letter.
- Upload is a separate raw request after the product saves, so no multipart dependency. If it fails the product stays saved and the form closes, so a retry can't create a duplicate.
- Schema changes to existing tables go in openDatabase, because CREATE TABLE IF NOT EXISTS won't alter them.
- Routines is the first tab and default page.
- A routine can use the same product twice (e.g. double cleanse), and a period can have several routines.
