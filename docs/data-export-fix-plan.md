# 数据导出 / 导入 / 同步 —— 修复计划

> **配套文档**：[`data-export-integrity-audit.md`](data-export-integrity-audit.md)（问题清单与复现）
> **基线**：commit `fccd63f`
> **原则**：19 个问题不做 19 个补丁。先把它们收敛到 **6 个根因**，改根因；剩下的才是独立小修。

---

## 1. 根因收敛

审计报告里的 19 条，按「为什么会发生」重新聚类：

| 根因 | 覆盖的问题 | 一句话 |
|---|---|---|
| **A. schema 规范化没有单一入口** | P0-03 P0-05 P0-07 P0-08 | 补齐/清洗/迁移逻辑只长在 `init()` 里，`reload()`、`importJSON`、局域网同步各自绕过 |
| **B. 两条 merge 各写各的** | P0-02 P1-14 | `importJSON` 与 `mergeIntoDataStore` 是两份独立实现，语义不一致 |
| **C. 手工维护的字段白名单** | P1-13 P1-14 | 指纹与 LAN replace 都靠人肉列字段，新增字段必然掉队 |
| **D. 日期格式假设错误** | P0-01 | 校验器只认 `YYYY-MM-DD`，App 写的是 datetime-local 与 ISO |
| **E. 推导值当存储值用** | P1-09 P1-10 | 欠债金额是现算的，缺输入时静默假设「已还清」 |
| **F. 删数据的地方没有守卫** | P0-04 P0-06 | 孤儿记录直接删、待删项被刷新终结 |

独立小修（无共同根因）：P1-11 P1-12 P2-15 P2-16 P2-17 P2-18 P2-19

**收敛效果**：6 处结构性改动 + 7 处局部改动，覆盖全部 19 个问题。

---

## 2. 逐根因方案

### 根因 A —— 抽出 `_normalize(data)` 单一入口

**现状**：[`02-datastore.js:76-160`](../src/js/02-datastore.js) 的 `init()` 内联了三类逻辑：
补齐缺失键（12 个 `if (!this._data.X)`）、清洗非法条目（splitBills / purchasePlans）、历史迁移（`__split__` → 真实分类、`budgets` → `monthlyIncome`）。

`reload()`、`importJSON('replace')`、LAN sync 的 replace 分支都**不跑**这段。

**方案**：原地抽成 `_normalize(data)` 纯函数（接收并返回 data，不碰 `this._data`），四个入口共用。

```
_normalize(data)
  ├── 补齐 _defaults() 里所有缺失的键
  ├── 清洗 splitBills / purchasePlans / contacts（沿用现有规则）
  ├── 补 payer = 'self'                    ← 新增，治 P0-03
  ├── _migrateSplitRecordCategories(data)
  └── budgets → monthlyIncome 迁移
```

调用点：`init()` / `reload()` / `importJSON()`（replace 与 merge 都跑）/ LAN `receiveAndMerge()`。

**顺带解决 P0-07**：键必然存在之后，`Object.assign(this._data.X || {}, ...)` 的 `|| {}` 就是多余的，直接去掉即可——不是「改成 if 判断」这种补丁，是让那个防御失去存在理由。

**为什么补 `payer='self'` 是斩草除根而非打补丁**：这个字段全项目只有一个取值 `'self'`（[`14-render-add.js:158`](../src/js/14-render-add.js) 是唯一写入点），5 处消费点却都在过滤它。真正的根除是删掉这 5 处过滤，但那会改动统计口径、影响面比补字段大得多。折中：`_normalize` 补齐字段（保证数据正确），同时在 `RULES.md` 记录「`payer` 目前恒为 `'self'`，将来若真要支持『别人垫付』再启用过滤」。

**影响面**：🔴 高 —— 所有数据入口。
**风险**：`_normalize` 若有 bug 则全盘受影响。
**缓解**：只做「补齐缺失」和「剔除非法」，**绝不修改已存在的合法值**；用现有 8 套件 + 审计脚本双向验证；先跑 `路径1` 确认 17 键无损没有回归。

---

### 根因 B —— 合并逻辑收敛为一份实现

**现状**：
- [`02-datastore.js:684`](../src/js/02-datastore.js)：`records = [...data.records, ...this._data.records]` — 不去重
- [`23-lan-sync.js:265`](../src/js/23-lan-sync.js) `mergeIntoDataStore`：按 `id` 去重并更新 — 但漏 `allTags` / `tagColors` / `colorIndex`

