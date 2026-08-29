# 数据导出 / 导入 / 同步 完整性审计

> **审计日期**：2026-08-28
> **审计基线**：commit `fccd63f`（v3.2.0 之后的未发布状态）
> **审计范围**：`exportJSON` / `importJSON` / 局域网同步 / Excel / CSV / 指纹码 / 刷新机制 / 手机版
> **状态**：✅ **全部 19 项已修复**（2026-08-28，8 个批次）
> **修复计划**：[`data-export-fix-plan.md`](data-export-fix-plan.md)
> **回归测试**：`tests/data-integrity-fixes-test.js`（98 项）

---

## 0. 结论先行

**问：各类数据导出功能能否正确地导出并合并全部数据？**

**审计时的答案：不能 —— 六条路径只有一条完好。**
**修复后的答案：能 —— 四条往返路径全部字段无损。**

| 路径 | 审计时 | 修复后 |
|------|------|------|
| `exportJSON` → `importJSON(replace)` | ✅ 完好 | ✅ 全部字段无损 |
| `exportJSON` → `importJSON(merge)` | ❌ 不去重、丢 `tagColors` | ✅ 全部字段无损 |
| 局域网同步（replace） | ❌ 消费记录 100% 丢弃 | ✅ 全部字段无损 |
| 局域网同步（merge） | ❌ 消费记录 100% 丢弃 | ✅ 全部字段无损 |
| Excel 导出 | ⚠️ 分摊子行串列 | ✅ 对齐正确，逐月标注实测/推定 |
| CSV 导出 | ⚠️ 缺子分类、分期归属 | ✅ 已补齐（11 列） |
| 指纹码 | ❌ 18 项中 6 项盲区 | ✅ 18 项全部察觉 |
| 手机版往返 | ❌ 抹掉 15 个键 | ✅ 未知键全部保留 |

可复现审计脚本：`tests/export-integrity-audit.js`
跑法：`bash build.sh && node tests/export-integrity-audit.js`
它把一份铺满每个字段的数据推过全部六条路径，逐字段 diff 后输出报告，退出码恒为 0，不影响现有 8 个测试套件。

---

## 1. 数据结构全景

单一对象存于 `localStorage['budgetAppData']`。`_defaults()`（[`02-datastore.js:36`](../src/js/02-datastore.js)）声明 **15 个键**：

```
records  categories  budgets  categoryBudgets  savingsTarget  colorIndex
billCategories  billAmounts  monthlyIncome  percentBase  lastActiveMonth
whatIfParams  contacts  splitBills  purchasePlans
```

另有 **2 个懒创建、不在 `_defaults()` 里**的键 —— 正是它们在多条路径上掉队：

| 键 | 创建位置 | 备注 |
|---|---|---|
| `allTags` | `02-datastore.js:986` | 标签库 |
| `tagColors` | `02-datastore.js:1018` | 标签自定义颜色 |

另有 **25 个 `localStorage` 键在 `_data` 之外**（主题、语言、PIN 哈希与盐、各页偏好、`budgetStatsCatView` 等），任何导出都不包含它们。这一条属于**已知设计**，但 `25-page-guides.js:1232` 把「导出 JSON」描述为「完整数据备份，包含……设置」，措辞不准确。

### 关键认知：欠债金额不是存储数据

`purchasePlans` 只存**计划**（总额、期数、起始月、手动干预 `overrides`）。
「已还多少 / 还欠多少」由 [`04-stats-engine.js` 的 `PlanMath._compute()`](../src/js/04-stats-engine.js) **每次现场重放推导**，依赖 `monthlyIncome` + 当月消费。

**后果**：备份文件里根本没有「我还欠多少」这个事实。同一份 JSON 在不同机器、不同日期导出，欠款数字会不同。这是 P1-09 / P1-10 两个问题的共同根源。

---

## 2. 往返完整性矩阵（实测）

基准数据：17 个键全部赋非默认值，嵌套字段铺满（含 `paidAmount`、`selfUnknown`、`payer`、`overrides`、`planId`/`planMonth`）。

```
### 路径1  exportJSON → importJSON(replace)
    ✅ 全部字段无损

### 路径2  exportJSON → importJSON(merge) 进空库
    ❌ colorIndex: 77 → 29
    ❌ lastActiveMonth: "2026-08" → ""
    ❌ allTags 顺序被重排
    ❌ tagColors: {"聚餐":"#ff8800"} → undefined

### 路径3  exportJSON → 局域网同步(replace)
    ❌ records: 长度 2 → 0          ← 记录全灭
    ❌ colorIndex / lastActiveMonth / allTags / tagColors 全丢

### 路径4  exportJSON → 局域网同步(merge) 进空库
    ❌ records: 长度 2 → 0          ← 记录全灭
    ❌ colorIndex / lastActiveMonth / allTags / tagColors 全丢
```

---

# P0 — 会造成数据丢失或金额错误

## P0-01 ✅ 已修复 · `70da9a6` 局域网同步丢弃 100% 的消费记录

**严重度**：🔴 灾难性 —— replace 模式下本地记录先被清空，再导入 0 条

