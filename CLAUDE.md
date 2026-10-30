# Skincare Routine Tracker
Full-stack web app: React + Vite (client/), Node/Express + SQLite (server/).

## Roadmap (update checkboxes as you finish each step)
- [x] 1. Express API, SQLite schema, product CRUD + tests
- [ ] 2. React frontend: product library + add/edit form, proxy /api to :3001
- [ ] 3. Routines API + routine builder UI (AM/PM, ordered steps)
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