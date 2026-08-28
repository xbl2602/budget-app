# 数据导出 / 导入 / 同步 完整性审计

> **审计日期**：2026-08-28
> **审计基线**：commit `fccd63f`（v3.2.0 之后的未发布状态）
> **审计范围**：`exportJSON` / `importJSON` / 局域网同步 / Excel / CSV / 指纹码 / 刷新机制 / 手机版
> **状态**：全部为**待修**，本次审计未改动任何源码

---

## 0. 结论先行

**问：各类数据导出功能能否正确地导出并合并全部数据？**

**答：不能。六条路径里只有一条是完好的。**

| 路径 | 能否完整还原 | 一句话 |
|------|------|------|
| `exportJSON` → `importJSON(replace)` | ✅ **完好** | 唯一可信的备份/恢复通道 |
| `exportJSON` → `importJSON(merge)` | ❌ | 记录**不去重**，重复导入消费翻倍；丢 `tagColors` |
| 局域网同步（replace） | ❌ **灾难性** | **消费记录 100% 被丢弃**，且本地已被清空 |
| 局域网同步（merge） | ❌ **灾难性** | 同上，消费记录全部丢弃 |
| Excel 导出 | ⚠️ | 数据齐全，但分摊子行**串列**；欠债数字是现算的、不可复现 |
| CSV 导出 | ⚠️ | 设计上只导记录，但连子分类、分期归属都没有 |
| 指纹码 | ❌ | 18 个字段里 **6 个是盲区**，包括决定金额口径的 `payer` |

**唯一安全的备份方式**：设置页「导出 JSON」，恢复时选「替换」。
**目前不可用**：局域网同步（会丢光记录）、JSON「合并」（会重复累加）。

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

## P0-01 局域网同步丢弃 100% 的消费记录

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

## P0-02 `importJSON` 合并模式不去重，重复导入消费翻倍

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

## P0-03 `payer` 字段缺失 → 全部分摊统计归零，欠债消失

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

## P0-04 「修复数据」静默删除记录

**严重度**：🔴 不可逆数据丢失，违反 RULES「永不删除用户数据」

**现象**
点一次设置页的「修复数据」，某些消费记录消失，无提示、无确认、无撤销。

**机理**
[`18-render-settings.js:607-612`](../src/js/18-render-settings.js)：

```js
const orphans = (DataStore._data.records || []).filter(r => r && r.planId && !planIds.has(r.planId));
if (orphans.length) {
  DataStore._data.records = (DataStore._data.records || []).filter(r => !r || !r.planId || planIds.has(r.planId));
  fixed += orphans.length;
}
```

只要记录带 `planId` 而对应的大额计划不在 `purchasePlans` 里，记录**直接删除**。

**触发条件**
- AI 批量导入（规范明说不生成 `purchasePlans`）后点「修复数据」
- 局域网 merge 只同步过记录、没同步过计划
- 用户删过计划但记录通过备份回来了

**复现**
```
repairData 前 records=1 合计=250
repairData 后 records=0 合计=0
```

**同一函数的第二个问题**：[`:604`](../src/js/18-render-settings.js) `if (p.mode !== 'credit' && p.categoryId) { p.categoryId = ''; }`
实测「先攒后买」计划的 `categoryId` 从 `"cat-root-1"` 被清成 `""`。

**修复方向**
孤儿记录应当**解除 `planId` 关联**而不是删除记录；若确实要删，必须弹确认框并列出条目。

---

## P0-05 `reload()` 不跑迁移 → 刷新之后 Excel 导出直接崩

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

## P0-06 撤销窗口内点刷新 → 记录永久丢失

**严重度**：🔴 不可逆

**机理**
`softDeleteRecord`（[`02-datastore.js:293`](../src/js/02-datastore.js)）是把记录**从数组里摘出来**、暂存在内存 `_pendingDelete`（**并不写 `_deleted` 标记**，见 P2-16）。而 [`15-render-records.js:850`](../src/js/15-render-records.js) 的 `refreshPageData()` 一上来就把它终结：

```js
const pending = DataStore.getPendingDelete();
if (pending) { DataStore._finalizeDelete(pending.id); }
```

`_pendingDelete` 只在内存里，`localStorage['budgetPendingDeletes']` 只存了 id 和过期时间、**不存记录本身**，所以刷新页面同样会丢。

**复现**
```
软删除后  records=0  可撤销=true
点刷新后  可撤销=false  undoDelete()=false  records=0
```

**修复方向**
`_savePendingDelete()` 一并持久化 record 本体；`refreshPageData` 改为**保留**而不是终结待删项。

---

## P0-07 `Object.assign` 目标写成 `|| {}`，静默丢弃导入数据

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

## P0-08 手机版仍是 v1 schema，replace 导入抹掉 15 个键

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

## P1-09 收入缺失 → 欠款凭空清零

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