**方案**：在 DataStore 上实现唯一的 `_mergeData(incoming)`，语义取两者的并集：

| 数据类型 | 合并规则 |
|---|---|
| `records` | 按 `id`；已存在则比 `updatedAt`，新的胜出 |
| `categories` / `contacts` / `billCategories` | 按 `id`，只新增（沿用现状） |
| `splitBills` / `purchasePlans` | 按 `id`，只新增（沿用现状，已知限制不在本次范围） |
| `budgets` / `categoryBudgets` / `monthlyIncome` / `billAmounts` / `tagColors` | `Object.assign` 覆盖 |
| `allTags` | 并集后排序 |
| `savingsTarget` / `whatIfParams` / `percentBase` | 有值则覆盖 |
| `colorIndex` | 取较大值（避免配色重复） |

`importJSON('merge')` 与 `mergeIntoDataStore()` 都改为调用它。

**影响面**：🟡 中 —— 两条导入路径。
**风险**：records 改为「按 id 覆盖」后，merge 不再是纯新增。
**缓解**：`updatedAt` 比较时缺失值视为最旧，保证「本地有、对方没有的字段」不被抹掉。

---

### 根因 C —— 白名单改为排除名单

**指纹**（[`02-datastore.js:812`](../src/js/02-datastore.js)）：手工列字段 → 改为对 `_data` 全量稳定序列化，只排除瞬时字段（`_rev`、`__log`）。新增字段自动纳入，不会再有盲区。

需要**键排序**后再序列化，否则 `Object.assign` 造成的键顺序差异会产生假阳性。

**LAN replace**（[`23-lan-sync.js:206-238`](../src/js/23-lan-sync.js)）：`_defaults()` + 逐项白名单赋值 → 改为 `sanitize(data)` 后交给 `_normalize` 全量接管。

**影响面**：🟡 中。
**已知副作用**：**所有现存设备的指纹值会变一次**。这是一次性的，两台设备都升级后即可重新比对。需要在 UI 提示里说明。

---

### 根因 D —— 日期校验放宽到「前缀 + 可选时间」

**现状**（[`23-lan-sync.js:51`](../src/js/23-lan-sync.js)）：`/^\d{4}-\d{2}-\d{2}$/` —— 拒绝一切真实数据。

**方案**：拆成两个校验器，都要求真实可解析：

```js
dateLike:  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
```

`date` 与 `createdAt` 都用它。

**同时修掉「静默丢弃」这个更深的毛病**：`validateSyncData` 现在只 `console.warn`。改为返回被丢弃的条数，`receiveAndMerge` 在两种情况下**拒绝执行**而不是继续：
1. 过滤后 `records` 为空但源数据非空 → 判定为格式不兼容，中止并报错
2. 丢弃条数 > 0 → 弹出确认，明确告知「有 N 条记录格式不符将被跳过」

**影响面**：🔴 高 —— 局域网同步主路径。
**风险**：放太松会让脏数据进来。
**缓解**：正则仍然强制 `YYYY-MM-DD` 开头；额外用 `!isNaN(new Date(v))` 兜底。

---

### 根因 E —— 推导值必须自报可信度

这是**产品语义**问题，不能靠改代码「修对」，只能让它**不再撒谎**。

**P1-09（收入缺失→欠债清零）**：
`byMonth[m]` 已经有 `incomeKnown` 字段，但没有任何消费点使用它。
方案：`_finalize()` 增加汇总字段 `estimatedMonths`（推定月份数）与 `hasEstimates`。Excel 逐月子行加一列「数据来源」，值为 `实测` / `推定`；计划卡片在有推定月份时显示提示。**不改变计算逻辑**——保持「假设按时还款」的乐观推定，但让它可见。

**P1-10（credit 模式不看真实记录）**：
这个可以真正修好。credit 模式的 `actual` 改为取真实记录之和：
```js
actual = records.filter(r => r.planId === p.id && r.planMonth === m).reduce(...)
```
`syncPlanRecords()` 本来就会生成这些记录，取数天然一致；用户手动删掉记录后，欠款如实回升。

