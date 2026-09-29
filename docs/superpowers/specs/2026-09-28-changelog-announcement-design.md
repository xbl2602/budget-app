# 2026-09-28 — 版本公告（changelog announcement）

> **状态**：已实现。
>
> 涉及文件：
> - 新增：`src/js/29-changelog.js`、`src/css/17-changelog.css`、`tests/changelog-test.js`
> - 改动：`src/js/01-constants.js`（`APP_VERSION`）、`src/js/07-ui-core.js`（`ModalQueue`）、
>   `src/js/22-init.js`（两条挂载路径）、`src/js/18-render-settings.js`（入口 + 版本号）、
>   `src/js/24-diagnostics.js`（版本号）、`src/js/00-i18n.js` + `src/index.html`（`<title>` 修复）、
>   `src/js/21-month-rollover.js` 与 `src/js/27-purchase-plans.js`（接入队列，见下）
>
> **超出原批准范围的一处**：批准的是「只抽通用接口，公告先用，`28-cloud-sync.js` 不动」。
> 实现时发现公告会被**已上线的**两个弹窗吞掉（见「上线前发现的缺陷」），
> 因此把 `21-month-rollover.js` / `27-purchase-plans.js` 也接进了队列 —— 各 1 处包裹。
> `28-cloud-sync.js` 仍按原计划**未动**（它有自己的 `MutationObserver`，会自己让路）。

## Problem

用户换了新版应用却不知道变了什么。已有的 `README` 更新日志只有维护者自己会看，
应用内没有任何入口告知「这次更新了什么」。

## Decisions（已与用户确认）

1. **触发时机**：每次打开应用（或 PIN 解锁之后），若已读标记之上还有公告，弹一次。
2. **首次安装也弹**：全新用户第一次打开同样展示全部公告（等同于功能导览）。
3. **跳过多条**：默认停在**最新**那条，弹窗内容框**左右上侧**各有箭头翻看其余条目。
   箭头**始终渲染**，只有一条时也在（禁用状态），到两端自动置灰。
4. **提示语自适应**：待看条目同版本 →「你错过了 N 次更新 · vX」；版本不一致 →「你错过了多个版本！」
5. **手动入口**：设置页加「查看更新日志」，可回看**全部**历史，且**不写**已读标记。
6. **不升版本号也能发公告**（用户明确要求）：已读标记记的是**条目 `id`**，不是版本号。
   改 `APP_VERSION` 本身不触发任何公告。
7. **弹窗仲裁**：只抽出通用接口 `ModalQueue`，公告先用；不顺手把已上线的
   `28-cloud-sync.js` 改掉（避免把两件事搅在一起）。

## 关键设计：已读标记与版本号脱钩

最初的设想是「`lastSeenVersion < APP_VERSION` 就弹」。**这个方案在决定不升版本号后
立刻失效**，而且是永久失效：

```
今天    公告功能上线（并入 3.3.0）→ 标记已读 = '3.3.0'，APP_VERSION = '3.3.0'
两周后  在 3.3.0 里又加了个功能
        '3.3.0' > '3.3.0' 为假 → 不弹
        ...这个新功能永远不会有人看到
```

所以标记改为**条目 `id`**，`pending()` 就是「注册表里排在它上面的那几条」：

```
budgetAppLastSeenChangelog = '2026-10-05'      // 记 id，不记版本号

pending()  =  CHANGELOG.slice(0, indexOf(lastSeen))
  lastSeen 在第 0 位（最新）→ []        → 不弹
  lastSeek 在第 1 位        → [最新那条] → 弹一条
  找不到该 id（首装 / 条目被删 / 旧版回滚）→ 全部 → 全弹
```

`APP_VERSION` 从此**只负责显示**（设置页页脚、诊断报告、`<title>`），不承担逻辑职责。

`cmpVersion()` 因此**不在运行路径上**。它保留下来只为让测试能断言
「没有哪条公告声称了比 `APP_VERSION` 更高的版本」——否则很容易写出「3.4.0 的公告」
而版本号还没升。

## 弹窗队列（`ModalQueue`，`07-ui-core.js`）

`showModal()` 只往**一个** `#modalContent` 里塞内容，全仓库有 48 处调用它。启动那一刻
同时可能想弹的有：月初账单结转（`21-month-rollover.js`，延迟 500ms）、大额计划逾期
（`27-purchase-plans.js`，解锁后 800ms）、云同步冲突解决（`28-cloud-sync.js`）。
这**不是理论风险** —— commit `107d6e8` 就是修「云同步『大量删除』确认框被其它弹窗吞掉」。

`ModalQueue.request(priority, id, showFn)` 按优先级排队，**不抢占**已经显示的弹窗
（不把用户正看着的东西抽走）。实现沿用 `28-cloud-sync.js:1221` 已验证的
`MutationObserver` 手法：遮罩开着就监听它的 `class`，关了再显示。

```
优先级 1  云同步冲突 / 大量删除确认   （未来迁入，本次不动）
优先级 2  大额计划逾期
优先级 3  月初账单结转
优先级 9  版本公告            ← 永远让路
```

同一个 `id` 重复请求会**替换**而非叠加。

## 上线前发现的缺陷：公告会把自己吃掉

写完第一版后自查发现：公告**在真实启动路径下会被吞掉，且永远不再出现**。

`checkMonthRollover()` 在启动后 **500ms** 弹出月初结转提醒，而它直接调
`showModal()`（**不走队列**）—— 正好落在公告已经显示之后：