**现象**
两台设备同步，进度提示显示成功，结果收到 0 条消费记录。若选了「替换」，接收端的记录被全部清空且不可恢复（`budgetBackupBeforeSync` 里有备份，但界面没有恢复入口）。

**机理**
[`23-lan-sync.js:49-66`](../src/js/23-lan-sync.js) 的校验器：

```js
date: function (v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); },

function validateRecord(r) {
  return validators.amount(r.amount) &&
    validators.date(r.date) &&                                        // ← 只认 10 字符
    validators.id(r.id) &&
    (typeof r.note === 'undefined' || validators.note(r.note)) &&
    validators.id(r.categoryId) &&
    (typeof r.createdAt === 'undefined' || validators.date(r.createdAt)); // ← 也只认 10 字符
}
```

而 App 实际写入的是：

| 字段 | 实际值 | 长度 | 来源 |
|---|---|---|---|
| `date` | `"2026-08-01T19:30"` | 16 | 记账页 `datetime-local` 输入框 |
| `createdAt` | `"2026-08-28T13:33:57.536Z"` | 24 | `addRecord()` 的 `new Date().toISOString()` |

两个字段**都不匹配** `^\d{4}-\d{2}-\d{2}$`。`validateSyncData` 用 `data.records.filter(validateRecord)` 静默过滤（[`:82`](../src/js/23-lan-sync.js)），只 `console.warn` 一句，用户完全看不到。

雪上加霜：`receiveAndMerge` 返回的 `{records: data.records.length}` 是**过滤之后**的数量，所以「同步成功 N 条」里的 N 天然是 0，但这个 0 没有被当成异常拦下来。

**触发条件**
使用局域网同步功能，且记录是通过 App 正常记账产生的（即：**所有真实用户数据**）。

**复现**
```
node tests/export-integrity-audit.js   →  G 节
```
```
❌ 被丢弃  App 实际写入的格式 (date=datetime-local, createdAt=ISO)
❌ 被丢弃  date=YYYY-MM-DD, createdAt=ISO
❌ 被丢弃  date=datetime-local, createdAt=YYYY-MM-DD
✅ 通过  date=YYYY-MM-DD, createdAt=YYYY-MM-DD
✅ 通过  date=YYYY-MM-DD, 无 createdAt
```
只有手工构造的、两个字段都是纯日期的记录才能通过。

**修复方向**
校验器改为接受 `YYYY-MM-DD` 前缀 + 可选时间部分（`^\d{4}-\d{2}-\d{2}([T ].*)?$`），并给 `createdAt` 单独一个 ISO 校验。同时：过滤掉记录时必须给用户**可见的警告**并列出条数，replace 模式在「过滤后为空但源数据非空」时应当拒绝执行而不是清库。

---

## P0-02 ✅ 已修复 · `f35a92b` `importJSON` 合并模式不去重，重复导入消费翻倍

**严重度**：🔴 数据错误且难以察觉

**现象**
同一份备份用「合并」导入两次，所有消费记录变成两份，月度合计翻倍。

**机理**
[`02-datastore.js:684`](../src/js/02-datastore.js) 直接拼接，连 `id` 都不比对：

```js
this._data.records = [...data.records, ...this._data.records];
```

对照：局域网同步的 `mergeIntoDataStore`（[`23-lan-sync.js:265`](../src/js/23-lan-sync.js)）是按 `r.id` 去重并更新的。**两条 merge 路径行为不一致**，而 `docs/ai-data-import-spec.md` 恰恰把「合并」列为默认推荐模式。

**触发条件**
任何一次重复的「合并」导入 —— 包括「我不确定刚才导成功没有，再导一次」这种最自然的用户行为。

**复现**
```
node tests/export-integrity-audit.js   →  B 节
importJSON merge 同一份三次: 2 → 4 → 6  ❌ 记录重复累加
```

**修复方向**
照抄 `mergeIntoDataStore` 的语义：按 `id` 判重，已存在则按 `updatedAt` 决定是否覆盖。顺带统一两条 merge 路径的实现。

---

## P0-03 ✅ 已修复 · `e2e642b` `payer` 字段缺失 → 全部分摊统计归零，欠债消失

**严重度**：🔴 金额错误

**现象**
导入来的分摊账单，在「待收回总额」里是 0，月度净支出把别人的份额也算在自己头上。

**机理**
`payer: 'self'` 全项目**只有一处写入** —— [`14-render-add.js:158`](../src/js/14-render-add.js)（记账页新建分摊）。
但有 5 处消费点硬过滤：

- [`04-stats-engine.js:176`](../src/js/04-stats-engine.js) `_splitContribBetween`（已收回）
- [`04-stats-engine.js:195`](../src/js/04-stats-engine.js) `_splitOthersBetween`（他人份额）
- [`04-stats-engine.js:211`](../src/js/04-stats-engine.js) `_splitUnpaidBetween`（待收）
- [`04-stats-engine.js:227`](../src/js/04-stats-engine.js)
- [`26-split-bills.js:206`](../src/js/26-split-bills.js) `getContribBreakdown`（对账明细）

