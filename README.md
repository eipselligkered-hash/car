# Car – Tesla Model 3 checklist

A small phone-first web app for Derek's white 2023 Tesla Model 3 (231-D-43971). Plain HTML/CSS/JS, no build step.
Same setup as the Chores / Care apps: **Supabase** (same project, same email sign-in) + **GitHub Pages** (free).

Live: <https://eipselligkered-hash.github.io/car/> · Repo: <https://github.com/eipselligkered-hash/car>

## Tabs
* **Kit** – the car kit list (Glovebox / Centre console, Cabin / Door pockets, Boot, Frunk, Seasonal / Occasional), seeded from
  `car-kit-list.txt` in UK spelling. Each item has two ticks: **Have it** and **In the car** (ticking *In car* also ticks *Have it*).
  CRITICAL items have a red badge with the reason. Filters: *All*, *To buy* (not owned yet), *Not in car* (owned, not packed), *Critical*.
  Tap an item's name to edit, move, mark critical or delete it (Undo on delete); **+ Add item** at the bottom.
* **Kit check** – for collecting the car (e.g. from the bodyshop). Goes through everything ticked *In the car*, one at a time
  (✓ It's there / ✗ Missing, ← Back) or as a list. Progress is saved, so you can stop and carry on. At the end: a summary of what's
  missing → **Finish and save** stores the date. Afterwards you can untick *In the car* for the missing items. **Reset check** starts again.
* **Dates** – upcoming dates sorted by date with "in N days", reminder dates (⏰; a yellow banner shows once a reminder date arrives),
  and **Recommended by Tesla app** (wiper blades ~€85, tyre rotation ~€74). Tap the circle to mark done (dated today, Undo);
  tap the title to edit any field (date, wording like "January 2027", reminder, cost, note, done date) or delete. **+ Add date**.
* **Wash** – Roof → Windows → Bonnet → Sides → Boot → Wheels. Tap to tick; **Reset** for next time; *Last full wash* date is kept. Steps are editable.
* ⚙ – backup download (JSON), sign out, how to add to the home screen.

Dates are dd/mm/yyyy. Works offline for viewing (last data cached on the phone); changes need a connection.

## Data (Supabase project `rwbiizjwvyssdyxjuqan`, same as Chores)
| Table | What |
|---|---|
| `car_items` | kit items: section, name, note, critical, have, packed |
| `car_dates` | upcoming dates (`kind = 'date'`) and Tesla app recommendations (`kind = 'recommended'`), due/remind/done dates |
| `car_checks` | kit checks (`kind = 'kit'`, `results` per item, `missing`, `completed_on`) and finished washes (`kind = 'wash'`) |
| `car_wash` | wash steps + ticks |

Row-level security: only the signed-in owner can read/write their rows (`owner_id = auth.uid()`), `anon` has no access –
same policies as the other apps. The page only contains the anon key; the service key is never in the app.
The starting data (`src/seed.js`, made by `scripts/make_seed.py`) is added automatically the first time you sign in (fixed ids, so it can't double up).

### One-time setup (needed once)
The tables are created by pasting `supabase/setup.sql` into **Supabase → SQL Editor → New query → Run** (safe to run again;
only creates `car_*` tables). The app shows a *One-time setup* screen with a **Copy setup SQL** button until this is done.

## Files
| Path | What |
|---|---|
| `index.html`, `styles.css`, `src/app.js` | the app |
| `src/logic.js` | pure helpers (dates, counts, filters, kit check progress) |
| `src/data.js` | `SupabaseBackend` (vendored supabase-js, email code/link sign-in) and `MockBackend` (localStorage, `?backend=mock`) |
| `src/seed.js`, `scripts/make_seed.py` | starting kit list, dates, wash steps |
| `config.js` | Supabase URL + anon key, car name/reg |
| `supabase/setup.sql` | tables + RLS |
| `manifest.webmanifest`, `sw.js`, `icons/` | add to home screen / offline |
| `tests/` | `node --test tests/` (logic + seed spelling), `tests/smoke_ui.py` (phone UI run-through on the mock) |

## Run / test / deploy
```bash
python3 -m http.server 8767        # http://localhost:8767/?backend=mock  (?today=2026-12-02 simulates a date)
node --test tests/
/workspace/.venv-pw/bin/python tests/smoke_ui.py http://localhost:8767/
git add -A && git commit -m "..." && git push   # GitHub Pages redeploys in ~1 minute; bump VERSION in sw.js and ?v= in index.html for big changes
```
