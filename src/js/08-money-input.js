/* ============================================================
   MONEY INPUT — cents-first entry (Touch 'n Go style)
   ============================================================
   Digits fill in from the decimal point, so "23642" is RM 236.42 and no decimal
   key is ever needed:  2 → 0.02 · 23 → 0.23 · 236 → 2.36 · 2364 → 23.64 · 23642 → 236.42.
   Backspace drops the last digit (236.42 → 23.64). A phone's numeric keypad
   (inputmode="numeric") has no "." key at all, which is the point.

   HOW A FIELD OPTS IN
   -------------------
   Mark it:  <input type="text" inputmode="numeric" data-money …>
   That is all. The handlers below are delegated on `document`, so inputs that are
   rendered later — modals, pages that re-render — need no per-render wiring.
   `data-money="signed"` additionally lets a leading minus through ('-' toggles the
   sign; there is also a ± button, see toggleMoneySign — iOS' numeric keypad has no
   minus key).

   WHAT THE VALUE LOOKS LIKE
   -------------------------
   Always a plain decimal string with two places ("236.42", "-5.00", or "" when
   nothing is entered). That is exactly what every caller already feeds to
   parseFloat(), which is why converting a field from type="number" is only a
   markup change.

   WHY ONLY REAL TYPING IS REWRITTEN
   ---------------------------------
   Reformatting runs for genuine user input (an InputEvent carries `inputType`).
   A script that sets `.value = '1200'` and fires a bare `new Event('input')` is
   saying "the amount is 1200", not "the user typed the digits 1-2-0-0", so it is
   left alone. Without this, every programmatic prefill would be re-read as cents.

   A field that is sometimes money and sometimes not (a budget that is RM or %, a
   what-if value that is RM or %) switches with setMoneyMode().
   ============================================================ */
(function() {
'use strict';

const MAX_DIGITS = 11;          // 999,999,999.99 — ample, and keeps every sum exact

function isMoney(el) {
  return !!(el && el.tagName === 'INPUT' && el.hasAttribute && el.hasAttribute('data-money'));
}
function isSigned(el) { return el.getAttribute('data-money') === 'signed'; }

// Integer cents so no float ever decides a digit. 12.345 (legacy, 3 places) → 1235.
function centsOf(str) {
  const n = parseFloat(String(str).replace(/,/g, ''));
  return isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
}

function format(cents, negative) {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return (negative && cents > 0 ? '-' : '') + whole + '.' + frac;
}

function caretToEnd(el) {
  try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* not a text field */ }
}

// A value somebody else wrote ("12.5", "120") becomes 12.50 / 120.00 the moment the
// field is focused. Typing is derived from what is on screen, so it must already be
// in the canonical shape before the first keystroke.
function normalize(el) {
  const v = el.value;
  if (v === '' || v === '-') return;
  const n = parseFloat(v);
  if (!isFinite(n)) return;
  const out = format(centsOf(v), isSigned(el) && n < 0);
  if (out !== v) el.value = out;
}

// What the field held BEFORE the edit about to happen. A typed digit is appended
// to this and Backspace pops its last digit, wherever the caret was: the user may
// well have tapped into the middle of "236.42", and "2364" + "9" must still be
// 2364.29, not a 9 spliced between the digits that happen to be on screen.
function snapshot(el) {
  el._moneyPrev = { cents: centsOf(el.value) };
}

function onFocus(e) {
  if (!isMoney(e.target)) return;
  normalize(e.target);
  snapshot(e.target);
}

function onBeforeInput(e) {
  if (isMoney(e.target)) snapshot(e.target);
}

function onInput(e) {
  const el = e.target;
  if (!isMoney(el) || !e.inputType) return;
  const raw = el.value;
  const rawDigits = raw.replace(/\D/g, '');
  const prev = el._moneyPrev;
  const prevDigits = prev && prev.cents ? String(prev.cents) : '';
  let digits;
  if (prev && e.inputType === 'insertText' && e.data != null) {
    const typed = String(e.data).replace(/\D/g, '');
    // Nothing of the old text survived (empty field, or select-all + type): start
    // over. Otherwise the digit goes on the end, whatever the caret said.
    digits = rawDigits === typed ? typed : prevDigits + typed;
  } else if (prev && (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward')) {
    digits = rawDigits === '' ? '' : prevDigits.slice(0, -1);      // emptied by a selection, else pop one digit
  } else {
    digits = rawDigits;                                            // drop, IME, autofill …: take what is there
  }
  digits = digits.slice(0, MAX_DIGITS);                            // overflow: the newest digit is dropped
  const cents = digits ? parseInt(digits, 10) : 0;
  const signed = isSigned(el);
  const negative = signed && ((raw.match(/-/g) || []).length % 2 === 1);
  let out;
  if (cents === 0) out = negative ? '-' : '';                      // a pending sign, or empty
  else out = format(cents, negative);
  if (el.value !== out) el.value = out;
  caretToEnd(el);
  snapshot(el);
}

// A pasted number is a number, not a stream of keystrokes: "50" is RM 50.00 and
// "1,234.5" is RM 1,234.50.
function onPaste(e) {
  const el = e.target;
  if (!isMoney(el)) return;
  const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
  const m = text.replace(/,/g, '').match(/-?\d+(\.\d+)?|-?\.\d+/);
  e.preventDefault();
  if (!m) return;
  const n = parseFloat(m[0]);
  const cents = Math.min(centsOf(m[0]), Math.pow(10, MAX_DIGITS) - 1);
  el.value = cents === 0 ? '' : format(cents, isSigned(el) && n < 0);
  caretToEnd(el);
  snapshot(el);
  el.dispatchEvent(new Event('input', { bubbles: true }));         // a bare Event: not re-read as typing
}

document.addEventListener('focus', onFocus, true);
document.addEventListener('beforeinput', onBeforeInput, true);
document.addEventListener('input', onInput, true);   // capture: runs before the field's own oninput
document.addEventListener('paste', onPaste, true);

/* Switch a field between money entry and plain number entry (RM ↔ %). */
function setMoneyMode(el, on, signed) {
  if (!el) return;
  if (on) {
    el.setAttribute('data-money', signed ? 'signed' : '');
    el.type = 'text';
    el.setAttribute('inputmode', 'numeric');
    normalize(el);
  } else {
    el.removeAttribute('data-money');
    el.type = 'number';
    el.removeAttribute('inputmode');
  }
}

/* The ± button next to a signed field. Fires `change` so the field saves as if typed. */
function toggleMoneySign(btn) {
  const el = btn && btn.parentElement && btn.parentElement.querySelector('input[data-money="signed"]');
  if (!el) return;
  const v = el.value;
  if (v === '' || v === '-') el.value = v === '-' ? '' : '-';
  else el.value = format(centsOf(v), parseFloat(v) > 0);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.focus();
}

  // === EXPORTS ===
  window.MoneyInput = { format: format, centsOf: centsOf, normalize: normalize, MAX_DIGITS: MAX_DIGITS };
  window.setMoneyMode = setMoneyMode;
  window.toggleMoneySign = toggleMoneySign;

  // === I18N ENTRIES ===
  addI18nEntries({
    'money.toggleSign': { zh: '正 / 负', en: 'Plus / minus' }
  });
})();
