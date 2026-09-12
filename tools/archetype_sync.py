#!/usr/bin/env python3
"""Archetype Boxing reservations -> Supabase, and auto-naming of Myzone sessions.

Run by the local scheduled task `archetype-reservation-sync`. That task does the
Gmail search (only it holds the Gmail connector) and hands the messages to this
script as JSON. Everything deterministic happens here, so the rules are code an
unattended run executes rather than prose it has to re-derive each time.

    python3 tools/archetype_sync.py --emails emails.json --key-file PATH [--apply]

Without --apply it prints the plan and writes nothing.

emails.json is a list of Gmail messages as search_threads returns them:
    [{"id": "...", "subject": "...", "snippet": "...", "sentAt": "2026-09-09T20:50:15Z"}]
(`date` is accepted in place of `sentAt`, `body` in place of `snippet`.)

--key-file is any LOCAL file containing the service_role JWT — the Myzone task's
SKILL.md already holds it, so no third copy of the secret is made. The key is
never printed. Standard library only: macOS ships Python 3.9 and no Node.
"""

import argparse
import base64
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = 'https://zbwqewemphykxqqksaza.supabase.co'
SENDER = 'danielle@archetypeboxing.com'

# The emails give a start time only. Every class on the schedule runs an hour.
CLASS_MINUTES = 60

# A Myzone session is credited with a class when the two overlap by at least
# this much. Overlap, NOT nearest start time — the data rules the latter out:
#   * the strap goes on anywhere from ~35 min early (20 Aug: 16:55 for 5:30)
#     to ~20 min late, so a start-time window either misses or overreaches;
#   * one session often spans two back-to-back classes (9 Sep: 06:29 for 114 min
#     covers the 6:30 and the 7:30), which nearest-start can only half-name;
#   * 28 Aug's 17:48 session is nearest the 5:30 — which the gym charged a no-show
#     fee for — but it runs to 18:55: it was the 6:30.
MIN_OVERLAP_MINUTES = 20

# How far back sessions are (re)considered for naming on a normal run. Long
# enough to absorb a week with the Mac off; --since overrides it for a backfill.
NAME_LOOKBACK_DAYS = 21

MONTHS = {m: i for i, m in enumerate(
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
TIME = r'(\d{1,2}:\d{2}\s*[AP]M)'

BOOKED = re.compile(r'^You reserved (.+) at ' + TIME + r' on (\d{1,2})/(\d{1,2})/(\d{4})!?$', re.I)
WHO = re.compile(r'reserved for .+? with (.+?)! We will see you')
CANCELLED_SUBJECT = re.compile(r'^Reservation Cancell?ed:', re.I)
# The cancellation SUBJECT has time and class but no date. The body has all three.
CANCELLED = re.compile(
    r'reservation for (.+?) on (\d{1,2})/(\d{1,2})/(\d{4}) at ' + TIME + r' has been cancell?ed', re.I)
RECEIPT = re.compile(
    r'(Sales|Refund) Receipt .*?No Show Fee (.+?) - ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), ' + TIME)


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def to24(t):
    """'6:30 PM' -> '18:30:00', the shape Postgres returns for a time column."""
    m = re.match(r'^(\d{1,2}):(\d{2})\s*([AP])M$', t.strip(), re.I)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3).upper() == 'P' else 0)
    return '%02d:%s:00' % (h, m.group(2))


def iso(y, m, d):
    return '%04d-%02d-%02d' % (int(y), int(m), int(d))


