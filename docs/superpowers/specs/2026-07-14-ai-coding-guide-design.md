# AI 编程规范 — 设计文档

**日期:** 2026-07-14
**状态:** 已批准，待实现

## 背景

本项目（Budget App）所有代码由 AI Agent 生成，需要一个专门给 AI 阅读的编程规范，确保 AI 不跑题、不破坏现有架构、遵守项目约定。

## 需求

1. 覆盖 18+ 条关键规则（移动端、零依赖、深色模式、i18n、构建纪律、IIFE、CSP、Canvas Retina、数据兼容、JSON 导入导出、软删除、统计范围联动、路由注册、PIN 加密、文档配套、版本号、mobile companion、README 同步、STRUCTURE 工作流）
2. 存放位置醒目，AI 一眼能看见
3. 按需阅读，避免浪费 token

## 设计方案

### 目录结构

```
docs/ai/
├── README.md       ← 入口 + 决策树（AI 进来第一个读的文件）
├── RULES.md        ← 18 条规则 checklist（每条 1-3 行，速览核对）
├── WORKFLOW.md     ← 广义开发工作流（角色、阶段、决策节点）
└── REFERENCE.md    ← 按主题展开的深度参考（代码片段、文件路径、反例）
```

### 入口决策树

README.md 按任务类型分流：
- Bug fix → RULES.md 快速过一遍
- UI 修改 → REFERENCE.md §UI + RULES.md 相关条
- 数据层 → REFERENCE.md §数据 + RULES.md 相关条
- 架构/构建 → REFERENCE.md §架构 + RULES.md 相关条
- 新功能/大模块 → WORKFLOW.md + RULES.md 全篇 + REFERENCE.md
- 新人第一次 → 先 WORKFLOW.md 再按任务类型走

### 配套修改

- `STRUCTURE.md` 开头加引用到 `docs/ai/README.md`
- `STRUCTURE.md` 末尾新增「开发工作流」章节

## 交付物

1. `docs/ai/README.md`
2. `docs/ai/RULES.md`
3. `docs/ai/WORKFLOW.md`
4. `docs/ai/REFERENCE.md`
5. 修改 `STRUCTURE.md`
