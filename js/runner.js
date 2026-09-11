// Round-timer engine.
//
// Every rule here was established on a real iPhone (iOS 26.6.1, 2026-09-11) via
// prototype-timer.html. Two runs were needed; don't relax any of them without
// re-testing on device.
//
//   1. Never accumulate time. State is one epoch timestamp and position is
//      recomputed from Date.now(). Verified across 41.8s backgrounded over two
//      screen locks: every boundary after resume landed exactly on time. Timers
//      kept running through one lock and were suspended through the next, which
//      is exactly why they can't be trusted.
//   2. Null the wake lock in its `release` handler, or a re-acquire guarded by
//      `!wakeLock` never fires. The first run held the lock for 18 seconds of a
//      110-second session because of this.
//   3. Unlock audio inside the Start gesture — resume() plus a silent 1-frame
//      buffer. Creating the context there is not enough; iOS returns it suspended.
//   4. Any non-'running' state needs a resume. iOS parks the context in
//      'interrupted', not only 'suspended'.
//
// A round timer you cannot hear is useless when you're on a bag rather than
// watching a screen, so cues are load-bearing — which makes the screen staying
// on load-bearing too. The runner reports lock loss rather than going quiet.

export const runner = {
  active: false,
  templateId: null,
  templateName: '',
  rounds: [],        // [{ name, seconds, kind }]
  startedAt: 0,
  pausedMs: 0,
  pausedAt: 0,
  wakeHeld: false,
  onTick: null,      // (position) => void
  onPhase: null,     // (position) => void
  onEnd: null        // (summary) => void
};

let audioCtx = null;
let wakeLock = null;
let painter = null;
let lastKey = '';

// ---------------------------------------------------------------------------
// Position — the whole engine, really
// ---------------------------------------------------------------------------
export function positionAt(now){
  const total = runner.rounds.reduce((a,r) => a + r.seconds, 0);
  let elapsed = (now - runner.startedAt - runner.pausedMs) / 1000;
  if (runner.pausedAt) elapsed = (runner.pausedAt - runner.startedAt - runner.pausedMs) / 1000;
  elapsed = Math.max(0, elapsed);

  if (elapsed >= total) {
    return { done:true, elapsed:total, total, index:runner.rounds.length - 1,
             round:null, remaining:0, workIndex:workCount() };
  }
  let acc = 0;
  for (let i = 0; i < runner.rounds.length; i++){
    const r = runner.rounds[i];
    if (elapsed < acc + r.seconds) {
      return { done:false, elapsed, total, index:i, round:r,
               remaining:(acc + r.seconds) - elapsed,
               workIndex: runner.rounds.slice(0, i+1).filter(x => x.kind === 'work').length };
    }
    acc += r.seconds;
  }
  return { done:true, elapsed:total, total, index:runner.rounds.length - 1,
           round:null, remaining:0, workIndex:workCount() };
}

export function workCount(){ return runner.rounds.filter(r => r.kind === 'work').length; }

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
// MUST be called synchronously from the Start tap.
function unlockAudio(){
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().catch(() => {});
    const b = audioCtx.createBufferSource();
    b.buffer = audioCtx.createBuffer(1, 1, 22050);
    b.connect(audioCtx.destination);
    b.start(0);
  } catch(e) { audioCtx = null; }
}

export function audioState(){ return audioCtx ? audioCtx.state : 'none'; }

function cue(beeps, freq){
  if (navigator.vibrate) { try { navigator.vibrate([120,80,120]); } catch(e){} }
  if (!audioCtx) return;
  if (audioCtx.state !== 'running') { audioCtx.resume().catch(() => {}); return; }
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < beeps; i++){
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = freq || 880;
    g.gain.setValueAtTime(0.0001, t0 + i*0.18);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + i*0.18 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i*0.18 + 0.14);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0 + i*0.18); o.stop(t0 + i*0.18 + 0.16);
  }
}

// ---------------------------------------------------------------------------
// Wake lock
// ---------------------------------------------------------------------------
async function acquireWake(){
  if (!('wakeLock' in navigator)) { runner.wakeHeld = false; return; }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    runner.wakeHeld = true;
    wakeLock.addEventListener('release', () => {
      // Rule 2. Without this the re-acquire below never fires again.
      wakeLock = null;
      runner.wakeHeld = false;
    });
  } catch(e) { wakeLock = null; runner.wakeHeld = false; }
}
function releaseWake(){
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  runner.wakeHeld = false;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
export function startSession(template){
  unlockAudio();                       // rule 3: inside the gesture
  runner.active = true;
  runner.templateId = template.id ?? null;
  runner.templateName = template.name;
  runner.rounds = expandRounds(template);
  runner.startedAt = Date.now();
  runner.pausedMs = 0;
  runner.pausedAt = 0;
  lastKey = '';
  acquireWake();
  painter = setInterval(tick, 200);
  tick();
  cue(1, 1040);
}

// A template stores work rounds; rests are interleaved from its defaults so the
// builder stays about the work and the rests can be retimed in one place.
export function expandRounds(t){
  const out = [];
  const work = (t.rounds || []).filter(r => r.kind !== 'rest');
  work.forEach((r, i) => {
    out.push({ name: r.name || `Round ${i+1}`, seconds: r.seconds || t.workSeconds, kind: 'work' });
    if (i < work.length - 1) out.push({ name: 'Rest', seconds: t.restSeconds, kind: 'rest' });
  });
  return out;
}

function tick(){
  if (!runner.active) return;
  const p = positionAt(Date.now());
  if (runner.onTick) runner.onTick(p);

  if (p.done) { finish(true); return; }

  const key = p.index + ':' + p.round.kind;
  if (key !== lastKey) {
    if (lastKey) cue(p.round.kind === 'work' ? 2 : 1, p.round.kind === 'work' ? 880 : 620);
    lastKey = key;
    if (runner.onPhase) runner.onPhase(p);
  }
}

export function pauseToggle(){
  if (!runner.active) return;
  if (runner.pausedAt) { runner.pausedMs += Date.now() - runner.pausedAt; runner.pausedAt = 0; }
  else { runner.pausedAt = Date.now(); }
}
export function isPaused(){ return !!runner.pausedAt; }

export function skipRound(){
  if (!runner.active) return;
  const p = positionAt(Date.now());
  // Rewind the start so the clock lands on the next boundary. Still one
  // timestamp, still nothing accumulated.
  if (!p.done) runner.startedAt -= p.remaining * 1000;
  tick();
}

export function endSession(){ finish(false); }

function finish(completed){
  if (!runner.active) return;
  clearInterval(painter); painter = null;
  releaseWake();
  runner.active = false;
  const p = positionAt(Date.now());
  const summary = {
    templateId: runner.templateId,
    templateName: runner.templateName,
    date: new Date(runner.startedAt - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),
    startedAt: new Date(runner.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    roundsPlanned: workCount(),
    roundsDone: completed ? workCount() : (p.workIndex || 0),
    completed
  };
  if (completed) cue(3, 1040);
  if (runner.onEnd) runner.onEnd(summary);
}

// Re-acquire on return; a released lock cannot be requested while hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});  // rule 4
  if (runner.active && !wakeLock) acquireWake();
  if (runner.active) tick();
});