```js
if (b.payer !== 'self') return;   // 没有这个字段 → 整条账单被跳过
```

`init()` 的 splitBills 清洗（[`02-datastore.js:115`](../src/js/02-datastore.js)）只校验 `id` / `amount` / `participants`，**不补 `payer`**。`repairData()` 也不补。

**触发条件**
任何非「记账页新建」来源的分摊账单：AI 批量导入、手工构造 JSON、手机版导出、v3.1 之前的老备份。

**复现**
```
有 payer:  已收回=50  待收=150  他人份额=200  月净支出=250
无 payer:  已收回=0   待收=0    他人份额=0    月净支出=300
```
（一笔 300 元账单，自己 100、Alice 应还 200 已还 50。缺 `payer` 时 Alice 欠的 150 消失，300 全算自己头上。）

**修复方向**
`init()` 与 `repairData()` 里给缺失的账单补 `payer = 'self'`（历史上只有「自己垫付」这一种形态）。长期看，这个字段既然只有一个取值，应当考虑移除过滤或改为 `b.payer && b.payer !== 'self'`。

---

## P0-04 ❌ 误判 · 已回滚 · `<本次提交>`

**原判断**：`repairData()` 把「带 `planId` 但计划已不存在」的记录直接删掉，属于无声销毁用户数据。

**这个判断是错的。** 三条证据推翻：

**① `planId` 全项目只有一处写入** —— [`27-purchase-plans.js:200`](../src/js/27-purchase-plans.js)（`syncPlanRecords`）。所以带 `planId` 的记录 100% 是计划托管的自动流水，**不可能是用户手记的消费**。

**② 「孤儿分期记录必须清除」是代码里显式表达的设计**，三处一致：

| 位置 | 时机 |
|---|---|
| [`27-purchase-plans.js:728`](../src/js/27-purchase-plans.js) | 模式从 credit 切走时，注释写明 `Switching away from credit leaves its generated records orphaned — clear them` |
| [`02-datastore.js:676`](../src/js/02-datastore.js) | `deletePurchasePlan` 删计划时连带清 |
| `repairData()` | 前两者漏网的兜底 |