**影响面**：🟠 中 —— 影响计划中心、总览卡片、Excel sheet 7、可支配预算。
**风险**：P1-10 改动会让现有 credit 计划的进度数字变化（变得正确）。
**缓解**：`getSpendablePlan` 已排除 credit 模式的虚拟月供，不会双重扣减；用 `export-coverage-test.js` 的 E7 断言护住。

---

### 根因 F —— 删数据前必须有出口

**P0-04**（[`18-render-settings.js:607`](../src/js/18-render-settings.js)）：孤儿记录改为**解除 `planId` 关联**而非删除记录。记录本身是用户真金白银花出去的，计划没了不代表消费没发生。
同时移除 [`:604`](../src/js/18-render-settings.js) 那句清空非 credit 计划 `categoryId` 的逻辑——它没有正当理由。

**P0-06**（[`02-datastore.js:263`](../src/js/02-datastore.js) + [`15-render-records.js:850`](../src/js/15-render-records.js)）：
`_savePendingDelete()` 一并持久化 record 本体与 scope；`refreshPageData()` 改为**保留**待删项而非终结。

**影响面**：🟢 低 —— 两处局部。

---

## 3. 独立小修

| 编号 | 改法 | 影响面 |
|---|---|---|
| P1-11 归档欠款死锁 | 三个分摊统计函数跳过 `b.archived` 的账单；归档即视为了结 | 🟠 改变待收总额口径 |
| P1-12 Excel 串列 | 两处 `<Cell>` 加 `ss:Index="4"` / `ss:Index="8"` | 🟢 |
| P2-15 typeof 守卫 | `SplitEngine` 比照 `PlanMath` 加守卫 | 🟢 |
| P2-16 `_deleted` 死代码 | 删掉 3 处残留读取；订正 `REFERENCE.md` 规则 #10 | 🟢 |
| P2-17 锁定后导出空备份 | `exportJSON()` 在 `_data` 为 null 时抛出/返回 null，调用方给提示 | 🟢 |
| P2-18 CSV 覆盖窄 | 补「子分类」「所属计划」两列；分摊金额补 `toFixed(2)` | 🟢 |
| P2-19 文案不准确 | 订正 `25-page-guides.js` 的「完整备份」措辞 | 🟢 |

---

## 4. 实施批次

每批 = 改动 → `bash build.sh` → 跑全部测试 → 跑审计脚本 → commit。

| 批次 | 内容 | 覆盖 |
|---|---|---|
| **1** | `_normalize()` 单一入口 | 根因 A：P0-03 P0-05 P0-07 |
| **2** | 局域网日期校验 + 拒绝静默丢弃 | 根因 D：P0-01 |
| **3** | `_mergeData()` 合并收敛 + LAN replace 走 normalize | 根因 B/C：P0-02 P1-14 |
| **4** | 指纹改全量序列化 | 根因 C：P1-13 |
| **5** | 删除守卫：孤儿记录、待删持久化 | 根因 F：P0-04 P0-06 |
| **6** | credit 取真实记录 + 推定月份可见 | 根因 E：P1-09 P1-10 |
| **7** | 手机版 schema 保留未知键 | P0-08 |
| **8** | 独立小修合集 | P1-11 P1-12 P2-15..19 |

批次 1 必须最先——后续批次都依赖 `_normalize` 存在。

---

## 5. 验收标准

**通用（每批必须满足）**
- G1 现有 8 个测试套件保持 383 PASS / 1 FAIL 或更好（那 1 个已知是测试自身的轮询缺陷，见批次 8）
- G2 `node tests/export-integrity-audit.js` 的**路径1**永远保持「✅ 全部字段无损」
- G3 `bash build.sh` 后 `index.html` 可正常加载，无新增控制台异常
- G4 无源码文件绕过 IIFE / 新增外部依赖 / 破坏 CSP

**逐问题验收**

