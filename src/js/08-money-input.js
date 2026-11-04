/* ============================================================
   MONEY INPUT — cents-first entry (Touch 'n Go style) + "=" formulas (Excel style)
   ============================================================
   Digits fill in from the decimal point, so "23642" is RM 236.42 and no decimal
   key is ever needed:  2 → 0.02 · 23 → 0.23 · 236 → 2.36 · 2364 → 23.64 · 23642 → 236.42.
   Backspace drops the last digit (236.42 → 23.64). A phone's numeric keypad
   (inputmode="numeric") has no "." key at all, which is the point.

   FORMULA MODE (like a spreadsheet cell)
   --------------------------------------
   A field whose text STARTS WITH "=" is a formula: "=(12+8)*3". While it is being
   typed the text is free-form (no cents-first rewriting). When the user leaves the
   field, presses Enter, or clicks anything else (Save included) it is replaced by its
   RESULT, "60.00". The formula itself is never kept or saved — only the number.
   + - × ÷ (also * / x), brackets and decimals; × ÷ before + -. Anything unreadable
   (3+ · 5/0 · a negative result in an unsigned field) clears the field with a toast
   rather than saving a wrong number.
   A phone's numeric keypad has no "=" or operators, so on touch devices a small bar
   above the keyboard offers = ( ) + − × ÷ . — tapping an operator on an ordinary amount
   turns it into a formula that starts from that amount ("236.42" → "=236.42+").

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
   nothing is entered) — except WHILE a formula is being typed (it starts with "=").
   Formula text is held back from the field's own `oninput`, and turned into a number
   (with a change + input event) before any `onchange` / Enter / click handler runs,
   so every caller's parseFloat(el.value) still sees a number.

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
function isFormula(str) { return String(str).charAt(0) === '='; }

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

/* ---------------- formula evaluation ---------------- */

