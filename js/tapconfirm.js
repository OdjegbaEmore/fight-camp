// Two-tap confirmation, used instead of window.confirm().
//
// Native dialogs are unreliable here: embedded browsers and some PWA shells
// suppress them and return false, which silently cancels the action. End early
// on the round timer died exactly that way. The first tap arms the button and
// relabels it; a second tap within a few seconds acts. Mid-workout it is also
// easier than hunting for a dialog's OK button.

const ARM_MS = 4000;
const timers = new WeakMap();

export function tapConfirm(btn, armedLabel, action){
  if (btn.dataset.armed === '1') {
    clearTimeout(timers.get(btn));
    disarm(btn);
    action();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = armedLabel;
  btn.classList.add('armed');
  timers.set(btn, setTimeout(() => disarm(btn), ARM_MS));
}

function disarm(btn){
  if (btn.dataset.armed !== '1') return;
  btn.dataset.armed = '';
  btn.textContent = btn.dataset.label || btn.textContent;
  btn.classList.remove('armed');
}
