// Small formatting and DOM helpers shared by every view.

export function todayISO(){
  // Local time, not UTC. toISOString() used to make the app think "today" was
  // tomorrow from ~7pm Central, mis-dating evening weigh-ins.
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

export function fmt(n, d=0){
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {minimumFractionDigits:d, maximumFractionDigits:d});
}

export function shortDate(iso){
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day:'2-digit', month:'short' }).toUpperCase();
}

export function longDate(iso){
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short' });
}

// "07:20:00" (Postgres time) → "7:20 am"
export function shortTime(t){
  if (!t) return '—';
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(t);
  let h = Number(m[1]);
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${suffix}`;
}

export function pad3(n){ return String(n).padStart(3,'0'); }

export function escapeAttr(s){
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')
                        .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function el(id){ return document.getElementById(id); }

export function setSyncStatus(status, msg){
  // Sync status appears on more than one screen now, so update every instance.
  const nodes = document.querySelectorAll('.sync-status');
  if (!nodes.length) return;
  let text = '';
  if (status === 'ok') text = 'Synced ✓';
  else if (status === 'saving') text = 'Saving…';
  else if (status === 'importing') text = 'Importing existing data…';
  else if (status === 'error') text = 'Sync error — ' + (msg || 'unknown');
  nodes.forEach(n => { n.classList.toggle('err', status === 'error'); n.textContent = text; });
}

// ISO date n days before the given ISO date.
export function isoMinusDays(iso, n){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