**③ 历史审计已判定此行为正确**：`technical/purchase-plans-audit-technical-20260815.md` 第 770 行 —— 「`repairData()` 对负数总额/非法期数/越界 override/残留分类/**孤儿流水** ｜ ✅ **修复正确且零误伤**」，配套脚本 `verify-repair.js` 的 D10 断言 `orphaned instalment record removed, normal record kept` 为 **PASS**。

**我的论据「AI 批量导入会产生带 planId 的孤儿记录」前提是假的**：`docs/ai-data-import-spec.md` §3.2 的 `records[]` 白名单只有 8 个字段（id / amount / categoryId / date / note / tags / excludeFromAvg / createdAt），**没有 `planId`**。

**改成「解除关联」反而有害**：删掉 `planId` 后它变成一条普通消费记录，永久虚增月度合计，而且再也无法被识别清理——比原来更糟。

**同一条里的第二处也是误判**：`if (p.mode !== 'credit' && p.categoryId) p.categoryId = ''` 不是「没有正当理由的清空」——[`27-purchase-plans.js:722`](../src/js/27-purchase-plans.js) 的 `savePlanEditor` 本身就是 `categoryId: mode === 'credit' ? categoryId : ''`，repairData 是在对齐这个既定不变量。

**处理**：整条回滚。测试改为锁定正确不变量（孤儿清除 / 普通记录保留 / 计划仍在时不误删 / credit 的 categoryId 保留）。

## P0-05 ✅ 已修复 · `e2e642b` `reload()` 不跑迁移 → 刷新之后 Excel 导出直接崩

**严重度**：🔴 功能完全失效且无任何提示

**现象**
点「🔄 刷新页面数据」之后，再点「导出 Excel」，什么都不发生 —— 没有文件，没有报错，没有 toast。

**机理**
[`02-datastore.js:367`](../src/js/02-datastore.js) 的 `reload()` 只有一行 `JSON.parse(raw)`，`init()` 里的补齐、清洗、`_migrateSplitRecordCategories` 一个都不跑：

```js
reload() {
  const raw = localStorage.getItem('budgetAppData');
  if (raw) { try { this._data = JSON.parse(raw); ... } }
}
```

于是 `_data` 可能缺 `budgets` / `monthlyIncome` / `purchasePlans` 等键，Excel 导出访问 `DataStore.getBudget(m)` 时抛 `Cannot read properties of undefined`。

**为什么用户看不到报错**：`build.sh` 的 `try/catch` 是**文件级**包裹，不是调用级 —— 一个文件的运行时异常冒泡到 `onclick` 就没了，控制台之外无任何反馈。

**触发条件**
localStorage 里的数据缺任何一个键（老备份、手机版写入、手工编辑），然后点刷新。

**复现**
```
node tests/export-integrity-audit.js  （见文末「其它已验证项」）
reload 后 categoryId 仍是 __split__  →  是（迁移未跑）
reload 后 monthlyIncome=undefined   purchasePlans=undefined
reload 后 exportToExcel 抛错: Cannot read properties of undefined (reading '2026-08')
```

**修复方向**
把 `init()` 里的补齐 + 清洗 + 迁移抽成 `_normalize(data)`，`init()` / `reload()` / `importJSON` 三处共用。

---

## P0-06 ⚠️ 部分修复（已收窄）· `f133b8e` + `<本次提交>`

**核心问题成立**：5 秒撤销窗口内点「刷新页面数据」，记录永久消失。`refreshPageData()` 会主动调 `_finalizeDelete()`，而记录的唯一副本只在内存 `_pendingDelete` 里。实测确认。

**保留的修法**：`refreshPageData()` 不再终结待删缓冲。刷新是「让我看到真相」，不是「确认我的删除」；5 秒计时器照常跑，到点自己终结。

**撤下的部分**：原修复还持久化了 record 本体、并让 `init()` 把缓冲恢复回内存（＝跨会话撤销）。复核后撤下，两个理由：

**① 超出「修 bug」范围** —— 那是新增功能。`budgetPendingDeletes` 里的 `deleteAt: +24h` 原本只是一道防御性清理，不是「24 小时可撤销」的承诺。

**② 重新引入了当初被修掉的状态** —— 恢复出来的缓冲没有计时器，永远不会自己过期。而 [`18-render-settings.js`](../src/js/18-render-settings.js) 的 `repairData()` 里有两处清扫，注释分别是 `clear any pending delete state which might be stale` 和 `verify pending delete is not **stuck**`，提交 `142ea5c` 的说明也明写「刷新时清除 pendingDelete 状态」——「pending 卡住」是有过实际困扰、被专门修过的。

**边界**：5 秒内按 F5 刷新浏览器，记录仍会丢失。这是「5 秒撤销窗口是内存态」的固有设计，维持原状。

## P0-07 ✅ 已修复 · `e2e642b` `Object.assign` 目标写成 `|| {}`，静默丢弃导入数据

**严重度**：🔴 静默数据丢失，且会连锁引爆 P1-09

**机理**
[`02-datastore.js:693 / 706 / 707`](../src/js/02-datastore.js) 三处把 `|| {}` 写在了**目标**位置：

```js
Object.assign(this._data.categoryBudgets || {}, data.categoryBudgets || {});
Object.assign(this._data.monthlyIncome  || {}, data.monthlyIncome  || {});
Object.assign(this._data.billAmounts    || {}, data.billAmounts    || {});
```

本地键不存在时，合并目标是一个**临时对象**，写完即弃。相邻的 `budgets`（[`:692`](../src/js/02-datastore.js)）写法是对的（会抛错而不是静默），可见这是笔误。

**连锁后果**：`monthlyIncome` 一旦丢失，`PlanMath` 把所有月份当作「收入未知」，欠债自动清零（见 P1-09）。

**复现**
```
minimal replace 后 monthlyIncome = undefined
merge 一份 monthlyIncome:{'2026-08':5000} 之后 → undefined
```

**修复方向**
```js
if (!this._data.monthlyIncome) this._data.monthlyIncome = {};
Object.assign(this._data.monthlyIncome, data.monthlyIncome || {});
```

---

## P0-08 ✅ 已修复 · `2c3ab80` 手机版仍是 v1 schema，replace 导入抹掉 15 个键

**严重度**：🔴 数据丢失

**机理**
[`money-wise-mobile.html:464-471`](../money-wise-mobile.html) 的 `_defaults()` 只有 6 个键。它的 `importJSON('replace')` 做 `this._data = data`、`clearAll()` 做 `this._data = this._defaults()`，两者都直接写回**共享的** `budgetAppData`。

**复现**
```
node tests/export-integrity-audit.js   →  H 节
init 后保留 17 个键
replace 导入后剩 2 个键
❌ 丢失: budgets, categoryBudgets, savingsTarget, colorIndex, billCategories,
         billAmounts, monthlyIncome, percentBase, lastActiveMonth, whatIfParams,
         contacts, splitBills, purchasePlans, allTags, tagColors
clearAll 后剩 6 个键，savingsTarget.type="both"  ❌ 桌面版不认识这个值
```

`README.md:114` 文档化的流程正是「手机上记 → 导出 JSON → 主应用导入」。手机上只跑过移动版的话，导出的 JSON 里没有这 15 个键，用 replace 导入主应用就是全没了。

**附加问题**：手机版默认 `savingsTarget.type = 'both'`，桌面版 [`04-stats-engine.js:409-410`](../src/js/04-stats-engine.js) 只认 `'fixed'` / `'percent'`，落到 `'both'` 时储蓄目标算作 0，设置页两个单选都不选中。

**修复方向**
两条路选一：(a) 手机版 `importJSON`/`clearAll` 改为**保留未知键**；(b) 明确把手机版降级为「只增不改」，禁用 replace 与 clearAll。另需把默认 `'both'` 改成 `'fixed'`。

---

# P1 — 欠债 / 还款数据失真

## P1-09 ✅ 已修复 · `0cc8600` 收入缺失 → 欠款凭空清零

**严重度**：🟠 数字错得很离谱，但方向是「显得更好」，用户不易起疑

**机理**
[`04-stats-engine.js:626-633`](../src/js/04-stats-engine.js)：

```js
due = st.remaining / periodsLeft;
const ov = p.overrides ? p.overrides[m] : undefined;
if (typeof ov === 'number' && isFinite(ov)) {
  actual = Math.max(0, Math.min(ov, st.remaining));
} else if (!incomeKnown) {
  actual = due;          // ← 把「不知道」当成「按计划全额还了」
} else {
  actual = Math.max(0, Math.min(due, surplus));
}
```

`monthSurplus(m)` 在该月没有登记收入时返回 `null`（[`:554`](../src/js/04-stats-engine.js)），于是 `incomeKnown = false`，直接按满额记还款。

**复现**（同一份计划数据，只差 `monthlyIncome`）
```
收入在场：已还=150   剩余欠款=1050  逾期=false
收入丢失：已还=1200  剩余欠款=0     逾期=false
```

**放大效应**：Excel sheet 7 用 `PlanMath.computeUpTo(今天)` 现算。今年 1 月建的计划、4~8 月没登记收入的话，导出必然显示「已还清、零欠款」。这条与 P0-07 叠加时尤其危险 —— 一次 merge 导入丢掉收入，欠款就全归零了。

**修复方向**
这是**产品语义决策**，不是纯 bug：「没登记收入」应该算「按计划还了」还是「进度未知」？
建议 —— 导出时把 `incomeKnown` 一并写出（Excel 逐月子行加一列「数据来源：实测/推定」），让用户看得出哪几个月是猜的。

---

## P1-10 ❌ 误判 · 已回滚 · `<本次提交>`

**原判断**：credit 模式无条件 `actual = due`，不看有没有扣款记录，所以「0 条记录也显示已还清」是 bug。

**这个判断是错的。** 用户指出后复验，两个事实推翻了它：

**① 信用卡分期的语义就是「银行按月自动扣，不由你决定」。** 「当作还了」符合定义，不是偷懒。

**② `syncPlanRecords()` 会把用户删掉的分期记录自动重建。** 它按 `planId + planMonth` 判重、只增不减：

```
首次 sync 后记录数 = 3   已还 900  剩余 0
用户删掉其中一期      = 2   已还 600  剩余 300
下次启动再 sync       = 3   已还 900  剩余 0    ← 被自动重建
```

所以「用户删掉记录 → 欠款显示 0」根本不是 bug——记录下次启动就回来了，欠款本来就该是 0。

**我当初「复现」的 0 记录场景，是在测试里直接注入了一个没有记录的 credit 计划，真实 App 里这个状态不可达**（跟 P0-03 的 `payer` 一样，是人造 fixture 造出来的假问题，只是那一条恰好是真的）。

**改成读记录反而引入了两个回归**：

| 回归 | 后果 |
|---|---|
| 启动序列是 `setTimeout(planBootstrap, 800)`——页面先渲染，800ms 后才生成本月分期记录 | 冷启动头 800ms 总览显示「已还 300 / 剩余 600」，之后跳变成「已还 600 / 剩余 300」。实测复现 |
| 删记录后欠款「如实回升」 | 那是瞬态，刷新即变回。把瞬态显示成持久状态，比原来更误导 |

**处理**：计算逻辑回滚为 `actual = due`，并把上述不变量写成注释锁在代码里。
测试改为锁定正确语义：有记录 / 无记录读数必须一致、每期实付等于月供、被删的分期会被重建。

> 遗留的 UX 观察（非本次范围）：用户在流水页删掉一期分期，下次启动它会自己回来，
> 可能造成困惑。这符合「银行自动扣款」的产品定义，但缺少解释。

## P1-11 ✅ 已修复 · `4d48962` 归档账单的欠款死锁

**严重度**：🟠 欠款永远清不掉

**机理**
`archived` 在 [`04-stats-engine.js`](../src/js/04-stats-engine.js) 里**一次都没出现** —— 三个分摊统计函数都不看归档状态。
但 [`26-split-bills.js:1054`](../src/js/26-split-bills.js) 归档后会移除还款控件：

```js
const control = b.archived ? '' : _splitPaidControl(...);
```

**复现**
```
未归档:  待收=150  已收=50
已归档:  待收=150  已收=50      ← 仍计入待收总额
```

一笔没收齐就归档的账单，欠款永远挂在「待收回总额」里，且再也没有入口结清它。

**修复方向**
要么归档时不再计入待收，要么归档卡片保留还款入口。取决于「归档」的产品定义 —— 是「已了结」还是「收起来不看」。

---

## P1-12 ✅ 已修复 · `4d48962` Excel 分摊子行串列

**严重度**：🟠 导出文件观感错乱

**机理**
[`03-excel-export.js:513-536`](../src/js/03-excel-export.js) 注释写明子行应占 `A, B, D, H`，代码却连写 4 个不带 `ss:Index` 的 `<Cell>` —— SpreadsheetML 按顺序填充，实际落在 `A, B, C, D`。

**实际导出**
```
表头:    日期 | 备注 | 分类 | 总额 | 自份额 | 他人待收 | 他人已还 | 状态
↳ Alice |     | 100.00 | 🟡 部分已还（已还 40.00，还差 60.00）
              ^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
              落在「分类」列  字符串塞进「总额」金额列
```

**复现**
```
node tests/export-integrity-audit.js   →  D 节
❌ 子行「我自己」写了 4 个单元格（表头 8 列，需要 ss:Index 才能落到 D/H）
❌ 子行「Alice」写了 4 个单元格
❌ 子行「Bob」写了 4 个单元格
```

**修复方向**
给第 3、4 个 `<Cell>` 加 `ss:Index="4"` / `ss:Index="8"`。同文件 sheet 7 的期数子行写法是对的（补了空 B 列），可作参照。

---

## P1-13 ✅ 已修复 · `4673f64` 指纹码 6 个盲区

**严重度**：🟠 「指纹相同 = 数据一致」这个承诺不成立

**机理**
`getDataHash()`（[`02-datastore.js:812-828`](../src/js/02-datastore.js)）是手工维护的字段白名单，分类部分至今仍是 `{id, name, parentId}`：

```js
categories: data.categories.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })),
```

白名单最后一次更新是 `9e0ca0d`（v3.1.0）。之后 `67422ff` 加的分类图标编辑、父级颜色继承、`selfUnknown` 一个都没跟上。

**实测（改一处，看指纹是否变化）**

| 字段 | 结果 | 引入自 |
|---|---|---|
| `records[0].amount` 金额 | ✅ 察觉 | |
| `records[0].note` 备注 | ✅ 察觉 | |
| `records[0].date` 日期 | ✅ 察觉 | |
| `records[0].createdAt` 创建时间 | ❌ **盲区** | |
| `categories[0].name` 分类名 | ✅ 察觉 | |
| `categories[0].icon` 分类图标 | ❌ **盲区** | `67422ff`（你要的「随时改图标」） |
| `categories[0].color` 分类颜色 | ❌ **盲区** | `67422ff`（父级颜色继承） |
| `splitBills[0].payer` 付款人 | ❌ **盲区** | 见 P0-03，决定金额口径 |
| `splitBills[0].selfUnknown` | ❌ **盲区** | `67422ff`（自己也能标金额不明） |
| `splitBills[0].tag` 账单标签 | ❌ **盲区** | |
| `participants[0].paidAmount` 已还金额 | ✅ 察觉 | `64935e7` |
| `purchasePlans[0].overrides` 手动干预 | ✅ 察觉 | |
| `purchasePlans[0].icon` | ✅ 察觉 | |
| `tagColors` 标签颜色 | ❌ **盲区** | |
| `allTags` 标签库 | ✅ 察觉 | |
| `colorIndex` 配色游标 | ❌ 盲区（可接受） | |
| `billAmounts` 账单金额 | ✅ 察觉 | |
| `monthlyIncome` 月收入 | ✅ 察觉 | |

`payer` 这条最要命：两台设备净支出差 150 元，指纹码却完全一样。

**修复方向**
放弃手工白名单，改为「全量序列化 + 排除名单」（排除 `_rev` 这类瞬时字段），这样新增字段自动纳入。同时把「新增字段须同步指纹」写进 `RULES.md`（目前 `REFERENCE.md:225` 只是提了一句风险，没有强制项）。

---

## P1-14 ✅ 已修复 · `f35a92b` `allTags` / `tagColors` 过不了局域网同步

**严重度**：🟠 附带一个误导性症状

**机理**
[`23-lan-sync.js:206-238`](../src/js/23-lan-sync.js) replace 模式先 `DataStore._data = DataStore._defaults()`，再按白名单逐项拷贝 —— `allTags` / `tagColors` / `colorIndex` / `lastActiveMonth` 都不在白名单里。
`mergeIntoDataStore`（[`:265`](../src/js/23-lan-sync.js)）同样没有这两个键。
`importJSON` 的 merge 分支处理了 `allTags`，但漏了 `tagColors`。

**误导性症状**：`allTags` **在**指纹白名单里。所以同步「成功」之后，两台设备的指纹反而对不上 —— 用户会以为同步失败，重同步，然后触发 P0-01 把记录清光。

---

# P2 — 健壮性 / 文档

## P2-15 ✅ 已修复 · `4d48962` `SplitEngine` 缺 typeof 守卫

[`03-excel-export.js:493`](../src/js/03-excel-export.js) 直接 `SplitEngine.partPaid(p)`，而同一文件 [`:549`](../src/js/03-excel-export.js) 对 `PlanMath` 是有 `typeof` 守卫的。`build.sh` 逐文件包 `try/catch`，`26-split-bills.js` 一旦抛错 `SplitEngine` 就是 undefined，Excel 导出整体静默失效。

## P2-16 ✅ 已修复 · `4d48962` `_deleted` 是死代码，文档写反了

[`docs/ai/REFERENCE.md:225`](ai/REFERENCE.md) 写「软删除（设 `_deleted` 标记）」，并称数据层有 `softDeleteRecord()`／`undoDelete()`／`_finalizeDelete()` 三件套。

实际：**全项目没有任何一处写入 `_deleted`**。`softDeleteRecord` 是把记录移出数组、暂存 `_pendingDelete`。三处读 `_deleted` 的代码（`04-stats-engine.js:433`、`17-stats-charts.js:2237`、指纹白名单）是残留。

导出不受影响，但文档会误导后续改动。

## P2-17 ✅ 已修复 · `4d48962` 锁定状态下导出会产出空备份

`lockData()`（[`02-datastore.js:978`](../src/js/02-datastore.js)）把 `_data` 设为 `null`，此后 `exportJSON()` 返回字符串 `"null"` —— 一个文件名正常、内容为空的「备份」。目前被 PIN 模态框挡着，属于加固项。

## P2-18 ✅ 已修复 · `4d48962` CSV 覆盖面过窄

表头：`ID,金额,分类,日期,备注,创建时间,不计日均,标签,分摊`

实测缺失：子分类、参与人姓名、参与人已还金额、所属大额计划。
分摊列只写「自份额」，且用了原始 `selfShare` 未做 `toFixed(2)`（Excel 那边是 `100.00`，CSV 是 `100`）。

CSV 定位为「只导流水」可以接受，但**子分类**和**分期归属**属于流水自身的属性，不应缺席。

## P2-19 ✅ 已修复 · `4d48962` 「导出 JSON = 完整备份」的说法不准确

[`25-page-guides.js:1232`](../src/js/25-page-guides.js) 称「完整数据备份，包含所有记录、分类、预算、设置」。
实际不含 25 个 `localStorage` 键：主题、语言、PIN 哈希与盐、自动锁定时长、各页偏好等。换机恢复后这些都要重设。

---

## 附：其它已验证项

| 项 | 结论 |
|---|---|
| Excel 7 个工作表是否齐全 | ✅ 全部存在 |
| Excel 是否覆盖部分还款 `paidAmount` | ✅ 金额与「🟡 部分已还」状态都在 |
| Excel 是否覆盖 `selfUnknown` | ✅ 有「↳ 我自己 / ❓ 金额不明」行 |
| Excel 是否覆盖大额计划逐月明细 | ✅ 有 `↳ 2026-06` 子行 |
| Excel 是否导出 `tagColors` | ❌ 无（可接受，Excel 不是还原通道） |
| `exportJSON → importJSON(replace)` | ✅ 17 个键全部无损 |

---

## 实施记录

19 个问题收敛到 6 个根因后分 8 批完成，每批：改动 → `bash build.sh` →
跑全部套件 → 跑审计脚本 → 提交。

| 批次 | commit | 内容 | 覆盖 |
|---|---|---|---|
| 1 | `e2e642b` | 抽出 `_normalize()` 数据规范化单一入口 | P0-03 P0-05 P0-07 |
| 2 | `70da9a6` | 局域网日期校验 + 拒绝静默丢弃 | P0-01 |
| 3 | `f35a92b` | `_mergeData()` 合并收敛，LAN replace 走 normalize | P0-02 P1-14 |
| 4 | `4673f64` | 指纹改全量稳定序列化，白名单换排除名单 | P1-13 |
| 5 | `f133b8e` | 孤儿记录改解除关联；待删项持久化 | P0-04 P0-06 |
| 6 | `0cc8600` | 推定进度自报可信度（同批的 credit 改动经复验为误判，已回滚） | P1-09 |
| 7 | `2c3ab80` | 手机版保留未知键 + merge 去重 | P0-08 |
| 8 | `4d48962` | 归档欠款、Excel 串列、CSV 补列、死代码、文案 | P1-11 P1-12 P2-15..19 |

### 最终验收

| 编号 | 标准 | 结果 |
|---|---|---|
| F1 | 审计 A 节四条路径全部「✅ 全部字段无损」 | ✅ |
| F2 | 审计 B/D/F/G/H 五节无 ❌ | ✅ 全脚本 0 个 ❌ |
| F3 | 全部测试套件通过 | ✅ 9 个套件全绿（waffle 的轮询缺陷一并修掉） |
| F4 | 每条问题标注修复与 commit | ✅ 见上表 |

> **复核记录**（2026-08-29，对照 `technical/purchase-plans-audit-technical-20260815.md`
> 及其 `audit-20260815-scripts/` 独立验证脚本逐条复查）：
>
> | 编号 | 结论 | 依据 |
> |---|---|---|
> | **P1-10** | ❌ 误判，已回滚 | credit 不回看流水是「防双重计算」的刻意设计；`syncPlanRecords` 会重建被删记录；改后引入 800ms 冷启动数字跳变 |
> | **P0-04** | ❌ 误判，已回滚 | 孤儿分期记录清除是三处一致的既定设计；历史审计判定「修复正确且零误伤」；我的论据前提（AI 导入产生 planId）是假的 |
> | **P0-06** | ⚠️ 收窄 | 核心问题成立，但跨会话撤销部分超范围且重新引入「卡住的 pending」 |
> | 其余 16 项 | ✅ 确认为真缺陷 | 见下表 |
>
> **最终：修复 16 项 + 1 项部分修复，2 项确认为原设计正确。**

### 逐项定性依据

| 编号 | 是真缺陷的依据 |
|---|---|
| P0-01 | 实测 App 写入的 `date` / `createdAt` 格式均不匹配校验器；用 RTC 桩驱动真实路径复现（`sanitizeHtml` 生效可证不是副本） |
| P0-02 | 代码为 `[...incoming, ...local]` 无任何去重；实测 2→4→6 |
| P0-03 | **过滤代码 `a84bbeb` 先于写入代码 `0ed4503` 落地，且无补齐迁移** —— 2026-08-12 前建的分摊账单永久缺 `payer`，属历史数据的必然状态 |
| P0-05 | 历史审计建议第 6 条明写「`repairData()` 对齐 `init()` 检查强度」 |
| P0-06 | 实测：撤销窗口内点刷新，记录不可恢复 |
| P0-07 | 空对象兜底写在了 `Object.assign` 的**目标**位置；相邻的 `budgets` 一行写法正确，可证是笔误而非设计 |
| P0-08 | 实测手机版 replace / clearAll 后 15 个键丢失 |
| P1-09 | 只新增标注，不改任何计算；`orch-verify-waterfall.js` 全绿 |
| P1-11 | ⚠️ 无决策记录，属**设计缺口**而非实现 bug（行为自相矛盾：归档移除还款控件却仍计入待收）。修法为产品判断，另一种选择是保留归档卡片的还款入口 |
| P1-12 | 代码与自身注释矛盾（注释写 A/B/D/H，实际落 A/B/C/D） |
| P1-13 | 历史审计 B-5 已确认同族字段丢失；实测 6 类改动指纹无感 |
| P1-14 | 历史审计 **B-5「确认（转录复现）」**，原文记为「属既有缺陷」 |
| P2-15 | 纯防御性，与同文件 `PlanMath` 的守卫对称 |
| P2-16 | `grep -rn "_deleted" src/` 确认零写入点 |
| P2-17 | 实测 `lockData()` 后 `exportJSON()` 返回字符串 `"null"` |
| P2-18 | 历史审计 **B-6「确认」**，原文点名缺 `planId`/`planMonth` 列 |
| P2-19 | 文案与实际导出内容不符 |

> **方法论沉淀**：这次复核抓出 2 项误判 + 1 项过度修复，判定准则已写成
> [`docs/ai/RULES.md`](ai/RULES.md) 规则 **#20「判定『缺陷』还是『设计』」**——
> 动手前先过三问：状态可达吗 / 代码里有无相反的显式不变量 / 历史记录说过相反的话吗。
>
> **独立验证**：`technical/audit-20260815-scripts/` 的 `orch-verify-waterfall.js`（瀑布算法 / 还债优先 / 预算挤压 / credit 防双重计算）与 `attack-destructive-credit-delete.js` 在本次改动后**全部 PASS**。
> `verify-lan-sync-direct.js` 的 A3/A4/A5 仍报 FAIL，但该脚本第 29 行自述是 `verbatim transcription of receiveAndMerge's REPLACE branch` —— 跑的是 2026-08-15 的代码副本，不反映本次修改；同样场景走真实路径（RTC 桩）已验证全部 PASS。
> `attack-status-transitions.js` 的 1 条 FAIL 在基线 `fccd63f` 同样存在，属既有缺陷、非本次引入。

```
category-treemap-test.js       41 PASS / 0 FAIL
category-waffle-test.js        51 PASS / 0 FAIL
data-integrity-fixes-test.js   98 通过 / 0 失败
export-coverage-test.js        54 PASS / 0 FAIL
hierarchy-test.js              36 PASS / 0 FAIL
partial-repayment-test.js      60 PASS / 0 FAIL
plan-editor-bounds-test.js     40 PASS / 0 FAIL
plan-ui-test.js                53 PASS / 0 FAIL
structure-fixes-test.js        53 PASS / 0 FAIL
```

### 升级后的一次性影响

**所有现存设备的指纹码会变一次**（序列化方式变了）。两台设备都升到本版本
之后重新比对即可，不代表数据不一致。

### 仍然明确不做的事

| 事项 | 理由 |
|---|---|
| 局域网 merge 更新已存在的 `splitBills` / `purchasePlans` | 需要冲突策略设计，`REFERENCE.md` 已记为已知限制 |
| 把 `payer` 过滤彻底删除 | 已由 `_normalize` 补齐保证正确；语义清理另开 |
| 把欠债金额改为存储值 | `PlanMath` 的重放模型是刻意设计，属架构级改动 |
| 把 25 个 `localStorage` 偏好纳入导出 | 属设备偏好而非账本数据；已订正文案 |
