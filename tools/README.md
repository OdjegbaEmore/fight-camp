# tools/ — preview build

These build the **standalone preview**: the whole app flattened into one HTML file,
seeded with real data and with Supabase stubbed out, so it can be opened on a phone
without a login. They are not part of the app and nothing in `js/` imports them.

Run from `phone-app/`, in this order:

```bash
python3 tools/flatten.py        # js modules -> /tmp/fc-flat.js
python3 tools/build-preview.py  # -> scratchpad/fight-camp-preview.html
```

Then prepend a `<!DOCTYPE html>` and a `<head>` containing `<meta charset="UTF-8">`.
The file is built as an artifact *body*, so without a charset every `·` renders `Â·`.

## Three traps these already handle

All three produce a preview that looks perfect and misbehaves, and none of them
affects the real app — they are artifacts of flattening modules into one script.

**Module-private name collisions.** `pane` was declared in both `views/train.js` and
`views/fuel.js`. Fine as ES modules, a `SyntaxError` once flattened — and a syntax
error voids *every* top-level declaration in the bundle, so the app renders blank.
`flatten.py` detects collisions across all modules and renames the private copy. It
will catch future ones automatically, and it exits loudly if two modules export the
same name, which it cannot resolve on its own.

**Renaming must skip strings, comments and property accesses.** The first fix used a
blunt `\bpane\b`, which also rewrote `closest('button[data-pane]')` and
`b.dataset.pane`. Every control rendered correctly and did nothing.

**The login screen must be hidden, not removed.** `app.js` wires `loginForm` at top
level; deleting the element throws on null and aborts every `wire*()` call after it.
The result is a fully rendered, completely inert app. The Phase 1 preview never caught
this because the tab bar is plain `href="#/…"` anchors that need no JavaScript.

## Keeping them current

`flatten.py` has a hardcoded `ORDER` list of modules, in dependency order. **Add new
modules to it** or they are silently missing from the bundle — which is how Phase 3's
first preview shipped with no recipes, no templates and no runner.

`build-preview.py` seeds reservations from `/tmp/reservations.json` when it exists —
produce it with `archetype_sync.py --dump-reservations /tmp/reservations.json` (below).

---

# archetype_sync.py — Archetype reservations sync

Not a preview tool: this one writes to the live database. It turns the gym's emails into
`reservations` rows and names Myzone sessions from them. Run by the local scheduled task
`archetype-reservation-sync`, which does the Gmail search and hands the messages over:

```bash
python3 tools/archetype_sync.py --emails emails.json --key-file PATH            # dry run
python3 tools/archetype_sync.py --emails emails.json --key-file PATH --apply    # writes
```

- **Dry run by default.** Prints every name it would write; `--apply` is required to write.
- **`--key-file`** is any local file holding the `service_role` JWT. Point it at the Myzone
  task's `SKILL.md`, which already holds the key — no third copy of the secret. Never
  printed, never in the repo.
- **Refuses to write** until `supabase-phase5.sql` has been run (checks for the table and
  for `workouts.name_auto`).
- **`--since YYYY-MM-DD`** widens the naming window for a backfill (default: 21 days).
- Python 3.9 standard library only — this Mac ships no Node.

The rules (newest email wins; match on overlap; `name_auto` ownership) are documented at
the top of the script and in `ROADMAP.md` Phase 5. Real email content is not committed
anywhere — the repo is public — so fixtures for checking it live outside the repo.

---

# content_publish.py — news, weekly focus, tips and quotes (Phase 4)

Also writes to the live database. Driven by two local scheduled tasks, both modelled on
The Morning Wire: `fight-camp-news` (daily 5:30 AM) and `fight-camp-content` (Sunday
10 PM). Each task runs exactly two fixed wrapper commands, `prepare.sh` then `publish.sh`,
from its folder under `~/.claude/scheduled-tasks/`.

```bash
python3 tools/content_publish.py prepare --task news|weekly --run-dir DIR --key-file PATH
python3 tools/content_publish.py publish --task news|weekly --run-dir DIR --key-file PATH [--apply]
python3 tools/test_content_publish.py    # the rules, offline
```

- **prepare** is read-only. It writes `DIR/<task>-context-YYYY-MM-DD.json`: today's date,
  the exact batch path, what already exists, how many tips/quotes are wanted, and for the
  weekly task a summary of camp, booked classes, training load and weigh-in trend.
- **publish** reads `DIR/<task>-YYYY-MM-DD.json`, prints `ADD`/`SKIP` per item, and writes
  only with `--apply`. It aborts on a missing or wrongly dated batch or context file, and
  refuses to write until `supabase-phase4.sql` has been run.
- The run directory is `~/fight-camp-content/run/` — outside `~/.claude` on purpose.
- `--today YYYY-MM-DD` pretends a date for dry runs only. `tools/examples/` holds batches
  in the right shape with made-up content (the repo is public).

The rules the model can't talk its way past, all enforced in code: news needs a real
URL, a known category, a publish date within 10 days, and no quoted run over 12 words;
a tip stating a measured figure needs a `source_url`; every quote needs an attribution and
a `source_url`; one focus per ISO week, never overwritten, and every number in it must
appear in that week's context data (counts up to 12 excepted).