def parse_email(msg):
    """One Gmail message -> one event dict, or None for everything else the gym
    sends (merch and membership receipts, milestones, waivers).

    kind: booked | cancelled | no_show | no_show_refunded
    """
    subject = html.unescape(msg.get('subject') or '').strip()
    body = re.sub(r'\s+', ' ', html.unescape(msg.get('snippet') or msg.get('body') or ''))
    base = {'message_id': msg.get('id'), 'sent_at': msg.get('sentAt') or msg.get('date')}

    m = BOOKED.match(subject)
    if m:
        who = WHO.search(body)
        return dict(base, kind='booked', class_name=m.group(1).strip(), start_time=to24(m.group(2)),
                    date=iso(m.group(5), m.group(3), m.group(4)),
                    instructors=who.group(1).strip() if who else None)

    if CANCELLED_SUBJECT.match(subject):
        m = CANCELLED.search(body)
        if not m:
            return None
        return dict(base, kind='cancelled', class_name=m.group(1).strip(), start_time=to24(m.group(5)),
                    date=iso(m.group(4), m.group(2), m.group(3)), instructors=None)

    if subject.lower() == 'receipt':
        m = RECEIPT.search(body)
        if not m or m.group(3) not in MONTHS:
            return None
        return dict(base, kind='no_show_refunded' if m.group(1) == 'Refund' else 'no_show',
                    class_name=m.group(2).strip(), start_time=to24(m.group(6)),
                    date=iso(m.group(5), MONTHS[m.group(3)], m.group(4)), instructors=None)

    return None


def looks_like_reservation(msg):
    s = (msg.get('subject') or '').strip()
    return s.lower().startswith('you reserved') or bool(CANCELLED_SUBJECT.match(s))


# ---------------------------------------------------------------------------
# Resolving
# ---------------------------------------------------------------------------
def _when(s):
    s = str(s)
    if s.isdigit():  # Gmail internalDate, ms
        return dt.datetime.fromtimestamp(int(s) / 1000, dt.timezone.utc)
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))


def resolve(events):
    """Events -> one row per class, holding its current state.

    The NEWEST booking-or-cancellation email decides the status. A cancellation
    does not simply supersede its booking: classes get rebooked, sometimes over
    and over (Saturday Boxing, 5 Sep — booked, cancelled, booked, cancelled).

    status is None when only a receipt was seen (the booking fell outside the
    lookback); no_show is None when no receipt was seen. None means "unknown,
    leave the stored value alone" — never False.

    Safe against a partial lookback window: if any email for a class is inside
    the window, the newest one is too.
    """
    by_key = {}
    for e in sorted((e for e in events if e), key=lambda e: _when(e['sent_at'])):
        k = (e['date'], e['start_time'], e['class_name'])
        r = by_key.get(k) or {
            'date': e['date'], 'start_time': e['start_time'], 'class_name': e['class_name'],
            'instructors': None, 'status': None, 'no_show': None,
            'message_id': None, 'email_sent_at': None,
        }
        if e['kind'] in ('booked', 'cancelled'):
            r['status'] = e['kind']
            if e.get('instructors'):
                r['instructors'] = e['instructors']
            r['message_id'] = e['message_id']
            r['email_sent_at'] = e['sent_at']
        else:
            r['no_show'] = e['kind'] == 'no_show'
        by_key[k] = r
    return sorted(by_key.values(), key=lambda r: (r['date'], r['start_time']))


def merge(stored, fresh):
    """Stored reservation rows overlaid with freshly resolved ones. Name matching
    needs both: a session's booking email is often older than the lookback."""
    by_key = {(r['date'], r['start_time'], r['class_name']): dict(r) for r in stored}
    for f in fresh:
        k = (f['date'], f['start_time'], f['class_name'])
        r = by_key.setdefault(k, {'date': f['date'], 'start_time': f['start_time'],
                                  'class_name': f['class_name'], 'status': None, 'no_show': False})
        if f['status']:
            r['status'] = f['status']
        if f['instructors']:
            r['instructors'] = f['instructors']
        if f['no_show'] is not None:
            r['no_show'] = f['no_show']
    return [r for r in by_key.values() if r.get('status')]


# ---------------------------------------------------------------------------
# Matching and naming
# ---------------------------------------------------------------------------
def minutes_of(t):
    h, m = str(t).split(':')[:2]
    return int(h) * 60 + int(m)


