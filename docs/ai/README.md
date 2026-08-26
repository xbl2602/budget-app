# 🤖 Budget App — AI 开发指南

> **开始修改前请先读本文档。**
> 读完你就知道该读 `docs/ai/` 下的哪个文件，以及不该碰什么。

本项目的全部代码均由 **AI Agent 生成和维护**。以下指南帮助你在修改时保持一致、不跑题、不破坏已有功能。

---

## 🧭 决策树：你的任务属于哪一类？

### A. 修复 bug / 极小的样式调整
→ [**RULES.md**](./RULES.md) — 快速过一遍 19 条 checklist（2 分钟）

### B. 修改 UI（样式 / 组件 / 页面结构 / 动画）
→ [**REFERENCE.md**](./REFERENCE.md) 的 **§UI 规则**
→ 同时对照 RULES.md 的 **#1**（移动端）**#3**（深色）**#4**（i18n）**#7**（Canvas Retina）

### C. 修改数据层（localStorage schema / CRUD / 导入导出）
→ [**REFERENCE.md**](./REFERENCE.md) 的 **§数据**
→ 同时对照 RULES.md 的 **#8**（数据兼容）**#9**（JSON 导入导出）**#10**（软删除）

### D. 修改构建 / 架构 / 安全 / 依赖
→ [**REFERENCE.md**](./REFERENCE.md) 的 **§架构**
→ 同时对照 RULES.md 的 **#2**（零依赖/CSP）**#5**（构建纪律）**#6**（IIFE）

### E. 新增页面 / 功能 / 大模块
→ [**WORKFLOW.md**](./WORKFLOW.md) 全篇
→ [**RULES.md**](./RULES.md) 全篇
→ [**REFERENCE.md**](./REFERENCE.md) 所有相关章节

### F. 你第一次接触这个项目
→ 先读 [**WORKFLOW.md**](./WORKFLOW.md) 理解完整流程
→ 再根据任务类型走上面的分支

---

## 📁 文件索引

| 文件 | 用途 | 适合谁 |
|------|------|--------|
| [RULES.md](./RULES.md) | 19 条规则速览 checklist | 所有人，每次修改前 |
| [WORKFLOW.md](./WORKFLOW.md) | 开发流程、角色分工、阶段说明 | 新人大版本开发 |
| [REFERENCE.md](./REFERENCE.md) | 按主题深度展开（含代码/反例） | 写代码时查阅 |

---

## ⚠️ 底线原则（任何时候都不要违反）

- ❌ **不要引入外部依赖**（CDN / npm / 字体 / 库）
- ❌ **不要直接编辑 `index.html`**（改 `src/` 后 `bash build.sh`）
- ❌ **不要绕开 IIFE 作用域**（跨文件访问必须 `window.*` 导出）
- ❌ **不要破坏 CSP**（`default-src 'none'`）
- ❌ **不要删除用户数据**（schema 变更必须做迁移兼容）
- ❌ **不要在没跑测试的情况下交付**（`bash build.sh` 之后 `node tests/*.js`，见 RULES #19）

---

## 🗺️ 当前状态（v3.2.0）

| 项 | 现状 |
|---|---|
| 源文件 | 15 个 CSS + 27 个 JS（`src/`），构建为单个 `index.html` |
| 页面 | 总览 / 记账 / 流水 / 分类 / 统计 / 月度报告 / 假设分析 / 设置 |
| 较新的模块 | `26-split-bills.js`（分摊收款 + 部分还款）、`27-purchase-plans.js`（大额分期计划）、`17-stats-charts.js` 的分类三视图（饼图 / 格子图 / 矩形图） |
| 测试 | `tests/` 下 8 个 jsdom 套件，见 [STRUCTURE.md](../../STRUCTURE.md) 的「测试」章节 |
| 完整函数地图 | [STRUCTURE.md](../../STRUCTURE.md) |

> `features/` 下的功能文档是 **v2.0.0 时期的快照**，已不反映现状，别拿它当现状依据。
