# Flatten the ES modules into one classic script for the standalone preview.
#
# Modules each have their own scope; one script does not. Module-private names
# that happen to match across files become a SyntaxError that voids every
# declaration in the bundle — `pane` in train.js and fuel.js did exactly that.
# So: detect collisions, and rename the private ones per module.

import re, pathlib, collections, sys

base = pathlib.Path('.')
ORDER = ['js/config.js','js/util.js','js/state.js','js/calc.js','js/archetype.js','js/content.js','js/tapconfirm.js','js/foodsearch.js',
         'js/seed-fuel.js','js/data.js','js/runner.js','js/views/entry.js',
         'js/views/today.js','js/views/train.js','js/views/planner.js','js/views/fuel.js',
         'js/views/progress.js','js/views/more.js','js/app.js']

DECL = re.compile(r'^(export\s+)?(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)', re.M)

texts = {m: (base/m).read_text() for m in ORDER}
owners, exported = collections.defaultdict(list), collections.defaultdict(set)
for m in ORDER:
    for exp, _kind, name in DECL.findall(texts[m]):
        owners[name].append(m)
        if exp: exported[name].add(m)

renames = collections.defaultdict(dict)
for name, ms in owners.items():
    if len(ms) < 2: continue
    exp = exported.get(name, set())
    if len(exp) > 1:
        sys.exit(f"FATAL: '{name}' is exported by more than one module: {sorted(exp)}")
    # Keep the exported copy (or the first) under its own name; rename the rest.
    keep = sorted(exp)[0] if exp else ms[0]
    for m in ms:
        if m != keep:
            renames[m][name] = f"{name}__{pathlib.Path(m).stem}"

# Rename only real identifier references. A bare \b word match also rewrites
# the name inside string literals and after a dot — which turned
# closest('button[data-pane]') into 'button[data-pane__fuel]' and
# b.dataset.pane into b.dataset.pane__fuel, breaking the control silently.
SKIP = re.compile(
    r"""('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|//[^\n]*|/\*[\s\S]*?\*/)""",
    re.M)

def rename_idents(src, mapping):
    if not mapping: return src
    ident = re.compile(r'(?<![.\w$])(' + '|'.join(re.escape(k) for k in sorted(mapping, key=len, reverse=True)) + r')(?![\w$])')
    out, pos = [], 0
    for mt in SKIP.finditer(src):
        out.append(ident.sub(lambda g: mapping[g.group(1)], src[pos:mt.start()]))
        out.append(mt.group(0))          # strings and comments pass through untouched
        pos = mt.end()
    out.append(ident.sub(lambda g: mapping[g.group(1)], src[pos:]))
    return ''.join(out)

def flatten(m):
    s = rename_idents(texts[m], renames.get(m, {}))
    s = re.sub(r"^import\s+[\s\S]*?from\s+'[^']+';\s*$", '', s, flags=re.M)
    s = re.sub(r"^export\s+(?=(const|let|var|function|async|class))", '', s, flags=re.M)
    s = re.sub(r"^export\s+\{[^}]*\};\s*$", '', s, flags=re.M)
    return s

body = "\n".join(f"/* ===== {m} ===== */\n{flatten(m)}" for m in ORDER)

# Preview substitutions: no Supabase, no auth, no service worker.
body = body.replace("const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);",
                    "const sb = PREVIEW_SB;")
body = re.sub(r"sb\.auth\.onAuthStateChange\([\s\S]*?\}\);", "", body, count=1)
body = re.sub(r"if \('serviceWorker' in navigator\) \{[\s\S]*?\n\}", "", body, count=1)
body = re.sub(r"sb\.auth\.getSession\(\)[\s\S]*?\}\);\s*$", "", body, count=1)

# Dynamic imports cannot resolve inside a flattened bundle.
body = body.replace("""async function activatePlan(id){
  const { sb } = await import('../state.js');""", "async function activatePlan(id){")
body = body.replace("""  const { loadAll } = await import('../data.js');
  await loadAll();
  hooks.render();""", """  state.plans.forEach(p => { p.active = (p.id === id); });
  hooks.render();""")

pathlib.Path('/tmp/fc-flat.js').write_text(body)
print(f"flattened {len(body)} bytes")
print(f"renamed: {dict((pathlib.Path(k).stem, v) for k,v in renames.items()) or 'none'}")
leftover = len(re.findall(r"^\s*(import|export)\s", body, flags=re.M))
print("leftover import/export:", leftover)
print(f"dynamic imports left: {body.count('await import(')}")