## P1-10 credit 模式一分没扣也显示已还清

**严重度**：🟠

**机理**
[`04-stats-engine.js:617-622`](../src/js/04-stats-engine.js) 无条件按期数记账，完全不看有没有对应的真实记录：

```js
if (p.mode === 'credit') {
  due = Math.min(p.totalAmount / p.months, st.remaining);
  actual = due;                    // ← 不校验 planId 记录是否存在
}
```

`syncPlanRecords()`（[`27-purchase-plans.js:174`](../src/js/27-purchase-plans.js)）确实会生成记录，但用户在流水页手动删掉之后，`PlanMath` 依旧认为已还。

**复现**
```
credit 计划，0 条实际扣款记录：已还=900  剩余=0  完成=true
```

**修复方向**
credit 模式的 `actual` 应当来自真实记录（`records.filter(r => r.planId === p.id && r.planMonth === m)` 求和），而不是理论月供。

---

## P1-11 归档账单的欠款死锁

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

## P1-12 Excel 分摊子行串列

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

## P1-13 指纹码 6 个盲区

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

## P1-14 `allTags` / `tagColors` 过不了局域网同步

**严重度**：🟠 附带一个误导性症状

**机理**
[`23-lan-sync.js:206-238`](../src/js/23-lan-sync.js) replace 模式先 `DataStore._data = DataStore._defaults()`，再按白名单逐项拷贝 —— `allTags` / `tagColors` / `colorIndex` / `lastActiveMonth` 都不在白名单里。
`mergeIntoDataStore`（[`:265`](../src/js/23-lan-sync.js)）同样没有这两个键。
`importJSON` 的 merge 分支处理了 `allTags`，但漏了 `tagColors`。

**误导性症状**：`allTags` **在**指纹白名单里。所以同步「成功」之后，两台设备的指纹反而对不上 —— 用户会以为同步失败，重同步，然后触发 P0-01 把记录清光。

---

# P2 — 健壮性 / 文档

## P2-15 `SplitEngine` 缺 typeof 守卫

[`03-excel-export.js:493`](../src/js/03-excel-export.js) 直接 `SplitEngine.partPaid(p)`，而同一文件 [`:549`](../src/js/03-excel-export.js) 对 `PlanMath` 是有 `typeof` 守卫的。`build.sh` 逐文件包 `try/catch`，`26-split-bills.js` 一旦抛错 `SplitEngine` 就是 undefined，Excel 导出整体静默失效。

## P2-16 `_deleted` 是死代码，文档写反了

[`docs/ai/REFERENCE.md:225`](ai/REFERENCE.md) 写「软删除（设 `_deleted` 标记）」，并称数据层有 `softDeleteRecord()`／`undoDelete()`／`_finalizeDelete()` 三件套。

实际：**全项目没有任何一处写入 `_deleted`**。`softDeleteRecord` 是把记录移出数组、暂存 `_pendingDelete`。三处读 `_deleted` 的代码（`04-stats-engine.js:433`、`17-stats-charts.js:2237`、指纹白名单）是残留。

导出不受影响，但文档会误导后续改动。

## P2-17 锁定状态下导出会产出空备份

`lockData()`（[`02-datastore.js:978`](../src/js/02-datastore.js)）把 `_data` 设为 `null`，此后 `exportJSON()` 返回字符串 `"null"` —— 一个文件名正常、内容为空的「备份」。目前被 PIN 模态框挡着，属于加固项。

## P2-18 CSV 覆盖面过窄

表头：`ID,金额,分类,日期,备注,创建时间,不计日均,标签,分摊`

实测缺失：子分类、参与人姓名、参与人已还金额、所属大额计划。
分摊列只写「自份额」，且用了原始 `selfShare` 未做 `toFixed(2)`（Excel 那边是 `100.00`，CSV 是 `100`）。

CSV 定位为「只导流水」可以接受，但**子分类**和**分期归属**属于流水自身的属性，不应缺席。

## P2-19 「导出 JSON = 完整备份」的说法不准确

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

## 建议的修复顺序

1. **P0-01**（局域网丢记录）—— 唯一会当场毁数据的，且用户以为同步成功了
2. **P0-07 → P0-03 → P1-13** —— 三者互相放大：`P0-07` 丢收入触发 `P1-09` 欠债清零；`P0-03` 让金额口径出错；`P1-13` 让指纹**察觉不到**前两者
3. **P0-02、P0-04、P0-06** —— 数据丢失/重复，各自独立，改动都很小
4. **P0-05** —— 抽 `_normalize()`，顺带解决一批「缺键就崩」的隐患
5. **P0-08** —— 需要先定手机版的产品定位
6. **P1-09 / P1-10 / P1-11** —— 产品语义决策，需要先确认预期行为再改

修每一条之前先补一个会失败的测试；`tests/export-integrity-audit.js` 里的对应小节可以直接改成断言式。