```
t=0     Changelog.checkAndShow() -> 队列放行 -> 公告弹出 -> 此时写入已读标记
t=500   showBillRolloverReminder() -> showModal() 直接覆盖 #modalContent
        公告消失，但已读标记已写 -> pending() 从此为空 -> 再也不会出现
```

用一次性探针复现确认（`t=200ms 有公告 / t=800ms 公告消失、已读标记=2026-10-05`）后修掉：

- `21-month-rollover.js`：`ModalQueue.request(3, 'month-rollover', …)` 包裹
- `27-purchase-plans.js`：`checkPlanEvents()` 的两个对话框 `ModalQueue.request(2, 'plan-events', …)`

两者都只是**包裹**，不改变任何判定逻辑：判定与标记原本就在 `showModal()` 之前完成
（`notifiedComplete` / `overdueAsked` 先落盘再弹窗），所以延后显示不会改变行为。

**并把它固化成 `L11` 回归测试**：把 `lastActiveMonth` 设成一年前、留一笔上月账单，
让结转提醒必然在 500ms 触发，然后断言 +900ms 时公告仍在屏、队列里压着一个待显示项。

同样的推理适用于 `28-cloud-sync.js`，但它**本来就有**自己的 `MutationObserver`
（`showAwaiting()`，`:1221`）会等别的弹窗关掉，所以不需要改 —— 保持原计划不动。

## 已读标记在「显示时」写，不在「关闭时」写

关闭弹窗发生在与 `ModalQueue` 让下一个弹窗上位**同一个 mutation 批次**里，所以
「关闭时写标记」会与它竞争、且静默失效。改为在 `showNow()` 里写。

代价：没读完就关掉标签页，也算已读。对更新公告来说这是合适的取舍——另一种选择是
丢掉标记。

## 顺带修掉的 bug

`src/index.html:7` 的 `<title data-i18n="app.name">记账软件 v3.3.0</title>` —— 标题里的
版本号**从来没显示过**。`applyI18nToDOM()` 会把 `<title>` 整个覆盖成 `__('app.name')`
（= "记账软件"）。现在去掉 `data-i18n`，由 `00-i18n.js` 用 `app.name` + `APP_VERSION` 拼
（`APP_VERSION` 在 `01-constants.js` 里定义，晚于 `00-i18n.js` 加载，所以在
`applyI18nToDOM()` 的**调用时刻**读取，不是在加载时刻）。

同时把散在 4 处的硬编码 `v3.3.0` 收敛到 `APP_VERSION`。

## Behavior

- 挂载点两条，**互斥**：`22-init.js` 的 `_bootstrap()` 无 PIN 分支、以及 `initApp()`（PIN 解锁后）。
  有 PIN 时绝不会在解锁前弹。
- 弹窗内容：标题 + `v版本 · 日期` + 条目列表（图标 + 文本，文本允许 `<strong>` / `<code>`，
  与 `25-page-guides.js` 的约定一致）；多条时底部有 `n / m` 计数。
- 设置页手动打开走 `open()`：列出**全部**公告，**不写**已读标记。
- `Changelog.register(entry)` 是通用注册口，按 `date` 降序自动插入位置。

## Acceptance（`tests/changelog-test.js`，56 条断言）

| # | 断言 |
|---|---|
| L1 | `cmpVersion` 数值比较：`3.10.0 > 3.9.0`、`3.4 == 3.4.0`、`3.4.1 > 3.4`、非法段按 0 |
| L2 | 无已读标记 → 全部展示、弹窗打开、提示条出现、计数器 `1 / 2`、显示时即标记最新条目 |
| L3 | 标记在最新条目 → 不弹；`pending()` 随标记纯函数式变化；未知标记 → 全弹 |
| L4 | 两条待看 → 提示条 + `1 / 2` + 默认停在最新 |
| L5 | `next()` / `prev()` 切换；两端箭头禁用；越界调用返回 `false` 且不改变视图 |
| L6 | 只有一条时箭头仍渲染但禁用；无提示条、无计数器 |
| L7 | **遮罩已开时不抢占**（`107d6e8` 回归网）；关闭后队列排空并显示 |
| L8 | 手动浏览不写已读标记，且列出全部条目 |
| L9 | `id` 唯一 / `date` 严格降序 / 无空 `items` / 无超前于 `APP_VERSION` 的条目 |
| L10 | 加载期 `APP_VERSION` 与 `Changelog` 均可用（验证 29 在 01 之后拼接）；`document.title` 带版本号 |
| L11 | **月初结转提醒不吞掉公告**（见上） |

**断言有效性已逐条验证**（`STRUCTURE.md` 的既有规矩：断言必须能真的失败）：

| 变异 | 结果 |
|---|---|
| 打乱注册表日期顺序 | L9 FAIL ✓ |
| 移除 `ModalQueue` 的**两处**防抢占守卫 | L7 FAIL ✓（单移除 `drain()` 那处不可达，被 `request()` 的早返回挡住） |
| `21-month-rollover.js` 退回直接 `showModal()` | L11 FAIL（2 条）✓ |

## Releasing

```
1. 在 CHANGELOG 头部插一条（新 id，填当前 APP_VERSION）
2. 补该文件底部的中英文 i18n
3. bash build.sh
4. node tests/changelog-test.js      ← 挡住 id 重复 / 日期乱序 / 空条目 / 版本号超前
5. 需要时才改 APP_VERSION + README 版本号（这一步不自动发公告）
```

第 4 步之前不算完成。