// Returns the number, or null when the text is not a complete, valid sum.
// Recursive descent:  expr = term (+|- term)* · term = unary (*|/ unary)* · unary = -unary | primary
function evaluate(src) {
  const s = String(src)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/＋/g, '+').replace(/[－−–—]/g, '-').replace(/[×xX＊]/g, '*').replace(/[÷／]/g, '/')
    .replace(/（/g, '(').replace(/）/g, ')').replace(/[．。]/g, '.').replace(/[,，\s]/g, '');
  if (!s || s.length > 200 || /[^0-9.+\-*/()]/.test(s)) return null;
  let i = 0;
  function num() {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function primary() {
    if (s[i] === '(') {
      i++;
      const v = expr();
      if (v === null || s[i] !== ')') return null;
      i++;
      return v;
    }
    return num();
  }
  function unary() {
    if (s[i] === '-') { i++; const v = unary(); return v === null ? null : -v; }
    if (s[i] === '+') { i++; return unary(); }
    return primary();
  }
  function term() {
    let v = unary();
    while (v !== null && (s[i] === '*' || s[i] === '/')) {
      const op = s[i++];
      const r = unary();
      if (r === null) return null;
      if (op === '*') v *= r;
      else { if (r === 0) return null; v /= r; }
    }
    return v;
  }
  function expr() {
    let v = term();
    while (v !== null && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  return (v === null || i !== s.length || !isFinite(v)) ? null : v;
}

// Turn a formula in `el` into its result. `notify` fires input + change so callers that
// listen for them (and the Enter / click paths, where the browser sends no change) see it.
function resolve(el, notify) {
  if (!isMoney(el) || !isFormula(el.value)) return;
  const body = el.value.slice(1);
  const v = body.trim() === '' ? null : evaluate(body);
  let out = null;
  if (v !== null) {
    const cents = Math.round(Math.abs(v) * 100 + 1e-7);
    const negative = v < 0 && cents > 0;
    if (cents < Math.pow(10, MAX_DIGITS) && (!negative || isSigned(el))) out = cents === 0 ? '' : format(cents, negative);
  }
  el.value = out === null ? '' : out;
  snapshot(el);
  if (out === null && body.trim() !== '' && typeof window.showToast === 'function') {
    window.showToast(__('money.badFormula'), 'error');
  }
  if (notify) {
    el.dispatchEvent(new Event('input', { bubbles: true }));       // a bare Event: not re-read as typing
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

// A value somebody else wrote ("12.5", "120") becomes 12.50 / 120.00 the moment the
// field is focused. Typing is derived from what is on screen, so it must already be
// in the canonical shape before the first keystroke.
function normalize(el) {
  const v = el.value;
  if (v === '' || v === '-' || isFormula(v)) return;
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
  el._moneyPrev = { cents: centsOf(isFormula(el.value) ? '' : el.value) };
}

function onFocus(e) {
  if (!isMoney(e.target)) return;
  normalize(e.target);
  snapshot(e.target);
  showBar();
}

function onBeforeInput(e) {
  if (isMoney(e.target)) snapshot(e.target);
}

// Characters a formula may contain (full-width forms from a Chinese IME included).
const FORMULA_JUNK = /[^0-9０-９.．,，+＋\-－−–—*＊/／xX×÷()（）\s]/g;

function onInput(e) {
  const el = e.target;
  if (!isMoney(el) || !e.inputType) return;
  const raw = el.value;

  if (isFormula(raw)) {
    // Free-form text. Leave an IME mid-composition alone; otherwise drop letters and any
    // later "=". The field's own oninput never sees half a sum ("12+" would read as 12).
    if (!e.isComposing) {
      const clean = '=' + raw.slice(1).replace(FORMULA_JUNK, '');
      if (clean !== raw) el.value = clean;
    }
    e.stopPropagation();
    return;
  }

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
// "1,234.5" is RM 1,234.50. A pasted "=…" is a formula and is kept as text.
function onPaste(e) {
  const el = e.target;
  if (!isMoney(el)) return;
  const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
  e.preventDefault();
  if (isFormula(text.trim())) {
    el.value = '=' + text.trim().slice(1).replace(FORMULA_JUNK, '');
    caretToEnd(el);
    return;
  }
  const m = text.replace(/,/g, '').match(/-?\d+(\.\d+)?|-?\.\d+/);
  if (!m) return;
  const n = parseFloat(m[0]);
  const cents = Math.min(centsOf(m[0]), Math.pow(10, MAX_DIGITS) - 1);
  el.value = cents === 0 ? '' : format(cents, isSigned(el) && n < 0);
  caretToEnd(el);
  snapshot(el);
  el.dispatchEvent(new Event('input', { bubbles: true }));         // a bare Event: not re-read as typing
}

// ---- where a formula becomes its result ----
// `change` (capture): runs before the field's own onchange="…", which then reads a number.
function onChange(e) { resolve(e.target, false); }
// Leaving the field some other way (the browser sends change first when the text was edited).
function onFocusOut(e) {
  resolve(e.target, true);
  if (isMoney(e.target) && !isMoney(e.relatedTarget)) hideBar();
}
// Enter submits / saves without leaving the field.
function onKeyDown(e) {
  if (e.key === 'Enter') resolve(e.target, true);
}
// Any click (Save included): finish the sum in the focused field first.
function onClick(e) {
  const a = document.activeElement;
  if (isMoney(a) && a !== e.target && !(bar && bar.contains(e.target))) resolve(a, true);
}

document.addEventListener('focus', onFocus, true);
document.addEventListener('focusout', onFocusOut, true);
document.addEventListener('beforeinput', onBeforeInput, true);
document.addEventListener('input', onInput, true);   // capture: runs before the field's own oninput
document.addEventListener('change', onChange, true);
document.addEventListener('keydown', onKeyDown, true);
document.addEventListener('click', onClick, true);
document.addEventListener('paste', onPaste, true);

/* ---------------- the key bar above a touch keyboard ---------------- */
let bar = null;
// [label, character inserted]
const BAR_KEYS = [['=', '='], ['(', '('], [')', ')'], ['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['.', '.']];

function isTouch() {
  try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; }
}

function placeBar() {
  if (!bar || bar.hidden) return;
  const vv = window.visualViewport;
  bar.style.bottom = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px' : '0px';
}

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'money-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', __('money.barLabel'));
  BAR_KEYS.forEach(function(k) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = k[0];
    b.setAttribute('data-k', k[1]);
    bar.appendChild(b);
  });
  bar.addEventListener('mousedown', function(e) { e.preventDefault(); });   // tapping a key must not close the keyboard
  bar.addEventListener('click', function(e) {
    const b = e.target.closest && e.target.closest('button[data-k]');
    const el = document.activeElement;
    if (b && isMoney(el)) insertFromBar(el, b.getAttribute('data-k'));
  });
  document.body.appendChild(bar);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', placeBar);
    window.visualViewport.addEventListener('scroll', placeBar);
  }
  return bar;
}

function showBar() {
  if (!isTouch()) return;
  ensureBar().hidden = false;
  placeBar();
}
function hideBar() { if (bar) bar.hidden = true; }

// An operator on an ordinary amount starts a formula from that amount: "236.42" → "=236.42+".
function insertFromBar(el, ch) {
  let v = el.value;
  if (!isFormula(v)) {
    if (v === '-') v = '';
    el.value = '=' + v;
    if (ch === '=') { caretToEnd(el); return; }
  } else if (ch === '=') return;
  el.value += ch;
  caretToEnd(el);
}

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
  resolve(el, false);
  const v = el.value;
  if (v === '' || v === '-') el.value = v === '-' ? '' : '-';
  else el.value = format(centsOf(v), parseFloat(v) > 0);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.focus();
}

  // === EXPORTS ===
  window.MoneyInput = { format: format, centsOf: centsOf, normalize: normalize, evaluate: evaluate, resolve: resolve, MAX_DIGITS: MAX_DIGITS };
  window.setMoneyMode = setMoneyMode;
  window.toggleMoneySign = toggleMoneySign;

  // === I18N ENTRIES ===
  addI18nEntries({
    'money.toggleSign': { zh: '正 / 负', en: 'Plus / minus' },
    'money.badFormula': { zh: '算式看不懂，请重新输入', en: "Couldn't read that sum. Please enter it again." },
    'money.barLabel': { zh: '算式符号', en: 'Sum keys' }
  });
})();
