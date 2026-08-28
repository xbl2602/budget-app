# 记账软件 · Budget App v3.2.0

> Personal Budget Tracker — Zero-dependency single-page HTML app. Fully offline, runs entirely in your browser.

![Language](https://img.shields.io/badge/language-Chinese-red) ![Dependencies](https://img.shields.io/badge/dependencies-none-brightgreen) ![Platform](https://img.shields.io/badge/platform-browser-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📸 Screenshots

> Screenshots coming soon. Open `index.html` in your browser to see the app in action.

---

## 📖 Brief Description

**记账软件 · Budget App** is a personal budget tracking tool designed for everyday use. It stores all your records, categories, budgets, and savings targets entirely in your browser's localStorage — no server, no sign-up, no data leaving your machine. Packaged as a single offline HTML file with zero external dependencies, it is ready to run the moment you open it in a modern browser.

---

## 🤖 AI 生成声明

本项目的全部代码（HTML / CSS / JavaScript）均由 **AI Agent（大型语言模型）生成、审查、修改和完善**。

**作者（即仓库所有者）的角色仅限于：**
- 整体功能设计与规划
- 功能验证与测试
- UI 与交互审美的反馈和决策
- 项目方向把控

作者不具备专业软件开发背景，本项目为**个人学习和日常使用目的**而创建。公开此项目的目的是分享设计思路和展示 AI 辅助开发的可行性，而非提供专业级软件解决方案。

---

## ⚠️ 免责声明

> **请在使用本软件前仔细阅读以下条款。使用即表示您理解并同意以下内容。**

### 1. AI 生成代码风险
本软件的全部代码由 AI Agent 自动生成，**未经传统人工安全审计和专业代码审查**。可能存在但不限于以下问题：
- 未知的软件缺陷或逻辑错误
- 安全漏洞或数据泄露风险
- 边界情况（edge case）未覆盖
- 代码风格不一致或潜在的性能问题

请在使用前**自行评估风险**，尤其涉及重要数据时须谨慎。

### 2. 计算准确性不担保
本软件中的所有数学计算（包括但不限于预算汇总、储蓄预测、预算使用率、统计图表数据、月度报告等）**均不保证绝对真实性和准确性**。所有数据仅供个人参考，不应作为任何财务决策的唯一依据。

### 3. 非财务建议
本软件**不构成任何形式的财务、税务或投资建议**。如有专业财务管理需求，请咨询持牌财务顾问、会计师或相关专业人士。

### 4. 不合规声明
本项目**不符合任何财务 / 会计行业合规标准、审计标准或监管要求**。不适用于需要合规认证的业务场景。

### 5. 数据存储安全
- 所有数据以**明文形式**存储在浏览器 `localStorage` 中，**不提供加密保护**
- 虽然设计上以本地存储为框架且经过了 AI Agent 的代码审查，但因代码由 AI 生成，**仍不保证数据绝对不外泄**
- **请勿在本软件中保存任何关键、敏感或涉密信息**

### 6. 数据丢失风险
- 清除浏览器缓存、Cookie、站点数据或历史记录将**永久删除所有记录与设置**，且**无法恢复**
- 数据**仅存在于单一设备**上，**不支持跨设备同步**
- **用户须自行定期通过「设置」页面的 JSON 导出功能备份数据**

### 7. 无担保
本软件按「**原样**」（AS IS）提供，作者**不作任何明示或默示的担保**，包括但不限于适销性、特定用途适用性和不侵权的担保。

### 8. 责任限制
在**任何情况下**，作者均不对因使用或无法使用本软件而产生的**任何数据丢失或财务损失**承担责任，即使已被告知此类损失的可能性。

### 9. 使用者责任
- 使用者应**自行评估风险**
- 使用者对自身的**数据安全和财务决策负全部责任**
- 使用者应**自行验证所有计算结果**

---

## ✨ Features

### 📊 总览 Overview
Monthly spending summary with budget and savings progress rings rendered on Canvas. Includes a 7-day spending sparkline, top 5 spending categories, overspend warnings, and a savings prediction engine that supports dual daily limit calculations.

### ✏️ 记账 Add Record
Quick expense entry with automatic RM currency prefix, a tree-based category picker (emoji + color), date/time fields, and notes. Input validation with shake animation feedback.

### 📋 流水 Records
Advanced multi-filter system supporting keyword, category, date range, amount range, and overspent-only filters. Multi-level sorting (by date, amount, note, or category name). Toggle between compact and card views. Batch operations for delete and recategorization. Soft delete with a 5-second undo window.

### 🗂️ 分类 Categories
Infinite nesting tree with accordion UI. Set per-category budgets in RM or percentage. Inline budget editing with parent-child budget validation. Merge categories, move nodes with cycle detection, pick from 14 preset colors, and choose emoji icons.

### 📈 统计 Statistics
Interactive Canvas charts — elastic animated pie chart with hover pop-out and full drill-down (switchable to a **waffle grid** where one block = a fixed amount, or a **nested treemap** where area = spend and boxes nest to show the category hierarchy), animated line chart, bar chart with drill-down, and a calendar heatmap with 6-color gradient. Month-over-month comparison, 6-month trends, and a dedicated savings chart. All charts downloadable as PNG. Custom date range analysis included.

### 📄 月度报告 Report
Print-optimized monthly summary featuring budget and savings rings, a category breakdown table, a spending sparkline, and natural language savings prediction.

### 🔮 假设分析 What-If
Adjust future spending assumptions per category with modes: keep trend, set daily limit, fix remaining total, percentage change, adjust by amount, or zero out. Compare projections against current trends with visual savings bars and ring charts. Supports hypothetical new categories and global adjustments.

### 🧾 分摊收款 Split Bills
Mark a record as a split bill, pick who was in on it, and let the total divide evenly or by amounts you set per person — including "amount unknown" for anyone whose share isn't settled yet, yourself included. The Collection Center tracks who still owes what, by person or by bill. Repayments are **amounts, not checkboxes**: tick for a full settle, or record a partial. One lump sum can clear several bills at once — select bills (all / none / invert) and spread the money **evenly**, **oldest-first**, or **by hand**, with a live preview before anything is written. Settled bills can be archived or converted into a plain record.

### 💳 大额分期计划 Purchase Plans
Plan a large purchase in three modes: save up first (先攒后买), buy now and repay (先买后还), or a credit-card instalment (信用卡分期, which backfills real repayment records). The monthly instalment is deducted from your spendable budget, and the ledger is **replayed month by month** rather than stored — so skipping a month or editing an old record recalculates automatically. Overdue plans prompt to extend, pay off, or abandon. Custom emoji icon per plan.

### ⚙️ 设置 Settings
Dark/light mode toggle, monthly budget configuration, 2-mode savings target (fixed amount or percentage). Export and import data via JSON (replace or merge), CSV, or Excel (XML Spreadsheet 2003 with 7 sheets and live formulas). Clear all data option available. LAN sync via WebRTC (same Wi-Fi, zero server).

### 📱 手机版 Mobile Companion
轻量级手机专用版本 `money-wise-mobile.html`，支持完整的记账增删改查、分类管理、JSON 导入导出。
适合在手机上快速记录，导出 JSON 后在主应用导入。单 HTML 文件，零依赖。

### v3.2.0 新增功能

- **🧾 分摊收款系统**：分摊账单编辑器补齐日期时间 / 备注 / 总额 / 分类 / 标签等全部流水字段；分摊方式（平均 / 自定义）与「金额不明」标记均落盘，重开保持原样，自己的份额也可标记为金额不明。
- **💰 部分还款**：参与人记「应还 / 已还」金额而非单一勾选框。单笔可直接设定已还金额（含撤销），一次收到的钱也可冲抵多笔账单——支持全选 / 全不选 / 反选，按**平均分配 / 按日期先后 / 手动指定**三种方式分摊，整数分运算不丢厘，且任何分配都不会让人还超应还额。
- **💳 大额分期消费计划**：三模式（先攒后买 / 先买后还 / 信用卡分期），月供自动占用可支配预算，台账逐月重放推导，逾期可延期 / 补齐 / 放弃。起始月改用年 + 月下拉选择（不再是 `<input type="month">`），带「本月 / 下月」快捷键与起止区间提示，金额 / 期数 / 月份均有边界校验。
- **🎨 分类图标与颜色**：新建子分类自动继承父级颜色；编辑分类图标时可直接输入任意 Emoji，不再局限于预设网格。
- **▦ 分类格子图**：把金额画成方块阵（一格 = 固定金额），比饼图更容易比较相近的占比。分类支出卡片现为「🥧 饼图 / ▦ 格子图 / ▤ 矩形图」三选一，三者共用同一份数据，下钻、层级（1 层 / 2 层 / 全部）、排除账单开关、配色全部通用，展开弹窗同样支持切换。
- **📈 统计页可读性**：分类明细表默认收起（可折叠并记忆状态）；饼图深层展开时标签不再重叠、不越过图例栏，图例按画布高度封顶；热力图格子间距恢复均匀。

### 未发布（v3.2.0 之后）

> 以下改动已在当前构建中，但版本号仍停在 v3.2.0——下次发版时并入。

- **▤ 分类矩形图（treemap）**：面积正比于金额，子分类的框**嵌套**在父分类框里——一眼看出「餐饮花得多」是被哪个子分类拉高的。层级控件直接决定嵌套几层，点框下钻。分类卡片的第三种视图。
- **📅 自定义日期范围修复**：统计页选日期范围一直没生效——`useCustomRange()` 以「月份为空」作标记，而 `renderStats()` 开头会无条件把月份填回去，标记当场被冲掉。现已修复，范围内的统计、图表、明细表口径一致。
- **🔍 展开视图**：弹窗放大到 `min(96vw, 1500px)` / 94vh，图表高度跟随视口（矩形图更高）；修掉三处问题——多张图叠着显示（CSS 的 id 级 `!important` 压过内联样式）、明细表下钻失效（只重画了隐藏的画布）、以及 canvas 内部分辨率与显示尺寸不符导致的整体模糊。
- **🧮 合计口径说明**：分类明细表底部新增「减：已收回分摊」「实际支出」两行。分类金额按账单**全额**计入其真实分类，而统计页顶部与总览是**扣除他人还款后**的净额，两者天然不等；现在差额直接列出来，不必再怀疑哪个算错了。
- **▦ 格子图排列**：改为行优先——最大的分类在最上面、最小的在最下面（原先是列优先，大的在左边）。
- **🔐 数据导出 / 导入 / 同步完整性修复（19 项）**：一次系统性审计后的全面修复，详见 [审计报告](docs/data-export-integrity-audit.md) 与 [修复计划](docs/data-export-fix-plan.md)。要点：
  - **局域网同步过去会丢光全部消费记录** —— 校验器只认 `YYYY-MM-DD`，而 App 存的是 `2026-08-01T19:30` 与 ISO 时间戳，每一条记录都被静默滤掉；replace 模式还会先清空本机。现已修复，并新增「全部被拒则中止同步、绝不清库」的安全网。
  - **JSON「合并」导入会重复累加** —— 同一份备份导两次消费翻倍。合并逻辑收敛为唯一实现，按 id 去重、`updatedAt` 新者胜。
  - **指纹码有 6 个盲区** —— 分类图标/颜色、`selfUnknown`、`payer`（决定分摊金额口径）等改动指纹察觉不到。改为全量稳定序列化 + 排除名单，新增字段自动纳入，且与键序、数组顺序无关。
  - **「修复数据」会静默删除记录** —— 带 `planId` 但计划已不存在的记录被直接删掉。改为解除关联，记录留下。
  - **撤销窗口内点刷新会永久丢失记录** —— 待删缓冲现已持久化，跨刷新、跨重载都能撤销。
  - **手机版会抹掉主应用的分摊账单与大额计划** —— 它用的还是 v1 的 6 键结构却共享同一份存储。现在对不认识的键保持中立。
  - **没登记收入的月份，欠款会凭空归零** —— 系统把「不知道收入」按「这个月照计划还了」处理（实测：欠 1050 → 收入记录一丢就变成已还清）。这个乐观推定保留了（否则不记收入的用户会看到计划永远停滞），但 Excel 现在逐月标出「实测 / 推定」，状态栏写明「N 个月无收入记录，按计划推定」——不再把猜的当实测。
  - 另有：归档账单的欠款不再永久挂账、Excel 分摊子行串列、CSV 补「子分类 / 所属计划」两列等。

### v2.7.0 新增功能

- **📊 统计范围切换**：设置页新增「本月」/「近30天」切换开关，总览/统计/报告/流水/假设分析全页面联动。预算/储蓄环图保持月口径。
- **🔐 PIN锁 + AES-GCM 加密**：设置页启用PIN码后，数据使用 Web Crypto API (PBKDF2 + AES-GCM) 加密存储。启动需验证PIN，支持自定义自动锁定时间（1/5/15/30分钟/从不）。
- **🏷️ 标签系统**：记录支持多标签（场景标记，与分类互补不重叠）。添加记录时可选择标签，流水页可按标签筛选，统计页新增 Waffle Chart 方格图可视化标签分布。
- **🔲 Waffle Chart 标签分布图**：统计页底部展示标签花费占比的方格矩阵，5档密度可调（24~600格），Scale Pop 入场动画，悬停高亮+动效，点击跳转流水页筛选，独立时间段选择，标签颜色自定义，导出PNG。

---

### 🔥 Highlights

- **Zero external dependencies** — Pure HTML, CSS, and JavaScript. No CDN, no frameworks, no libraries.
- **Modular source structure** — 15 CSS + 27 JS files organized by domain in `src/`, built into a single deployable HTML via `build.sh`.
- **IIFE scope isolation** — 27 JS files each wrapped in an IIFE, only explicitly exported symbols (`window.*`) are shared across files, preventing global namespace pollution.
- **Elastic animated pie chart** — Smooth hover pop-out effects and full drill-down navigation.
- **Calendar heatmap** — Spending ratio visualized with a 6-color gradient across the month.
- **Soft delete with 5-second undo** — Accidentally deleted a record? Undo it within 5 seconds.
- **Native Excel export** — Generates real XML SpreadsheetML 2003 with SUM, AVERAGE, and IF formulas — no library required.
- **Page guide system** — Each page has a ❓ guide button explaining features, usage, and parameters. Supports simple/detailed toggle mode.
- **Responsive design** — Desktop sidebar layout with a mobile bottom tab navigation bar, including safe-area support.
- **Dark mode throughout** — All Canvas charts, UI elements, and exports adapt automatically.
- **CSP & XSS protection** — Content Security Policy headers and HTML injection sanitization (`escHtml`) built in.

---

## 🚀 Quick Start (用户)

1. Download `index.html` (主应用) 或 `money-wise-mobile.html` (手机版)
2. 主应用在电脑浏览器打开，手机版在手机浏览器打开
3. Start tracking your expenses — everything is saved automatically in your browser

No installation, no server, no internet connection required after download.

---

## 🛠️ Developer Quick Start

```bash
# Clone the repository
git clone https://github.com/Xiaobailong788/budget-app.git
cd budget-app

# Build index.html from source files
bash build.sh

# Open index.html in your browser
# Edit src/css/*.css and src/js/*.js, then rebuild
```

### Tests

The suites load the **built `index.html`** under jsdom, so always rebuild before running them — otherwise you are testing the previous build.

```bash
npm i --no-save jsdom                      # the only test dependency
bash build.sh                              # required first
for t in tests/*.js; do node "$t"; done    # each file exits non-zero on failure
```

See the 测试 section in [`STRUCTURE.md`](./STRUCTURE.md) for what each suite covers and the gotchas when adding new ones.

---

## 📝 Usage Guide

**总览 (Overview)** — Your landing dashboard. Review monthly totals, check your budget ring and savings ring, view the 7-day trend line, and see which categories are overspent.

**记账 (Add Record)** — Log a new expense by entering an amount, picking a category from the nested tree, setting a date and time, and optionally adding notes. The form validates your input and shakes on error.

**流水 (Records)** — Browse, search, and filter all your past expenses. Use the advanced filters to narrow results, switch between compact and card views, select multiple records for batch operations, or delete with a 5-second undo.

**分类 (Categories)** — Organize your spending categories in an infinitely nestable tree. Assign budgets per category, choose colors and emoji icons, merge duplicates, and move items with automatic cycle detection.

**统计 (Statistics)** — Explore your spending visually. Drill into pie chart slices, view trends on the line and bar charts, check your monthly heatmap, and export any chart as a PNG image.

**月度报告 (Report)** — Generate a print-friendly summary of any month. Use it for personal review or archiving.

**假设分析 (What-If)** — Run spending simulations by adjusting per-category assumptions. Compare projected savings against current trends with visual charts and detailed breakdowns.

**设置 (Settings)** — Configure your monthly budget, choose a savings target mode, toggle dark mode, and manage your data through JSON, CSV, or Excel export/import. Use LAN sync to transfer data between devices on the same Wi-Fi.

---

## 🛠 Tech Stack

- **Language**: Pure HTML5 / CSS3 / JavaScript (ES2020+)
- **UI**: Native DOM API, CSS Custom Properties, Flexbox, Grid
- **Charts**: Canvas 2D API with requestAnimationFrame
- **Storage**: Browser localStorage
- **Export**: Native JSON, CSV, XML Spreadsheet 2003 (SpreadsheetML)
- **Sync**: WebRTC P2P (LAN sync, zero server)
- **Build**: Simple bash script (concatenation)
- **Dependencies**: None — zero external libraries

---

## 📁 Project Structure

```
budget-app/
├── index.html               # 构建产物（生成，直接用于浏览器 / GitHub Pages）
├── build.sh                 # 构建脚本：拼接 src/ → index.html
├── src/
│   ├── index.html           # HTML 骨架（含 <!--build:css--> / <!--build:js--> 标记）
│   ├── css/                 # 13 个 CSS 文件（变量、布局、组件、动画、响应式、引导…）
│   └── js/                  # 24 个 JS 文件（按功能域拆分）
│       ├── 01-constants.js       # 颜色表、默认分类
│       ├── 02-datastore.js       # DataStore（localStorage CRUD）
│       ├── 03-excel-export.js    # Excel XML 导出
│       ├── 04-stats-engine.js    # 统计引擎
│       ├── 05-simulation-engine.js # 假设分析引擎
│       ├── 06-router.js          # 页面导航
│       ├── 07-ui-core.js         # 主题、Toast、Modal、工具函数
│       ├── 09-category-picker.js # 分类选择器
│       ├── 10-render-overview.js # 总览页
│       ├── 11-theme-colors.js    # Canvas 主题色
│       ├── 12-budget-progress.js # 预算进度卡片
│       ├── 13-canvas-drawing.js  # 环形图、迷你折线
│       ├── 14-render-add.js      # 记账页
│       ├── 15-render-records.js  # 流水页
│       ├── 16-render-categories.js # 分类页
│       ├── 17-stats-charts.js    # 统计页 + 全部图表绘制
│       ├── 18-render-settings.js # 设置页
│       ├── 19-render-report.js   # 月度报告
│       ├── 20-what-if.js         # 假设分析
│       ├── 21-month-rollover.js  # 月初结转
│       ├── 22-init.js            # 初始化
│       ├── 23-lan-sync.js        # WebRTC 局域网同步
│       ├── 24-diagnostics.js    # 数据诊断工具（一致性检查、存储用量、审计日志）
│       ├── 25-page-guides.js    # 页面引导系统（8 页简明/详尽双模式引导文案）
│       ├── 26-split-bills.js    # 分摊收款系统（追账中心/分摊编辑器/部分还款/归档与转普通记账）
│       └── 27-purchase-plans.js # 大额分期消费计划（先攒后买/先买后还/信用卡分期）
├── money-wise-mobile.html   # 手机版：轻量记账，支持导入导出JSON (~1,384 lines)
├── STRUCTURE.md             # 完整函数地图（供 AI Agent 使用）
├── features/                # Feature docs (v2.0.0-era snapshots — see each file's header)
├── technical/               # Technical development logs (local only)
├── user/                    # User-facing changelogs (local only)
└── logs/                    # Consolidated project logs (local only)
```

---

## 🌐 Browser Support

| Browser        | Support     |
|----------------|-------------|
| Chrome         | ✅ Full     |
| Firefox        | ✅ Full     |
| Edge           | ✅ Full     |
| Safari         | ✅ Full     |
| Internet Explorer | ❌ Not supported |

Requires ES2020+ support. Modern browsers only.

---

## 📄 License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
