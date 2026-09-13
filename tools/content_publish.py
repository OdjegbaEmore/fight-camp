#!/usr/bin/env python3
"""Fight Camp content -> Supabase: the daily news feed, and the weekly focus, tips and quotes.

Driven by two local scheduled tasks, `fight-camp-news` (daily) and
`fight-camp-content` (Sunday night). Each runs exactly two fixed commands:

    content_publish.py prepare --task news|weekly --run-dir DIR --key-file PATH
    content_publish.py publish --task news|weekly --run-dir DIR --key-file PATH [--apply]

prepare  Read-only. Writes DIR/<task>-context-YYYY-MM-DD.json: today's date, the
         path the batch must be written to, what already exists (so a run does not
         repeat itself), how many tips/quotes are wanted, and — for the weekly task —
         a summary of the user's own camp, class and training data.
publish  Reads DIR/<task>-YYYY-MM-DD.json (the batch the run wrote), validates every
         item, drops duplicates and anything that breaks the rules below, and writes
         the rest. Without --apply it prints the plan and writes nothing.

The model never writes to Supabase itself. The rules are code:

  * Date-stamped batch files and a freshness gate. A missing file for today, or a
    batch/context carrying another date, aborts — a stale file must never publish.
  * News: every story has a real http(s) URL, a published date within 10 days, a
    known category, and a summary in the routine's own words (a quoted run of more
    than 12 words is refused as copied text). Upsert ignores URLs already stored.
  * Tips: a stated measurement (g, kg, %, kcal, ...) needs a source_url. Every category
    keeps at least 5 active tips: the quota fills any category below that first, and
    nothing here ever retires a tip.
  * Quotes: every quote needs an attribution and a source_url it was checked against.
  * Weekly focus: carries a tip category (Today's daily tip is drawn from it); one per
    ISO week, this week (Mon-Sat) or next week (Fri-Sun),
    never overwriting one already set. Every number in it must appear in the user's
    data from the context file (small counts up to 12 excepted) — no invented figures.

--key-file is any LOCAL file holding the service_role JWT (the Myzone task's SKILL.md
already does). The key is never printed. Python 3.9 standard library only.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from archetype_sync import ApiError, Supabase, display_class, q, read_service_key  # noqa: E402

NEWS_CATEGORIES = {
    'pro': 'Pro boxing: fight results, upcoming cards, rankings, notable news',
    'amateur': 'Amateur and Olympic boxing: USA Boxing, national tournaments, the Olympic programme',
    'science': 'Training and nutrition science: conditioning, weight cuts, recovery research',
    'austin': 'Austin boxing: local events, gyms, fight nights',
}
TIP_CATEGORIES = ['Footwork', 'Defence', 'Offence', 'Conditioning', 'Recovery', 'Fuel & Weight']

NEWS_MAX_AGE_DAYS = 10      # a story published longer ago than this is not news
NEWS_RETIRE_DAYS = 30       # hidden (active = false) after this, never deleted
NEWS_MAX_PER_RUN = 12
KNOWN_URL_DAYS = 60         # dedupe window handed to the run and checked at publish

TIPS_TARGET = 42            # the library the design calls for, built up over weeks
TIPS_MIN_PER_CATEGORY = 5   # the floor every category must hold, at all times
QUOTES_SEED = 40
QUOTES_WEEKLY = 3
QUOTES_CAP = 150

QUOTE_RUN_WORDS = 12        # a quoted run longer than this reads as copied source text
SMALL_COUNT = 12            # numbers up to this are coaching counts (rounds, reps), not data


# ---------------------------------------------------------------------------
# Text rules
# ---------------------------------------------------------------------------
def clean(v):
    return re.sub(r'\s+', ' ', str(v or '')).strip()


def norm_text(s):
    s = unicodedata.normalize('NFKD', s or '').lower()
    s = re.sub(r"[’'`]", '', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


TRACKING = re.compile(r'^(utm_.*|fbclid|gclid|mc_cid|mc_eid)$', re.I)


def norm_url(u):
    """Strip the fragment and tracking parameters. None if it is not an http(s) URL."""
    p = urllib.parse.urlsplit(clean(u))
    if p.scheme.lower() not in ('http', 'https') or '.' not in p.netloc:
        return None
    query = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
             if not TRACKING.match(k)]
    return urllib.parse.urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path,
                                    urllib.parse.urlencode(query), ''))


def url_key(u):
    """Dedupe key: scheme- and trailing-slash-insensitive, so two spellings of one page match."""
    p = urllib.parse.urlsplit(u)
    host = p.netloc.lower()
    host = host[4:] if host.startswith('www.') else host
    return host + p.path.rstrip('/') + ('?' + p.query if p.query else '')


QUOTED = re.compile(r'[“"]([^”"]+)[”"]')


def long_quote(text):
    return any(len(m.group(1).split()) > QUOTE_RUN_WORDS for m in QUOTED.finditer(text or ''))


MEASURE = re.compile(
    r'\d[\d,.]*\s*(?:%|percent\b|g\b|grams?\b|kg\b|mg\b|lbs?\b|pounds?\b|kcal\b|calories\b'
    r'|ml\b|litres?\b|liters?\b|oz\b|ounces?\b|bpm\b)', re.I)
NUMBER = re.compile(r'\d[\d,]*(?:\.\d+)?')
ISO_DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def numbers_in(text):
    out = []
    for m in NUMBER.finditer(text or ''):
        try:
            out.append(float(m.group(0).rstrip(',').replace(',', '')))
        except ValueError:
            pass
    return out


def collect_numbers(obj, pool=None):
    """Every number in a context structure, including those inside strings (dates, times)."""
    pool = set() if pool is None else pool
    if isinstance(obj, bool) or obj is None:
        pass
    elif isinstance(obj, (int, float)):
        pool.add(round(abs(float(obj)), 1))
    elif isinstance(obj, str):
        # ISO dates are skipped: their day-of-month parts would let any number up to 31 through.
        if not ISO_DATE.match(obj):
            pool.update(round(n, 1) for n in numbers_in(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_numbers(v, pool)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            collect_numbers(v, pool)
    return pool


def number_ok(n, pool):
    return (n == int(n) and n <= SMALL_COUNT) or round(n, 1) in pool


def parse_date(v):
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# Weeks and quotas
# ---------------------------------------------------------------------------
def monday_of(d):
    return d - dt.timedelta(days=d.weekday())


def iso_week(d):
    y, w, _ = d.isocalendar()
    return (y, w)


def open_mondays(today):
    """Weeks a focus may be written for.

    Mon-Thu: this week. Fri-Sat: this week and next. Sunday: next week only — this
    week is over, and the Sunday-night task writes ahead. A run that slips to Monday
    still lands on the (new) current week.
    """
    m = monday_of(today)
    nxt = m + dt.timedelta(days=7)
    if today.weekday() == 6:
        return [nxt]
    return [m, nxt] if today.weekday() >= 4 else [m]


def tip_counts(tips):
    """Active tips per category."""
    return {c: sum(1 for t in tips if t.get('category') == c and t.get('active', True))
            for c in TIP_CATEGORIES}


def tip_needs(by_cat):
    """How many each category is short of the minimum."""
    return {c: max(0, TIPS_MIN_PER_CATEGORY - by_cat.get(c, 0)) for c in TIP_CATEGORIES}


def tip_quota(by_cat):
    """Tips wanted this run: at least enough to fill every short category, plus steady growth
    toward the target library."""
    total = sum(by_cat.values())
    growth = 0 if total >= TIPS_TARGET else min(12 if total < 12 else 6, TIPS_TARGET - total)
    return max(sum(tip_needs(by_cat).values()), growth)


def allocate_tips(rows, by_cat):
    """Spend the run's quota: tips for categories below the minimum first, then the rest in
    batch order. Returns (accepted, [(row, reason), ...])."""
    quota = tip_quota(by_cat)
    needs, room = tip_needs(by_cat), quota
    accepted, rest = [], []
    for r in rows:
        if room and needs[r['category']] > 0:
            needs[r['category']] -= 1
            room -= 1
            accepted.append(r)
        else:
            rest.append(r)
    refused = []
    for r in rest:
        if room:
            room -= 1
            accepted.append(r)
        else:
            refused.append((r, "over this run's tip quota (%d)" % quota))
    return accepted, refused


def quote_quota(n):
    if n >= QUOTES_CAP:
        return 0
    if n < QUOTES_SEED // 2:
        return QUOTES_SEED - n
    return min(QUOTES_WEEKLY, QUOTES_CAP - n)


# ---------------------------------------------------------------------------
# Item checks — each returns (row, None) or (None, reason)
# ---------------------------------------------------------------------------
def check_news(item, today, known_keys):
    if not isinstance(item, dict):
        return None, 'not an object'
    url = norm_url(item.get('url'))
    title, source = clean(item.get('title')), clean(item.get('source'))
    summary, why = clean(item.get('summary')), clean(item.get('why'))
    category = clean(item.get('category')).lower()
    published = parse_date(item.get('published_at'))
    if not url:
        return None, 'no usable http(s) url'
    if category not in NEWS_CATEGORIES:
        return None, 'unknown category %r' % category
    if not 3 <= len(title) <= 160:
        return None, 'title must be 3-160 characters'
    if not 2 <= len(source) <= 60:
        return None, 'source must be 2-60 characters'
    if not 60 <= len(summary) <= 600:
        return None, 'summary must be 60-600 characters'
    if len(why) > 200:
        return None, 'why must be at most 200 characters'
    if long_quote(summary) or long_quote(why):
        return None, 'quotes more than %d words of the source' % QUOTE_RUN_WORDS
    if published is None:
        return None, 'no published_at date'
    if published > today + dt.timedelta(days=1):
        return None, 'published_at is in the future'
    if (today - published).days > NEWS_MAX_AGE_DAYS:
        return None, 'published more than %d days ago' % NEWS_MAX_AGE_DAYS
    if url_key(url) in known_keys:
        return None, 'already in the feed'
    return {'url': url, 'title': title, 'source': source, 'category': category,
            'summary': summary, 'why': why or None, 'published_at': published.isoformat()}, None


def content_row(**kw):
    # PostgREST bulk inserts need every object to carry the same keys.
    row = dict.fromkeys(('kind', 'category', 'title', 'body', 'attribution',
                         'year', 'week', 'source_url'))
    row.update(kw, active=True)
    return row


def check_tip(item, seen_titles):
    if not isinstance(item, dict):
        return None, 'not an object'
    wanted = clean(item.get('category')).lower()
    category = next((c for c in TIP_CATEGORIES if c.lower() == wanted), None)
    title, body = clean(item.get('title')), clean(item.get('body'))
    src = None
    if not category:
        return None, 'unknown category %r' % item.get('category')
    if not 3 <= len(title) <= 70:
        return None, 'title must be 3-70 characters'
    if not 40 <= len(body) <= 360:
        return None, 'body must be 40-360 characters'
    if clean(item.get('source_url')):
        src = norm_url(item.get('source_url'))
        if not src:
            return None, 'source_url is not an http(s) url'
    if MEASURE.search(body) and not src:
        return None, 'states a measured figure without a source_url'
    if long_quote(body):
        return None, 'quotes more than %d words of a source' % QUOTE_RUN_WORDS
    if norm_text(title) in seen_titles:
        return None, 'a tip with this title exists'
    return content_row(kind='tip', category=category, title=title, body=body, source_url=src), None


def check_quote(item, seen_bodies):
    if not isinstance(item, dict):
        return None, 'not an object'
    body = clean(item.get('body')).strip('“”"‘’\' ')
    who = clean(item.get('attribution'))
    src = norm_url(item.get('source_url')) if clean(item.get('source_url')) else None
    if not 10 <= len(body) <= 280:
        return None, 'quote must be 10-280 characters'
    if not 2 <= len(who) <= 60:
        return None, 'attribution must be 2-60 characters'
    if not src:
        return None, 'no source_url the attribution was checked against'
    if norm_text(body) in seen_bodies:
        return None, 'this quote exists'
    return content_row(kind='quote', body=body, attribution=who, source_url=src), None


def check_focus(item, open_weeks, pool):
    if not isinstance(item, dict):
        return None, 'not an object'
    try:
        week = (int(item.get('year')), int(item.get('week')))
    except (TypeError, ValueError):
        return None, 'year and week must be integers'
    title, body = clean(item.get('title')), clean(item.get('body'))
    wanted = clean(item.get('category')).lower()
    category = next((c for c in TIP_CATEGORIES if c.lower() == wanted), None)
    if week not in open_weeks:
        return None, 'week %d-W%02d is not open (already set, or not this/next week)' % week
    if not category:
        return None, 'category must be one of the tip categories (Today draws its daily tip from it)'
    if not 3 <= len(title) <= 48:
        return None, 'title must be 3-48 characters'
    if not 40 <= len(body) <= 300:
        return None, 'body must be 40-300 characters'
    bad = sorted({n for n in numbers_in(title + ' ' + body) if not number_ok(n, pool)})
    if bad:
        return None, 'numbers not found in your data: %s' % ', '.join('%g' % n for n in bad)
    return content_row(kind='focus', category=category, year=week[0], week=week[1],
                       title=title, body=body), None


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------
def migration_ready(sb):
    try:
        sb.call('GET', 'news?select=id&limit=1')
        sb.call('GET', 'content?select=source_url&limit=1')
        return True
    except ApiError:
        return False


def get_or_empty(sb, path):
    try:
        return sb.call('GET', path) or []
    except ApiError:
        return []


def existing_content(sb):
    # Inactive rows count too, so a retired tip or quote is not written again.
    return sb.call('GET', 'content?select=kind,category,title,body,attribution,year,week,active'
                          '&kind=in.(tip,quote,focus)&limit=5000') or []


def known_news_keys(sb, today):
    since = (today - dt.timedelta(days=KNOWN_URL_DAYS)).isoformat()
    rows = sb.call('GET', 'news?select=url,title,published_at&fetched_at=gte.%s'
                          '&order=published_at.desc' % since) or []
    return rows, {url_key(r['url']) for r in rows}


def camp_for_week(camps, monday):
    sunday = monday + dt.timedelta(days=6)
    for c in camps:
        start, end = parse_date(c.get('start_date')), parse_date(c.get('end_date'))
        if c.get('archived') or not (start and end) or start > sunday or end < monday:
            continue
        return {'name': c.get('name'), 'start_date': start.isoformat(), 'end_date': end.isoformat(),
                'target_weight_lb': c.get('target_weight'),
                'week_of_camp': max(1, (monday - start).days // 7 + 1),
                'weeks_in_camp': (end - start).days // 7 + 1,
                'starts_this_week': start >= monday, 'ends_this_week': end <= sunday}
    return None


def personal_summary(sb, today, mondays):
    this_monday = monday_of(today)
    first = this_monday - dt.timedelta(days=28)

    workouts = get_or_empty(sb, 'workouts?select=date,minutes,avg_effort,calories'
                                '&date=gte.%s&order=date' % first)
    training = []
    for i in range(4, -1, -1):
        m = this_monday - dt.timedelta(days=7 * i)
        lo, hi = m.isoformat(), (m + dt.timedelta(days=6)).isoformat()
        ws = [w for w in workouts if lo <= str(w.get('date')) <= hi]
        efforts = [num(w['avg_effort']) for w in ws if w.get('avg_effort') is not None]
        training.append({'week_of': lo, 'in_progress': i == 0, 'sessions': len(ws),
                         'minutes': int(round(sum(num(w.get('minutes')) for w in ws))),
                         'calories': int(round(sum(num(w.get('calories')) for w in ws))),
                         'avg_effort_pct': int(round(sum(efforts) / len(efforts))) if efforts else None})

    camps = get_or_empty(sb, 'camps?select=name,start_date,end_date,target_weight,archived')
    booked = []
    if mondays:
        booked = get_or_empty(sb, 'reservations?select=date,start_time,class_name,no_show'
                                  '&status=eq.booked&date=gte.%s&date=lte.%s&order=date,start_time'
                                  % (mondays[0], mondays[-1] + dt.timedelta(days=6)))
    weeks = []
    for m in mondays:
        lo, hi = m.isoformat(), (m + dt.timedelta(days=6)).isoformat()
        mine = [r for r in booked if lo <= str(r.get('date')) <= hi]
        y, w = iso_week(m)
        weeks.append({'year': y, 'week': w, 'monday': lo, 'sunday': hi,
                      'camp': camp_for_week(camps, m),
                      'classes_booked': {
                          'count': len(mine),
                          'classes': ['%s %s %s' % (parse_date(r['date']).strftime('%a'),
                                                    str(r.get('start_time'))[:5],
                                                    display_class(r.get('class_name') or ''))
                                      for r in mine]}})

    entries = get_or_empty(sb, 'entries?select=date,weight&weight=not.is.null&date=gte.%s&order=date'
                               % (today - dt.timedelta(days=42)))
    pts = [(parse_date(e['date']), num(e['weight'])) for e in entries if num(e.get('weight')) > 0]
    weight = None
    if pts:
        last_d, last_w = pts[-1]
        weight = {'latest': {'date': last_d.isoformat(), 'lb': round(last_w, 1)},
                  'days_since_latest': (today - last_d).days,
                  'weigh_ins_last_28_days': sum(1 for d, _ in pts if (today - d).days <= 28)}
        for label, days in (('change_7d', 7), ('change_28d', 28)):
            prior = [p for p in pts if p[0] <= last_d - dt.timedelta(days=days)]
            weight[label] = ({'since': prior[-1][0].isoformat(), 'lb': round(last_w - prior[-1][1], 1)}
                             if prior else None)

    return {'weeks': weeks, 'training': training, 'weight': weight}


# ---------------------------------------------------------------------------
# prepare
# ---------------------------------------------------------------------------
def paths(run_dir, task, today):
    d = today.isoformat()
    return (os.path.join(run_dir, '%s-context-%s.json' % (task, d)),
            os.path.join(run_dir, '%s-%s.json' % (task, d)))


def prepare(sb, task, run_dir, today):
    ctx_path, batch_path = paths(run_dir, task, today)
    ready = migration_ready(sb)
    ctx = {'task': task, 'date': today.isoformat(), 'batch_path': batch_path, 'migration_ready': ready}

    if task == 'news':
        rows, _ = known_news_keys(sb, today) if ready else ([], set())
        ctx.update({
            'categories': NEWS_CATEGORIES,
            'max_stories': NEWS_MAX_PER_RUN,
            'oldest_published_at': (today - dt.timedelta(days=NEWS_MAX_AGE_DAYS)).isoformat(),
            'known_urls': [r['url'] for r in rows],
            'recent_titles': [r['title'] for r in rows[:40]],
        })
    else:
        content = existing_content(sb)
        tips = [c for c in content if c['kind'] == 'tip']
        quotes = [c for c in content if c['kind'] == 'quote']
        have = {(c['year'], c['week']) for c in content if c['kind'] == 'focus'}
        mondays = [m for m in open_mondays(today) if iso_week(m) not in have]
        mine = personal_summary(sb, today, mondays)
        by_cat = tip_counts(tips)
        ctx.update({
            'focus_needed': mine['weeks'],
            'training': mine['training'],
            'weight': mine['weight'],
            'tips': {'count': sum(by_cat.values()), 'target': TIPS_TARGET,
                     'min_per_category': TIPS_MIN_PER_CATEGORY, 'to_write': tip_quota(by_cat),
                     'needed_by_category': {c: n for c, n in tip_needs(by_cat).items() if n},
                     'by_category': by_cat,
                     'categories_most_needed': sorted(TIP_CATEGORIES, key=lambda c: (by_cat[c], TIP_CATEGORIES.index(c))),
                     'existing_titles': sorted(t['title'] for t in tips if t.get('title'))},
            'quotes': {'count': len(quotes), 'to_write': quote_quota(len(quotes)),
                       'existing': [{'body': x['body'], 'attribution': x.get('attribution')} for x in quotes]},
        })

    os.makedirs(run_dir, exist_ok=True)
    with open(ctx_path, 'w') as f:
        json.dump(ctx, f, indent=1, ensure_ascii=False)
    if not ready:
        print('NOTE supabase-phase4.sql has not been run — publish will refuse to write.')
    print('CONTEXT %s' % ctx_path)
    print('BATCH %s' % batch_path)


# ---------------------------------------------------------------------------
# publish
# ---------------------------------------------------------------------------
def abort(msg):
    sys.exit('ABORT: ' + msg)


def load_json(path, what):
    if not os.path.isfile(path):
        abort('no %s for today (%s)' % (what, os.path.basename(path)))
    try:
        with open(path) as f:
            return json.load(f)
    except ValueError as e:
        abort('%s is not valid JSON — %s' % (os.path.basename(path), e))


def report(kind, label, reason=None):
    label = clean(label)[:80] or '(untitled)'
    print(('SKIP %s "%s" — %s' % (kind, label, reason)) if reason else ('ADD %s %s' % (kind, label)))


def publish(sb, task, run_dir, today, apply):
    ctx_path, batch_path = paths(run_dir, task, today)
    ctx = load_json(ctx_path, 'context file — prepare did not run')
    batch = load_json(batch_path, 'batch file — nothing was built this run')
    if not isinstance(batch, dict):
        abort('batch must be a JSON object')
    for name, doc in (('context', ctx), ('batch', batch)):
        if doc.get('date') != today.isoformat():
            abort('%s says %s, today is %s' % (name, doc.get('date'), today.isoformat()))

    ready = migration_ready(sb)
    if apply and not ready:
        sys.exit('REFUSING TO WRITE — supabase-phase4.sql has not been run (news table or content.source_url missing)')

    mode = 'APPLY' if apply else 'DRY RUN'
    print('%s · %s · %s' % (mode, task, os.path.basename(batch_path)))
    summary = {'mode': mode.lower(), 'task': task, 'skipped': 0, 'written': 0}

    if task == 'news':
        stories = batch.get('stories')
        if not isinstance(stories, list):
            abort('batch has no "stories" list')
        _, known = known_news_keys(sb, today) if ready else ([], set())
        rows = []
        for item in stories:
            label = item.get('title') if isinstance(item, dict) else ''
            row, why = check_news(item, today, known)
            if not why and len(rows) >= NEWS_MAX_PER_RUN:
                why = 'over the %d-story cap' % NEWS_MAX_PER_RUN
            report('news', label if why else '[%s] %s — %s' % (row['category'], row['title'], row['source']), why)
            if why:
                summary['skipped'] += 1
                continue
            known.add(url_key(row['url']))
            rows.append(row)
        summary.update(stories=len(rows), retired=0)
        if apply:
            try:
                if rows:
                    summary['written'] = len(sb.call('POST', 'news?on_conflict=url&select=id', rows,
                                                     prefer='resolution=ignore-duplicates,return=representation') or [])
                cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=NEWS_RETIRE_DAYS)).isoformat()
                summary['retired'] = len(sb.call('PATCH', 'news?active=eq.true&fetched_at=lt.%s&select=id' % q(cutoff),
                                                 {'active': False}, prefer='return=representation') or [])
            except ApiError as e:
                sys.exit('WRITE FAILED — %s' % e)
    else:
        content = existing_content(sb)
        tips = [c for c in content if c['kind'] == 'tip']
        quotes = [c for c in content if c['kind'] == 'quote']
        have = {(c['year'], c['week']) for c in content if c['kind'] == 'focus'}
        open_weeks = {iso_week(m) for m in open_mondays(today)} - have
        pool = collect_numbers([ctx.get('focus_needed'), ctx.get('training'), ctx.get('weight')])
        seen_titles = {norm_text(t.get('title')) for t in tips}
        seen_quotes = {norm_text(x.get('body')) for x in quotes}
        by_cat = tip_counts(tips)
        quote_room = quote_quota(len(quotes))
        rows, counts, valid_tips = [], {'focus': 0, 'tips': 0, 'quotes': 0}, []

        for kind, items, check in (
                ('focus', batch.get('focus'), lambda i: check_focus(i, open_weeks, pool)),
                ('tips', batch.get('tips'), lambda i: check_tip(i, seen_titles)),
                ('quotes', batch.get('quotes'), lambda i: check_quote(i, seen_quotes))):
            if items is None:
                continue
            if not isinstance(items, list):
                abort('"%s" must be a list' % kind)
            for item in items:
                label = (item.get('title') or item.get('body')) if isinstance(item, dict) else ''
                row, why = check(item)
                if not why and kind == 'quotes' and counts['quotes'] >= quote_room:
                    why = 'only %d quotes wanted this run' % quote_room
                if why:
                    report(kind[:-1] if kind != 'focus' else 'focus', label, why)
                    summary['skipped'] += 1
                    continue
                if kind == 'tips':
                    # Held back: tips are allocated below, short categories first.
                    seen_titles.add(norm_text(row['title']))
                    valid_tips.append(row)
                    continue
                report(kind[:-1] if kind != 'focus' else 'focus', label)
                counts[kind] += 1
                rows.append(row)
                if kind == 'focus':
                    open_weeks.discard((row['year'], row['week']))
                else:
                    seen_quotes.add(norm_text(row['body']))

        accepted, refused = allocate_tips(valid_tips, by_cat)
        for row in accepted:
            report('tip', '[%s] %s' % (row['category'], row['title']))
            counts['tips'] += 1
            rows.append(row)
            by_cat[row['category']] += 1
        for row, why in refused:
            report('tip', row['title'], why)
            summary['skipped'] += 1
        summary.update(counts, tips_by_category=by_cat)
        short = ['%s %d/%d' % (c, n, TIPS_MIN_PER_CATEGORY) for c, n in by_cat.items() if n < TIPS_MIN_PER_CATEGORY]
        if short:
            print('WARN tip categories below the minimum after this run: ' + ', '.join(short))
        if apply and rows:
            try:
                summary['written'] = len(sb.call('POST', 'content?select=id', rows,
                                                 prefer='return=representation') or [])
            except ApiError as e:
                sys.exit('WRITE FAILED — %s' % e)

    print('SUMMARY ' + json.dumps(summary))
    if apply:
        print('PUBLISHED: %d rows written' % summary['written'])
    else:
        print('DRY RUN: nothing written')


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('action', choices=['prepare', 'publish'])
    ap.add_argument('--task', required=True, choices=['news', 'weekly'])
    ap.add_argument('--run-dir', required=True, help='where context and batch files live')
    ap.add_argument('--key-file', required=True, help='local file holding the service_role JWT')
    ap.add_argument('--apply', action='store_true', help='publish: write; without it, print the plan only')
    ap.add_argument('--today', help='treat this YYYY-MM-DD as today (dry runs only, for testing)')
    a = ap.parse_args(argv)

    if a.today and a.apply:
        abort('--today is for dry runs only')
    today = parse_date(a.today) if a.today else dt.date.today()
    if today is None:
        abort('--today must be YYYY-MM-DD')

    sb = Supabase(read_service_key(a.key_file))
    try:
        if a.action == 'prepare':
            prepare(sb, a.task, os.path.expanduser(a.run_dir), today)
        else:
            publish(sb, a.task, os.path.expanduser(a.run_dir), today, a.apply)
    except ApiError as e:
        sys.exit('FAILED: could not read the database — %s' % e)


if __name__ == '__main__':
    main()
