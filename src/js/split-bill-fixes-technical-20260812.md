# 分摊收款（Split Bill）功能修复 — 技术日志

**日期**: 2026-08-12
**范围**: 分摊收款功能全链路修复（新增 `src/js/26-split-bills.js` 1371 行、`src/css/14-split.css` 208 行）
**验证**: jsdom 主套件 106/106 PASS、统计回归 7/7 PASS、冒烟测试全绿

---

## 1. 本次修复的根因与 Bug

| # | 问题 | 根因 | 修复位置 |
|---|------|------|----------|
| 1 | 图表分账金额双重计算（自己份额被算两次） | `getCategory` 兜底让 `getRootAncestorId(SPLIT_ID)` 返回自身 → 分账记录既当普通分类聚合、又被净额注入 | `17-stats-charts.js`：聚合跳过 SPLIT_ID；`getRawChartData` 在 net=0 时删除该键 |
| 2 | 分摊编辑器保存/预览完全失效 | `saveSplitBillEditor` / `updateEditSplitPreview` 未挂到 `window` → 内联 onclick/onchange 抛 `ReferenceError` | `26-split-bills.js` 导出修复 |
| 3 | 编辑器打开后"人均均分"却沿用旧数额 | 编辑模式固定为 equal 且其他人金额预填旧份额 → 均分未重算、指定模式改金额即溢出报错 | 模式推断（份额偏离均分值即 specified）+ 均分模式忽略预填值 |
| 4 | 设置页"数据修复"不生效 | `showToast(..., fixed)` 在 `let fixed` 声明前被引用（TDZ）→ 函数静默崩溃 | `18-render-settings.js` 声明上移 + 拆分数据修复逻辑 |
| 5 | 删除已结清账单误删流水 | 删除联动按"同日期+同金额"兜底，会误删**其他**账单的流水 | `deleteSplitBillWithRecords` 兜底仅匹配无 `splitBillId` 的孤儿记录 |
| 6 | 编辑账单改总金额后记录不同步 | 记录/账单双存储，编辑只改账单 | 编辑器保存时同步关联记录 `amount` |
| 7 | 弹窗背景滚动穿透 | modal 未锁定 body 滚动 + 无 overscroll 隔离 | `body.modal-open { overflow:hidden }` + `overscroll-behavior: contain` |
| 8 | 勾选"已还"卡顿 | 每次勾选重建整个弹窗 + 重渲染整张流水页 | 增量更新单卡片 + 延迟到关闭时刷新页面 |

## 2. 数据模型约定（最终形态）

- 记录：`categoryId='__split__'`（SPLIT_ID）、`record.splitBillId` 关联账单（老数据按同日期+同金额兜底）、`excludeFromAvg=false`（日均公式=非排除记录合计−contrib）
- 账单：`tag`（主表单多标签顿号连接）、`categoryId`（主表单真实分类）、`selfShare`（自己份额）、`archived`（已结清归档标志）
- 新增导出：`getSplitBillForRecord` / `getSplitBillUnpaid` / `setBillCategory` / `applyRecordEditToBill` / `deleteSplitBillWithRecords` / `openSplitBillEditor(billId, fromRecords)` / `updateEditSplitPreview` / `saveSplitBillEditor` / `openSplitBillSettleOptions` / `archiveSplitBill` / `unarchiveSplitBill` / `convertSplitBillToRecord` / `closeSplitCenter`

## 3. 功能清单

### 3.1 记账表单（14-render-add.js + 26-split-bills.js）
- 分摊区不再有自身标签/分类输入，账单继承主表单（`collectSplitBill` 按参数组装）
- 支持"指定我自己金额"（`setSplitSelfAmount` / `_selfSpecified()`），剩余自动均分
- 新增人员：try/catch 包裹 + 重名提示（`split.personExists`"⚠️ 已在名单中"）

### 3.2 流水页（15-render-records.js）
- 分摊记录显示真实分类 + "· 分摊账单"；金额=自己份额（无则全额），未还部分红色 `(+RM x.xx)`
- 点击分摊卡片 → `openRecordOrSplitEditor` → 打开**分摊设置编辑器**（不再走普通记录编辑框）
- 记录编辑弹窗 split-aware：隐藏"不计日均"、分类按钮走 `split-edit` 上下文、`submitEditRecord` 同步账单

### 3.3 分摊编辑器（26-split-bills.js）
- 打开时按份额推断模式（指定金额/人均均分），均分模式纯均分重算
- 可改：标签、**账单总金额**（同步关联记录）、自己金额、参与人、已还状态
- 保存/删除时按 `_splitEditorFromRecords` 决定是否跳回追账中心

### 3.4 追账中心
- 按账单卡片纵向布局：账单名（可换行）/📝 简介/日期/分类/我的份额 + 金额与还款状态 + 编辑/删除按钮在上，人员清单在虚线下方
- 已结清账单 🗑 → 二选一弹窗：**归档到"已结清"列表**（可再编辑/恢复，出现未还自动取消归档）或**转为普通记账记录**（保留流水、继承真实分类、已还金额回到自己支出）；底部保留"彻底删除（连同流水）"兜底
- 归档账单在"🗂 已结清归档"区展示，支持 ↩️ 恢复

### 3.5 性能与体验
- 弹窗 `width: min(92vw, 780px)` + `max-height: 88vh`，动态自适应
- 移除 `backdrop-filter: blur(4px)`（低端设备滚动卡顿主因）；动画 0.35s→0.25s
- 勾选已还：`_refreshCenterPaidState` 仅替换受影响的账单/联系人卡片 + 汇总数字，滚动位置不重置；`closeSplitCenter` 关闭时才刷新页面
- 全部长文本（账单名/备注/人员名）`word-break: break-word` 不再截断

### 3.6 数据修复（18-render-settings.js）
- 负数金额翻正、分摊记录 `excludeFromAvg` 归位、孤儿记录唯一匹配时自动链接账单、账单份额总和≠总额时按比例修正
- 修复 toast 增加"修复 N 项问题"计数

## 4. 测试

| 套件 | 文件 | 结果 |
|------|------|------|
| 主功能套件 | `/tmp/opencode/jsdom-test2.js` | 106/106 PASS |
| 统计回归 | `/tmp/opencode/split-test.js` | 7/7 PASS |
| 冒烟测试 | `/tmp/opencode/jsdom-test.js` | 全绿 |

关键断言覆盖：图表无分账切片（net=0）、卡片路由到分摊编辑器、编辑器模式推断、金额修改同步、归档/恢复/转普通记账全流程、body 滚动锁、数据修复四类问题。

## 5. 变更文件

```
新增: src/js/26-split-bills.js (1371 行), src/css/14-split.css (208 行)
修改: index.html (构建产物), src/css/03-components.css,
      src/js/02-datastore.js, 04-stats-engine.js, 07-ui-core.js,
      09-category-picker.js, 10-render-overview.js, 14-render-add.js,
      15-render-records.js, 17-stats-charts.js, 18-render-settings.js,
      19-render-report.js, 23-lan-sync.js, 25-page-guides.js
合计: 14 文件 +2481/−86
```

## 6. 已知限制

- 浏览器级验证依赖 jsdom（firefox headless 因 snap 问题不可用）
- 归档账单在人员视图仍按已还展示（语义正确：钱已收回）
- 转换记录时若账单分类已删除，记录落入"无分类"兜底
