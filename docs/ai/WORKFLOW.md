# 🔄 通用作业工作流

> **规范来源：** [`orchestration-flow` skill（全局安装）](../../../.config/opencode/skills/orchestration-flow/SKILL.md)
>
> 本文档是项目级快捷参考。完整版（含 DAG 分析、并行调度、Prompt 编写指引）请读 skill 原文。
>
> **核心原则：** Director 编排一切（规划/分派/审查），绝不执行。
> 适用于**任何类型任务**，不限于编程。

---

## 🧩 Agent 生态

```

         User ──→ Director ──task──→ Team-Leader ──→ Sub-Agents
                      ↑                      ├── Explore
                      │                      ├── Researcher
                  审查/交付                    ├── Writer
                                              ├── Tester
                                              ├── UI-Agent
                                              ├── Organizer
                                              └── General
```

| 角色 | 一句话职责 | 关键约束 |
|------|-----------|---------|
| **User** | 提需求、做决策、终审 | — |
| **Director** | 规划、分派、审查 | 绝不执行（无 write/edit/bash） |
| **Team-Leader** | 拆解、分派、汇总、写日志 | 不能调 subagent 调 subagent |
| **Explore** | 快速探索代码库 | 只读 |
| **Researcher** | 搜索网页 | 只查不写 |
| **Writer** | 写/改文档 | 不跑代码 |
| **Tester** | 测试验证 | 只测不修 |
| **UI-Agent** | 格式美化 | 不改内容 |
| **Organizer** | 组织文件结构 | — |

---

## 📐 7 阶段概览

```
① 接收澄清 → ② 规划拆解 → ③ 设计(可选) → ④ 交办 → ⑤ 执行 → ⑥ 审查 → ⑦ 交付
```

| 阶段 | 做什么 | 产出 |
|------|--------|------|
| **① 接收澄清** | User→Director，需求不清则一次一个问题提问 | 清晰的需求描述 |
| **② 规划拆解** | Director 做 DAG 分析，拆原子任务，标注 agent-type + 验收标准 | 任务列表 |
| **③ 设计（可选）** | 复杂任务出方案 → User 批准 | 设计方案 |
| **④ 交办** | Director 用 `task` 调 Team-Leader，传完整任务包 | 任务包已发出 |
| **⑤ 执行** | Team-Leader 拆解→按 DAG 分层并行执行→收集→写日志 | 交付物 + 日志 |
| **⑥ 审查** | Director 逐项检查（需求/遗漏/质量/日志/越权） | 合格/返工 |
| **⑦ 交付** | Director 向 User 呈现结果摘要 | 验收/修改 |

---

## ⚡ 弹性裁剪

| 场景 | 走哪些阶段 |
|------|-----------|
| 修 bug / 改文案 | ① → ②(简) → ④ → ⑤ → ⑥ → ⑦ |
| 写文档 / 做调研 | ① → ② → ④ → ⑤ → ⑥ → ⑦ |
| 新增小功能 | ① → ② → ③(简) → ④ → ⑤ → ⑥ → ⑦ |
| 大版本 / 重构 | ① → ② → ③(完整) → ④ → ⑤ → ⑥ → ⑦ |

---

> **完整版（DAG 分析 / 并行调度 / Prompt 编写 / 决策权分布）：**
> 参见 [`orchestration-flow` skill](../../../.config/opencode/skills/orchestration-flow/SKILL.md)