def display_class(name):
    """The gym appends booking rules to some names. Stored in full, shown without."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', name or '').strip()


def match_session(workout, reservations):
    """The booked classes a Myzone session was actually at, in time order."""
    start = minutes_of(workout['start_time'])
    end = start + int(workout.get('minutes') or 0)
    hits = []
    for r in reservations:
        if r['date'] != workout['date'] or r.get('status') != 'booked' or r.get('no_show'):
            continue
        cs = minutes_of(r['start_time'])
        if min(end, cs + CLASS_MINUTES) - max(start, cs) >= MIN_OVERLAP_MINUTES:
            hits.append(r)
    return sorted(hits, key=lambda r: r['start_time'])


def session_name(classes):
    """'Archetype Boxing ×2', 'Saturday Boxing + Boxing Ring Class'."""
    parts = []
    for c in classes:
        name = display_class(c['class_name'])
        if parts and parts[-1][0] == name:
            parts[-1][1] += 1
        else:
            parts.append([name, 1])
    return ' + '.join('%s ×%d' % (n, k) if k > 1 else n for n, k in parts) or None


def propose_names(rows, reservations):
    """Names to write onto `workouts`.

    A session is auto-named only while its name is NULL, or still equals
    `name_auto` — the value this step last wrote. A label typed in ANY build of
    the app (including the live one, which has never heard of name_auto) differs
    from it and is never touched. A name the user deliberately cleared is '' not
    NULL, so it stays cleared. Never erases a name.
    """
    out = []
    for w in rows:
        current, auto = w.get('name'), w.get('name_auto')
        if not (current is None or (auto is not None and current == auto)):
            continue
        name = session_name(match_session(w, reservations))
        if name and name != current:
            out.append({'id': w['id'], 'date': w['date'], 'start_time': w['start_time'],
                        'minutes': w.get('minutes'), 'from': current, 'name': name})
    return out


# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------
class ApiError(Exception):
    pass


def read_service_key(path):
    text = open(os.path.expanduser(path)).read()
    for tok in re.findall(r'eyJ[\w-]+\.[\w-]+\.[\w-]+', text):
        try:
            payload = tok.split('.')[1]
            payload += '=' * (-len(payload) % 4)
            if json.loads(base64.urlsafe_b64decode(payload)).get('role') == 'service_role':
                return tok
        except Exception:
            continue
    sys.exit('No service_role key found in %s' % path)


class Supabase:
    def __init__(self, key):
        self.key = key

    def call(self, method, path, body=None, prefer=None):
        req = urllib.request.Request(
            SUPABASE_URL + '/rest/v1/' + path, method=method,
            data=None if body is None else json.dumps(body).encode())
        req.add_header('apikey', self.key)
        req.add_header('Authorization', 'Bearer ' + self.key)
        req.add_header('Content-Type', 'application/json')
        if prefer:
            req.add_header('Prefer', prefer)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode()
        except urllib.error.HTTPError as e:
            raise ApiError('%s %s -> %s %s' % (method, path.split('?')[0], e.code, e.read().decode()[:300]))
        return json.loads(text) if text.strip() else None


def q(v):
    return urllib.parse.quote(str(v), safe='')


def upsert_reservations(sb, rows, now_iso):
    # Group by key set: a bulk upsert fills absent keys with NULL, which would
    # erase stored instructors or no_show. Only send what is actually known.
    groups = {}
    for r in rows:
        body = {k: r[k] for k in ('date', 'start_time', 'class_name', 'status', 'message_id', 'email_sent_at')}
        if r['instructors']:
            body['instructors'] = r['instructors']
        if r['no_show'] is not None:
            body['no_show'] = r['no_show']
        body['updated_at'] = now_iso
        groups.setdefault(tuple(sorted(body)), []).append(body)
    for batch in groups.values():
        sb.call('POST', 'reservations?on_conflict=date,start_time,class_name', batch,
                prefer='resolution=merge-duplicates,return=minimal')


def patch_no_show(sb, r, now_iso):
    # Receipt seen, booking not: update an existing row, never invent one.
    res = sb.call('PATCH', 'reservations?date=eq.%s&start_time=eq.%s&class_name=eq.%s'
                  % (q(r['date']), q(r['start_time']), q(r['class_name'])),
                  {'no_show': r['no_show'], 'updated_at': now_iso}, prefer='return=representation')
    return len(res or [])


def write_name(sb, p):
    # Guarded on the value read: if the user retyped the name since, 0 rows match.
    guard = 'name=is.null' if p['from'] is None else 'name=eq.' + q(p['from'])
    res = sb.call('PATCH', 'workouts?id=eq.%d&%s' % (p['id'], guard),
                  {'name': p['name'], 'name_auto': p['name']}, prefer='return=representation')
    return len(res or [])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--emails', required=True, help='JSON list of Gmail messages')
    ap.add_argument('--key-file', required=True, help='local file holding the service_role JWT')
    ap.add_argument('--apply', action='store_true', help='write; without it, print the plan only')
    ap.add_argument('--since', help='earliest session date to (re)name, YYYY-MM-DD '
                                    '(default: %d days ago)' % NAME_LOOKBACK_DAYS)
    ap.add_argument('--dump-reservations', help='also write the resolved reservations to this JSON file')
    a = ap.parse_args(argv)

    emails = json.load(open(a.emails))
    events = [parse_email(m) for m in emails]
    unparsed = [m['subject'] for m, e in zip(emails, events) if e is None and looks_like_reservation(m)]
    fresh = resolve(events)
    full = [r for r in fresh if r['status']]
    receipt_only = [r for r in fresh if not r['status'] and r['no_show'] is not None]

    since = a.since or (dt.date.today() - dt.timedelta(days=NAME_LOOKBACK_DAYS)).isoformat()
    now_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    mode = 'APPLY' if a.apply else 'DRY RUN'
    print('%s · %d emails · %d reservation events · %d classes resolved (%d booked, %d cancelled) · '
          '%d receipt-only' % (mode, len(emails), sum(1 for e in events if e), len(fresh),
                               sum(1 for r in full if r['status'] == 'booked'),
                               sum(1 for r in full if r['status'] == 'cancelled'), len(receipt_only)))
    for s in unparsed:
        print('WARN unparsed reservation email (fetch its full body and re-run): %s' % s)

    if a.dump_reservations:
        json.dump(fresh, open(a.dump_reservations, 'w'), indent=1)

    sb = Supabase(read_service_key(a.key_file))

    try:
        stored = sb.call('GET', 'reservations?select=*&date=gte.%s' % since) or []
        has_table = True
    except ApiError:
        stored, has_table = [], False
    try:
        rows = sb.call('GET', 'workouts?select=id,date,start_time,minutes,name,name_auto'
                              '&date=gte.%s&order=date,start_time' % since) or []
        has_name_auto = True
    except ApiError:
        rows = sb.call('GET', 'workouts?select=id,date,start_time,minutes,name'
                              '&date=gte.%s&order=date,start_time' % since) or []
        has_name_auto = False

    if not (has_table and has_name_auto):
        msg = 'supabase-phase5.sql has not been run (reservations table: %s, workouts.name_auto: %s)' % (
            'yes' if has_table else 'MISSING', 'yes' if has_name_auto else 'MISSING')
        if a.apply:
            sys.exit('REFUSING TO WRITE — ' + msg)
        print('NOTE ' + msg + '; matching against the emails alone.')

    reservations = merge(stored, fresh)
    proposals = propose_names(rows, reservations)
    kept = sum(1 for w in rows if w.get('name') is not None and w.get('name') != w.get('name_auto'))

    print('sessions since %s: %d · user-named, left alone: %d · to name: %d'
          % (since, len(rows), kept, len(proposals)))
    for p in proposals:
        print('  NAME %s %s %3s min  %s -> %s' % (p['date'], p['start_time'][:5], p['minutes'],
                                                 'NULL' if p['from'] is None else repr(p['from']), p['name']))

    written = skipped = patched = 0
    if a.apply:
        try:
            if full:
                upsert_reservations(sb, full, now_iso)
            for r in receipt_only:
                patched += patch_no_show(sb, r, now_iso)
            for p in proposals:
                if write_name(sb, p):
                    written += 1
                else:
                    skipped += 1
        except ApiError as e:
            sys.exit('WRITE FAILED — %s' % e)

    print('SUMMARY ' + json.dumps({
        'mode': mode.lower(), 'reservations_upserted': len(full) if a.apply else 0,
        'no_show_patched': patched, 'names_written': written,
        'names_skipped_changed_meanwhile': skipped, 'names_proposed': len(proposals),
        'unparsed': len(unparsed)}))


if __name__ == '__main__':
    main()
