/* ============================================================
   数据导出 / 合并 完整性审计
   ------------------------------------------------------------
   这不是断言式测试，是一份「审计报告生成器」：把一份铺满了每个
   字段的数据，推过 exportJSON / importJSON / 局域网同步 / Excel /
   CSV / 指纹码 六条路径，逐字段对比还原结果。

   跑法：  bash build.sh && node tests/export-integrity-audit.js
   退出码恒为 0 —— 它的产物是报告，不是红绿灯，所以不会影响
   tests/ 下其余 8 个套件的通过状态。

   报告解读见 docs/data-export-integrity-audit.md。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
// Shared jsdom harness for the export/merge coverage audit.


function makeCanvasStub() {
  const n = () => {};
  return { canvas: null, setTransform:n, scale:n, translate:n, rotate:n, clearRect:n, fillRect:n,
    strokeRect:n, beginPath:n, closePath:n, moveTo:n, lineTo:n, arc:n, arcTo:n, bezierCurveTo:n,
    quadraticCurveTo:n, fill:n, stroke:n, clip:n, fillText:n, strokeText:n,
    measureText:()=>({width:10}), save:n, restore:n,
    createLinearGradient:()=>({addColorStop:n}), createRadialGradient:()=>({addColorStop:n}),
    createPattern:()=>({}), drawImage:n, getImageData:()=>({data:new Uint8ClampedArray(4)}),
    putImageData:n, roundRect:n, resetTransform:n, lineWidth:1, fillStyle:'#000', strokeStyle:'#000',
    globalAlpha:1, font:'10px sans-serif', textAlign:'left', textBaseline:'alphabetic',
    lineCap:'butt', lineJoin:'miter', shadowBlur:0, shadowColor:'transparent' };
}

// Minimal RTCPeerConnection so createClient() completes and we can hand it a
// data channel by hand — this drives the REAL receiveAndMerge(), not a copy.
function installRTCStub(w) {
  w.__rtcChannels = [];
  w.RTCPeerConnection = function () {
    const self = this;
    this.iceConnectionState = 'connected';
    this.iceGatheringState = 'complete';
    this.localDescription = { sdp: 'stub-sdp' };
    this.ondatachannel = null;
    this.onicecandidate = null;
    this.setRemoteDescription = () => Promise.resolve();
    this.createAnswer = () => Promise.resolve({ type: 'answer', sdp: 'stub-sdp' });
    this.setLocalDescription = () => Promise.resolve();
    this.createDataChannel = () => ({ readyState: 'open', send() {}, close() {} });
    this.close = () => {};
    w.__rtcChannels.push({
      fire(payload) {
        if (typeof self.ondatachannel !== 'function') return 'no-ondatachannel';
        const ch = { readyState: 'open', send() {}, close() {}, onopen: null, onmessage: null, onerror: null };
        self.ondatachannel({ channel: ch });
        if (ch.onopen) ch.onopen();
        if (typeof ch.onmessage !== 'function') return 'no-onmessage';
        ch.onmessage({ data: payload });
        return 'delivered';
      }
    });
  };
}

function boot() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(w) {
      const s = makeCanvasStub();
      w.HTMLCanvasElement.prototype.getContext = function () { this._stub = s; s.canvas = this; return s; };
      w.CanvasRenderingContext2D = function () {};
      w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
      w.URL.createObjectURL = () => 'blob:stub';
      w.URL.revokeObjectURL = () => {};
      installRTCStub(w);
      // 页面自带大量 [INIT]/[DIAG] 日志，静音它们，只留审计报告
      const quiet = () => {};
      w.console = { log: quiet, warn: quiet, error: quiet, info: quiet, debug: quiet, trace: quiet, group: quiet, groupEnd: quiet, table: quiet };
    },
  });
  return new Promise(res => setTimeout(() => res(dom.window), 1500));
}




// 铺满每一个键、每一个嵌套字段的基准数据。
// 任何新增字段都应该加到这里，否则审计覆盖不到它。
const FULL_TEMPLATE = {"records":[{"id":"rec-1","amount":300,"categoryId":"X","date":"2026-08-01T19:30","note":"火锅","tags":["聚餐"],"splitBillId":"sb-1","excludeFromAvg":true,"createdAt":"2026-08-01T11:00:00.000Z","updatedAt":"2026-08-02T11:00:00.000Z"},{"id":"rec-2","amount":150,"categoryId":"X","date":"2026-08-05T09:00","note":"分期","tags":[],"planId":"plan-1","planMonth":"2026-08","excludeFromAvg":true,"createdAt":"2026-08-05T09:00:00.000Z"}],
"categories":[],"budgets":{"2026-08":4000},"categoryBudgets":{},"savingsTarget":{"type":"percent","fixedAmount":0,"percent":20},"colorIndex":77,
"billCategories":[{"id":"bc-1","name":"房租","icon":"🏠"}],"billAmounts":{"bc-1:2026-08":1200},"monthlyIncome":{"2026-08":6000},"percentBase":"net","lastActiveMonth":"2026-08","whatIfParams":{"scenario":"probe","delta":12},
"contacts":[{"id":"ct-1","name":"Alice"},{"id":"ct-2","name":"Bob"}],
"splitBills":[{"id":"sb-1","payer":"self","amount":300,"date":"2026-08-01T19:30","categoryId":"X","selfShare":100,"selfUnknown":true,"mode":"specified","note":"火锅","tag":"聚餐","archived":false,"createdAt":"2026-08-01T11:00:00.000Z","updatedAt":"2026-08-02T11:00:00.000Z","participants":[{"contactId":"ct-1","name":"Alice","share":120,"paid":false,"paidAmount":45,"unknown":false},{"contactId":"ct-2","name":"Bob","share":80,"paid":true,"paidAmount":80,"unknown":true}]}],
"purchasePlans":[{"id":"plan-1","name":"MacBook","icon":"💻","totalAmount":6000,"mode":"borrow","startMonth":"2026-06","months":12,"categoryId":"","status":"active","overrides":{"2026-07":700},"note":"分期买","notifiedComplete":false,"createdAt":"2026-06-01T00:00:00.000Z","updatedAt":"2026-06-01T00:00:00.000Z"}],
"allTags":["聚餐","旅行"],"tagColors":{"聚餐":"#ff8800"}};

function deepDiff(expect, actual, path, out) {
  if (expect === actual) return;
  if (expect && typeof expect === 'object' && actual && typeof actual === 'object') {
    if (Array.isArray(expect)) {
      if (!Array.isArray(actual)) { out.push(path + ': 不再是数组'); return; }
      if (expect.length !== actual.length) out.push(path + ': 长度 ' + expect.length + ' → ' + actual.length);
      // 元素带 id 时按 id 对齐 —— 局域网同步会按日期重排 records，
      // 那是正确行为，不该被当成字段丢失。
      const keyed = expect.length && expect.every(e => e && typeof e === 'object' && e.id);
      if (keyed) {
        const byId = {};
        actual.forEach(a => { if (a && a.id) byId[a.id] = a; });
        expect.forEach(e => {
          if (!(e.id in byId)) { out.push(path + '[id=' + e.id + ']: 整条丢失'); return; }
          deepDiff(e, byId[e.id], path + '[id=' + e.id + ']', out);
        });
        return;
      }
      const n = Math.min(expect.length, actual.length);
      for (let i = 0; i < n; i++) deepDiff(expect[i], actual[i], path + '[' + i + ']', out);
      return;
    }
    const keys = new Set([...Object.keys(expect), ...Object.keys(actual)]);
    keys.forEach(k => deepDiff(expect[k], actual[k], path ? path + '.' + k : k, out));
    return;
  }
  out.push(path + ': ' + JSON.stringify(expect) + ' → ' + JSON.stringify(actual));
}

// 把 payload 推过真实的局域网接收路径（RTCPeerConnection 由 harness 打桩，
// receiveAndMerge / validateSyncData / mergeIntoDataStore 都是真代码）。
async function lan(w, payload, mode) {
  let i = w.document.getElementById('syncOfferInput');
  if (!i) { i = w.document.createElement('input'); i.id = 'syncOfferInput'; w.document.body.appendChild(i); }
  i.value = 'stub-offer';
  w.SyncUI.connectAsClient();
  await new Promise(r => setTimeout(r, 120));
  w.__rtcChannels[w.__rtcChannels.length - 1].fire(payload);
  await new Promise(r => setTimeout(r, 20));
  w.confirmSyncMode(mode);
  await new Promise(r => setTimeout(r, 20));
}

boot().then(async w => {
  const DS = w.DataStore;
  const L = (...a) => console.log(a.join(' '));
  const cats = JSON.parse(JSON.stringify(DS.getCategories()));
  const catId = cats[0].id;

  const FULL = JSON.parse(JSON.stringify(FULL_TEMPLATE));
  FULL.categories = cats;
  FULL.records.forEach(r => { r.categoryId = catId; });
  FULL.splitBills[0].categoryId = catId;
  FULL.categoryBudgets = { [catId + ':2026-08']: { value: 500, type: 'fixed' } };
  const KEYS = Object.keys(FULL);

  function load() { DS.clearAll(); DS.importJSON(JSON.stringify(FULL), 'replace'); }
  function snap() { return JSON.parse(DS.exportJSON()); }
  function report(title, actual) {
    const out = [];
    // allTags 是有序集合，addTagUsage() 与合并路径都会 .sort()。
    // 顺序差异是既定行为，比对前统一排序，只看成员是否齐全。
    const norm = o => {
      if (!o) return o;
      const c = JSON.parse(JSON.stringify(o));
      if (Array.isArray(c.allTags)) c.allTags = c.allTags.slice().sort();
      return c;
    };
    const exp = norm(FULL), act = norm(actual);
    KEYS.forEach(k => deepDiff(exp[k], act ? act[k] : undefined, k, out));
    L('');
    L('### ' + title);
    if (!out.length) { L('    ✅ 全部字段无损'); return; }
    out.slice(0, 24).forEach(d => L('    ❌ ' + d));
    if (out.length > 24) L('    … 另有 ' + (out.length - 24) + ' 处差异');
  }
  async function excel() {
    let c = null; const o = w.URL.createObjectURL;
    w.URL.createObjectURL = b => { c = b; return 'x'; };
    w.HTMLAnchorElement.prototype.click = function () {};
    try { w.exportToExcel(); } catch (e) { w.URL.createObjectURL = o; return '__THREW__' + e.message; }
    const t = await c.text(); w.URL.createObjectURL = o; return t;
  }

  L('===== A. 往返完整性矩阵 =====');
  load();
  const payload = DS.exportJSON();

  DS.clearAll(); DS.importJSON(payload, 'replace');
  report('路径1  exportJSON → importJSON(replace)', snap());

  DS.clearAll(); DS.importJSON(payload, 'merge');
  report('路径2  exportJSON → importJSON(merge) 进空库', snap());

  DS.clearAll(); await lan(w, payload, 'replace');
  report('路径3  exportJSON → 局域网同步(replace)', snap());

  DS.clearAll(); await lan(w, payload, 'merge');
  report('路径4  exportJSON → 局域网同步(merge) 进空库', snap());

  L('');
  L('===== B. 重复导入是否去重 =====');
  DS.clearAll(); DS.importJSON(payload, 'replace');
  const n0 = DS._data.records.length;
  DS.importJSON(payload, 'merge');
  const n1 = DS._data.records.length;
  DS.importJSON(payload, 'merge');
  const n2 = DS._data.records.length;
  L('    importJSON merge 同一份三次: ' + n0 + ' → ' + n1 + ' → ' + n2 + (n2 === n0 ? '  ✅' : '  ❌ 记录重复累加'));

  L('');
  L('===== C. Excel 覆盖 =====');
  load();
  const xml = await excel();
  [['消费记录 sheet','消费记录'],['分类统计 sheet','分类统计'],['月度统计 sheet','月度统计'],
   ['预算跟踪 sheet','预算跟踪'],['储蓄统计 sheet','储蓄统计'],['分摊账单 sheet','分摊账单'],
   ['大额计划 sheet','大额计划'],['记录备注','火锅'],['标签','聚餐'],
   ['分摊参与人 Alice','Alice'],['分摊参与人 Bob','Bob'],['部分还款状态','部分已还'],
   ['金额不明标记','金额不明'],['Alice 已还 45 的金额','45.00'],
   ['计划名','MacBook'],['计划逐月子行','↳ 2026-06'],['账单分类','房租'],['月收入','6000'],
   ['标签颜色 tagColors','#ff8800']
  ].forEach(([label, needle]) => L('    ' + (xml.indexOf(needle) !== -1 ? '✅' : '❌') + ' ' + label));

  L('');
  L('===== D. Excel 分摊子行列对齐 =====');
  const sStart = xml.indexOf('<Worksheet ss:Name="分摊账单">');
  const sheet = xml.slice(sStart, xml.indexOf('</Worksheet>', sStart));
  const rows = sheet.split('<Row>').filter(r => r.indexOf('↳') !== -1);
  rows.forEach(r => {
    const n = (r.match(/<Cell/g) || []).length;
    const name = (r.match(/↳ ([^<]*)/) || [])[1] || '?';
    L('    ' + (n === 8 ? '✅' : '❌') + ' 子行「' + name.trim() + '」写了 ' + n + ' 个单元格（表头 8 列，需要 ss:Index 才能落到 D/H）');
  });

  L('');
  L('===== E. CSV 覆盖 =====');
  const csv = DS.exportCSV();
  L('    表头: ' + csv.split('\n')[0].replace(/^\uFEFF/, ''));
  [['标签', /聚餐/], ['分摊标记', /🧾/], ['备注', /火锅/], ['子分类', /子分类/],
   ['参与人姓名', /Alice/], ['已还金额', /45/], ['所属大额计划', /MacBook|plan-1/],
   ['月收入', /6000/], ['预算', /4000/]
  ].forEach(([l, re]) => L('    ' + (re.test(csv) ? '✅' : '❌') + ' ' + l));

  L('');
  L('===== F. 指纹敏感度（改一处，看指纹是否变化）=====');
  const muts = [
    ['records[0].amount 金额',              d => d.records[0].amount = 999],
    ['records[0].note 备注',                d => d.records[0].note = '改了'],
    ['records[0].date 日期',                d => d.records[0].date = '2026-09-09T10:00'],
    ['records[0].createdAt 创建时间',       d => d.records[0].createdAt = '2020-01-01T00:00:00.000Z'],
    ['categories[0].name 分类名',           d => d.categories[0].name = '新名'],
    ['categories[0].icon 分类图标',         d => d.categories[0].icon = '🔥'],
    ['categories[0].color 分类颜色',        d => d.categories[0].color = '#123456'],
    // payer 被删掉时 _normalize 会补回 'self'，数据实际相同，指纹相同才是对的。
    // 真正该察觉的是它被改成了「别的值」。
    ['splitBills[0].payer 付款人（改值）',   d => d.splitBills[0].payer = 'someone-else'],
    ['splitBills[0].selfUnknown 自己金额不明', d => d.splitBills[0].selfUnknown = false],
    ['splitBills[0].tag 账单标签',          d => d.splitBills[0].tag = '改了'],
    ['participants[0].paidAmount 已还金额', d => d.splitBills[0].participants[0].paidAmount = 999],
    ['purchasePlans[0].overrides 手动干预', d => d.purchasePlans[0].overrides = { '2026-07': 1 }],
    ['purchasePlans[0].icon 计划图标',      d => d.purchasePlans[0].icon = '🎯'],
    ['tagColors 标签颜色',                  d => d.tagColors = { '聚餐': '#000000' }],
    ['allTags 标签库',                      d => d.allTags = ['独一份']],
    ['colorIndex 配色游标',                 d => d.colorIndex = 1],
    ['billAmounts 账单金额',                d => d.billAmounts = { 'bc-1:2026-08': 9999 }],
    ['monthlyIncome 月收入',                d => d.monthlyIncome = { '2026-08': 1 }],
  ];
  load();
  const h0 = DS.getDataHash();
  muts.forEach(([label, mut]) => {
    const d = JSON.parse(JSON.stringify(FULL)); mut(d);
    DS.clearAll(); DS.importJSON(JSON.stringify(d), 'replace');
    L('    ' + (DS.getDataHash() !== h0 ? '✅ 察觉' : '❌ 盲区') + '  ' + label);
  });

  L('');
  L('===== F2. payer 缺失自愈（批次1 之后「缺 payer」已不是一种可达状态）=====');
  {
    const noPayer = JSON.parse(JSON.stringify(FULL));
    delete noPayer.splitBills[0].payer;
    DS.clearAll(); DS.importJSON(JSON.stringify(noPayer), 'replace');
    const a = [w.StatsEngine.getSplitContrib('2026-08'), w.StatsEngine.getSplitUnpaid('2026-08'), w.StatsEngine.getSplitOthers('2026-08')];
    DS.clearAll(); DS.importJSON(JSON.stringify(FULL), 'replace');
    const b = [w.StatsEngine.getSplitContrib('2026-08'), w.StatsEngine.getSplitUnpaid('2026-08'), w.StatsEngine.getSplitOthers('2026-08')];
    L('    ' + (DS._data.splitBills[0].payer === 'self' ? '✅' : '❌') + ' 导入后 payer 被补为 self');
    L('    ' + (JSON.stringify(a) === JSON.stringify(b) ? '✅' : '❌') + ' 缺 payer 与带 payer 的分摊统计完全一致  ' + JSON.stringify(a));
  }

  L('');
  L('===== G. 局域网校验器接受的日期格式 =====');
  const base = { id: 'v1', amount: 42, categoryId: catId, note: 'x', tags: [] };
  const trials = [
    ['App 实际写入的格式 (date=datetime-local, createdAt=ISO)', { date: '2026-08-01T19:30', createdAt: '2026-08-28T13:33:57.536Z' }],
    ['date=YYYY-MM-DD, createdAt=ISO',                          { date: '2026-08-01',       createdAt: '2026-08-28T13:33:57.536Z' }],
    ['date=datetime-local, createdAt=YYYY-MM-DD',               { date: '2026-08-01T19:30', createdAt: '2026-08-01' }],
    ['date=YYYY-MM-DD, createdAt=YYYY-MM-DD',                   { date: '2026-08-01',       createdAt: '2026-08-01' }],
    ['date=YYYY-MM-DD, 无 createdAt',                           { date: '2026-08-01' }],
  ];
  for (const [label, extra] of trials) {
    DS.clearAll();
    await lan(w, JSON.stringify({ records: [Object.assign({}, base, extra)], categories: cats, budgets: {}, categoryBudgets: {} }), 'replace');
    L('    ' + (DS._data.records.length ? '✅ 通过' : '❌ 被丢弃') + '  ' + label);
  }

  L('');
  L('===== H. 手机版 schema 往返 =====');
  {
    const mhtml = fs.readFileSync(path.join(__dirname, '..', 'money-wise-mobile.html'), 'utf8');
    const md = new JSDOM(mhtml, { runScripts: 'dangerously', url: 'http://localhost/',
      beforeParse(mwin) { const q = () => {}; mwin.console = { log: q, warn: q, error: q, info: q, debug: q }; } });
    const mw = md.window;
    await new Promise(r => setTimeout(r, 600));
    const MDS = mw.DataStore;
    const seed = JSON.parse(JSON.stringify(FULL));
    seed.categories = JSON.parse(JSON.stringify(MDS.getCategories()));
    seed.records.forEach(r => { r.categoryId = seed.categories[0].id; });
    mw.localStorage.setItem('budgetAppData', JSON.stringify(seed));
    MDS.init();
    L('    init 后保留 ' + Object.keys(MDS._data).length + ' 个键');
    MDS.importJSON(JSON.stringify({ records: seed.records, categories: seed.categories }), 'replace');
    const after = JSON.parse(mw.localStorage.getItem('budgetAppData'));
    const lost = Object.keys(seed).filter(k => !(k in after));
    L('    replace 导入后剩 ' + Object.keys(after).length + ' 个键');
    L('    ' + (lost.length ? '❌ 丢失: ' + lost.join(', ') : '✅ 无丢失'));
    MDS.clearAll();
    const after2 = JSON.parse(mw.localStorage.getItem('budgetAppData'));
    L('    clearAll 后剩 ' + Object.keys(after2).length + ' 个键，savingsTarget.type=' + JSON.stringify(after2.savingsTarget.type)
      + (after2.savingsTarget.type === 'both' ? '  ❌ 桌面版不认识这个值' : ''));
  }

  process.exit(0);
}).catch(e => { console.log('审计脚本自身出错:', e.stack); process.exit(0); });