| 问题 | 验收标准 |
|---|---|
| **P0-01** | ① 审计 G 节 5 种日期格式**全部 ✅ 通过**；② 路径3/路径4 的 `records` 不再丢失；③ 构造一条 `date` 非法的记录，同步时**弹出提示**而非静默跳过；④ 源数据非空但过滤后为空时**中止同步**，本地数据不被清空 |
| **P0-02** | ① 审计 B 节 `2 → 2 → 2`；② 同一份 JSON merge 三次后月度合计不变；③ merge 一份 `updatedAt` 更新的同 id 记录，本地被更新而非新增 |
| **P0-03** | ① 不带 `payer` 的账单导入后，`getSplitUnpaid` / `getSplitContrib` / `getSplitOthers` 与带 `payer` 的**完全一致**；② `reload()` 后同样成立 |
| **P0-04** | ① 带 `planId` 但计划不存在的记录，`repairData()` 后**记录仍在**且 `planId` 已清空；② 月度合计不变；③ 非 credit 计划的 `categoryId` 不被清空 |
| **P0-05** | ① 喂一份缺 8 个键的 localStorage，`reload()` 后 17 键齐全；② `reload()` 后 `exportToExcel()` 不抛错；③ `reload()` 后 `__split__` 记录已迁移 |
| **P0-06** | ① 软删除后 `refreshPageData()`，`undoDelete()` 仍能恢复；② 软删除后重新 `init()`（模拟刷新页面），记录仍可恢复 |
| **P0-07** | ① 空库 replace 一份最小 JSON 后再 merge 一份带 `monthlyIncome` 的，收入**被保留**；`categoryBudgets` / `billAmounts` 同理 |
| **P0-08** | ① 手机版 `importJSON('replace')` 后，15 个未知键**全部保留**；② `clearAll()` 后同样保留；③ 手机版默认 `savingsTarget.type` 为 `'fixed'` |
| **P0-09** | （见 P1-09） |
| **P1-09** | ① `PlanMath` 状态暴露 `hasEstimates` / `estimatedMonths`；② Excel 逐月子行含「实测/推定」列；③ 计算结果本身**不变**（保持乐观推定），由 E7 断言护住 |
| **P1-10** | ① credit 计划 0 条实际记录时 `paid=0` `remaining=totalAmount`；② 有 3 条记录时 `paid` 等于三条之和；③ `getSpendablePlan` 的 `planDueVirtual` 对 credit 仍为 0（不双重扣减） |
| **P1-11** | ① 归档账单不再计入 `getSplitUnpaid`；② 未归档行为不变 |
| **P1-12** | ① 审计 D 节三条子行**全部 ✅**；② 参与人份额落在「他人待收」列、状态落在「状态」列 |
| **P1-13** | ① 审计 F 节 18 项**全部 ✅ 察觉**（`colorIndex` 可豁免）；② 同一份数据两次 `getDataHash()` 结果稳定；③ 键顺序不同但内容相同的两份数据，指纹**相同** |
| **P1-14** | ① 路径3/路径4 的 `allTags` / `tagColors` / `colorIndex` / `lastActiveMonth` 不再丢失 |
| **P2-15** | ① `SplitEngine` 为 undefined 时 `exportToExcel()` 不抛错，分摊 sheet 优雅降级 |
| **P2-16** | ① 全项目 `_deleted` 引用为 0；② `REFERENCE.md` 规则 #10 与实现一致 |
| **P2-17** | ① `lockData()` 后调 `exportJSON()` 不产出 `"null"` 文件，给出明确提示 |
| **P2-18** | ① CSV 含「子分类」「所属计划」列；② 分摊自份额格式为 `100.00` |
| **P2-19** | ① 引导文案不再声称包含「设置」，或明确列出不包含的项 |

**最终验收（全部批次完成后）**
- F1 审计脚本 A 节**四条路径全部「✅ 全部字段无损」**
- F2 审计脚本 B / D / F / G / H 五节**无 ❌**
- F3 现有 8 套件全绿（含修掉批次 8 的那个轮询缺陷）
- F4 审计文档中每条问题标注为「已修复 + 对应 commit」

---

## 6. 明确不做的事

| 事项 | 理由 |
|---|---|
| 局域网 merge 更新已存在的 `splitBills` / `purchasePlans` | 需要冲突策略设计，`REFERENCE.md` 已记为已知限制，超出本次范围 |
| 把 `payer` 过滤彻底删除 | 会改动统计口径；先补齐字段保证正确，语义清理另开 |
| 把欠债金额改为存储值 | 架构级改动，`PlanMath` 的重放模型是刻意设计 |
| 把 25 个 `localStorage` 偏好纳入导出 | 属于设备偏好而非账本数据；只订正文案 |
| 版本号递增 | 发版是产品决定，留给人 |
