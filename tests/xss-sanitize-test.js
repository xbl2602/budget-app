// S1 regression: hostile ids / icons / colours arriving from a LAN peer, an imported
// file or the cloud must not survive DataStore._sanitizeEntities / _normalize.
// Usage: node tests/xss-sanitize-test.js   (no jsdom needed)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const store = {};
const win = {};
const ctx = {
  window: win, console, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  document: { addEventListener() {}, getElementById: () => null, querySelector: () => null },
  crypto: require('crypto').webcrypto, TextEncoder, TextDecoder,
  navigator: { onLine: true }, __: k => k
};
ctx.window = ctx.self = ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['00-i18n.js', '01-constants.js', '02-datastore.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'src/js', f), 'utf8'), ctx, { filename: f });
}
const DataStore = ctx.DataStore;

let failed = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) failed++; }

const evilId = "');alert(1);('";
const data = DataStore._normalize({
  records: [
    { id: 'r1', amount: 5, date: '2026-01-01', categoryId: 'cat-root-1' },
    { id: evilId, amount: 5, date: '2026-01-01', categoryId: 'cat-root-1' },
    { id: 'r3', amount: 5, date: '2026-01-01', categoryId: '"><img src=x onerror=alert(1)>' }
  ],
  categories: [
    { id: 'cat-root-1', name: '餐饮', icon: '🍜', color: '#6366F1', parentId: null, sortOrder: 0 },
    { id: evilId, name: 'x', icon: '📁', color: '#6366F1', parentId: null, sortOrder: 1 },
    { id: 'c-ok', name: 'y', icon: '<img src=x onerror=alert(1)>', color: 'red;background:url(x)', parentId: 'cat-root-1', sortOrder: 0 },
    { id: 'c-long', name: 'z', icon: 'a'.repeat(200), color: '#abc', parentId: null, sortOrder: 2 }
  ],
  billCategories: [
    { id: 'b1', name: 'rent', icon: '"onmouseover="alert(1)', color: '#10B981' },
    { id: evilId, name: 'bad', icon: '🏠', color: '#10B981' }
  ],
  contacts: [{ id: 'anon:ok', name: 'a' }, { id: evilId, name: 'b' }],
  splitBills: [{ id: 's1', amount: 10, participants: [], categoryId: evilId }, { id: evilId, amount: 1, participants: [] }]
});

check('hostile record id dropped', !data.records.some(r => r.id === evilId));
check('valid records kept', data.records.some(r => r.id === 'r1') && data.records.some(r => r.id === 'r3'));
check('hostile categoryId on record replaced', data.records.find(r => r.id === 'r3').categoryId === 'uncategorized');
check('hostile category id dropped', !data.categories.some(c => c.id === evilId));
check('valid category untouched', JSON.stringify(data.categories.find(c => c.id === 'cat-root-1')) ===
  JSON.stringify({ id: 'cat-root-1', name: '餐饮', icon: '🍜', color: '#6366F1', parentId: null, sortOrder: 0 }));
const c = data.categories.find(x => x.id === 'c-ok');
check('markup stripped from icon', !/[<>"'&]/.test(c.icon));
check('non-hex colour replaced', /^#[0-9a-fA-F]{6}$/.test(c.color));
check('oversized icon reset', data.categories.find(x => x.id === 'c-long').icon === '📁');
check('3-digit hex colour kept', data.categories.find(x => x.id === 'c-long').color === '#abc');
check('billCategory icon cleaned', !/["'<>]/.test(data.billCategories.find(b => b.id === 'b1').icon));
check('hostile billCategory id dropped', !data.billCategories.some(b => b.id === evilId));
check('hostile contact id dropped, anon: style kept', data.contacts.length === 1 && data.contacts[0].id === 'anon:ok');
check('hostile splitBill id dropped, bad categoryId replaced',
  data.splitBills.length === 1 && data.splitBills[0].categoryId === 'uncategorized');

// A payload whose categories are ALL hostile must not leave the app with none.
const empty = DataStore._normalize({ records: [], categories: [{ id: evilId, name: 'x', icon: 'x', color: '#000000' }] });
check('all-hostile categories fall back to defaults', empty.categories.length > 0);

// Every default category must survive the whitelist unchanged.
const defaults = DataStore._defaults();
const again = DataStore._normalize(JSON.parse(JSON.stringify(defaults)));
check('default categories all survive', again.categories.length === defaults.categories.length);

// S5: the CSP must keep the directives that default-src does not cover. base-uri stops an
// injected <base> from re-pointing relative URLs; form-action stops a form whose submit
// handler failed to run from putting amounts/notes into a GET query string.
for (const f of ['src/index.html', 'index.html']) {
  const m = fs.readFileSync(path.join(root, f), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
  const csp = m ? m[1] : '';
  check(f + ' CSP has base-uri \'none\'', /(^|;)\s*base-uri 'none'/.test(csp));
  check(f + ' CSP has form-action \'none\'', /(^|;)\s*form-action 'none'/.test(csp));
  check(f + ' CSP keeps default-src \'none\'', /(^|;)\s*default-src 'none'/.test(csp));
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
