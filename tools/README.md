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
