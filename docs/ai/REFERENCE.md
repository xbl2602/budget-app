# 📖 深度参考手册

> 按主题组织的详细规则说明。包含代码片段、文件路径、常见反例。
> 写代码时遇到具体问题直接跳到对应章节查阅。

---

## §架构

### 规则 #2：零依赖 / 离线 / CSP

**代码中的体现：**
- `index.html` 第 6 行：`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">`
- 所有样式内联在 `<style>` 标签中
- 所有脚本内联在 `<script>` 标签中
- 构建后为单个 HTML 文件，不依赖任何外部资源

**常见错误：**
- ❌ 引入 Google Fonts / Font Awesome 等外部 CDN → 被 CSP 阻止且违反零依赖原则
- ❌ 使用 `<img src="http://...">` 外部图片 → CSP 阻止
- ❌ 使用 `<script src="cdn...">` → 违反零依赖和 CSP
- ✅ 使用 Unicode / Emoji 替代图标

### 规则 #5：构建纪律

**文件定位：**
- 源文件：`src/index.html`（HTML骨架）、`src/css/*.css`、`src/js/*.js`
- 构建产物：`index.html`（根目录）
- 构建脚本：`build.sh`

**构建流程：**
```bash
bash build.sh   # 在项目根目录运行
# 将 src/ 下的文件拼接为 index.html
```

**原理：** `build.sh` 使用 `perl` 脚本将 `src/css/*.css` 注入 `<!--build:css-->` 位置，将 `src/js/*.js` 注入 `<!--build:js-->` 位置。

**常见错误：**
- ❌ 直接编辑 `index.html` → 下次 `bash build.sh` 会被覆盖
- ❌ 忘记运行 `build.sh` → 修改不会生效
- ❌ 修改了 `build.sh` 的行为但没测试 → 可能破坏构建

### 规则 #6：IIFE 模块约定

**标准模板：**
```javascript
/* ============================================================
   文件名（功能说明）
   ============================================================ */
(function() {
'use strict';

// ... 文件内部代码 ...

// === EXPORTS ===
window.myFunction = myFunction;
window.myVariable = myVariable;
})();
```

**导出规则：**
- 只有被 HTML 的 `onclick` 或其他 JS 文件引用的符号才导出
- 文件名按编号前缀（`01-`、`02-`...）控制加载顺序
- 加载顺序 = 编号顺序，不可改变

**常见错误：**
- ❌ 在 IIFE 外声明变量 → 全局污染
- ❌ 直接访问其他文件的 IIFE 内部变量 → `undefined`
- ❌ 忘记在 `// === EXPORTS ===` 区域导出 → 其他文件无法访问
- ✅ 跨文件访问示例：`window.DataStore.getRecords()`、`window.navigateTo('stats')`

### 规则 #12：路由 / 页面注册

**注册新页面的四步操作：**

1. `src/index.html` 中添加 section：
```html
<section class="page-section" id="page-xxx" data-page="xxx"></section>
```

2. `06-router.js` 的 `pageTitles` 中添加：
```javascript
'xxx': __('router.pageXxx'),
```
以及 i18n 条目：
```javascript
addI18nEntries({
  'router.pageXxx': { zh: '页面名', en: 'Page Name' }
});
```

3. `06-router.js` 的 `navigateTo()` 中添加渲染调用：
```javascript
else if (tab === 'xxx') renderXxx();
```

4. 侧边栏和底部导航添加 tab 项：
```html
<div class="sidebar-item" data-tab="xxx"><span class="icon">🔤</span> <span data-i18n="nav.xxx">页面名</span></div>
<div class="nav-item" data-tab="xxx"><span class="nav-icon">🔤</span><span class="nav-label" data-i18n="nav.xxx">页面名</span></div>
```

---

## §数据

### 规则 #8：数据兼容性

**localStorage schema 结构（`02-datastore.js`）：**
```javascript
_defaults() {
  return {
    records: [],
    categories: [...],
    budgets: {},
    categoryBudgets: {},
    savingsTarget: { type: 'fixed', fixedAmount: 0, percent: 0 },
    colorIndex: ...,
    billCategories: [],
    billAmounts: {},
    monthlyIncome: {},
    percentBase: 'gross',
    lastActiveMonth: '',
    whatIfParams: null,
    allTags: [],        // v2.7.0 新增
    tagColors: {}       // v2.7.0 新增
  };
}
```

**`init()` 中的迁移模式：**
```javascript
init() {
  // 逐字段检查，缺失则用默认值补全
  if (!this._data.categories || !this._data.categories.length) {
    this._data.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  }
  if (!this._data.savingsTarget) {
    this._data.savingsTarget = { type: 'fixed', fixedAmount: 0, percent: 0 };
  }
  // ... 每个新字段都要这样检查一次
}
```

**常见错误：**
- ❌ 假设用户数据有新版的所有字段 → 老用户数据会崩溃
- ❌ 直接移除旧字段但不做迁移 → 老数据残留导致问题
- ✅ 添加字段只需在 `_defaults()` 和 `init()` 中处理
- ✅ 移除字段前用 grep 搜索所有引用确保没有依赖

### 规则 #9：JSON 导出 / 导入

**导出：**
```javascript
exportJSON() {
  return JSON.stringify(this._data, null, 2);
  // 自动包含 this._data 上的所有字段
}
```

**导入（replace 模式）：**
```javascript
importJSON(jsonStr, mode = 'replace') {
  const data = JSON.parse(jsonStr);
  if (mode === 'replace') {
    this._data = data;  // 直接替换
  }
}
```

**导入（merge 模式）——新增字段时要注意：**
```javascript
if (mode === 'merge') {
  this._data.records = [...data.records, ...this._data.records];
  // 合并分类、预算、账单...
  // 新增字段如果是简单类型，通过 Object.assign 合并
  Object.assign(this._data, pick(data, ['newField1', 'newField2']));
}
```

**常见错误：**
- ❌ 新增字段后未在 merge 模式中处理 → 导入的数据缺少该字段
- ❌ 数据格式变化（如字段重命名）→ 旧 JSON 导入失败
- ✅ `exportJSON()` 全量导出，新增字段自动包含
- ✅ merge 模式中新增字段通过 `Object.assign()` 或显式赋值处理
- ✅ 导入时验证字段合法性：`if (!data.records || !data.categories) return false;`

### 规则 #10：软删除机制

**流程：**
```
deleteRecordConfirm(id)  →  弹窗确认
  → confirmDeleteRecord(id)  →  软删除（设 _deleted 标记）
    → showToast("删除成功 撤销")  →  5 秒倒计时
      → undoDelete()  →  恢复记录，清除倒计时
      → _finalizeDelete(id)  →  从数组中删除
```

**实现位置：** `15-render-records.js` 中的 `deleteRecordConfirm()`、`confirmDeleteRecord()`、`undoDelete()`
**数据层：** `02-datastore.js` 中的 `softDeleteRecord()`、`undoDelete()`、`_finalizeDelete()`

**常见错误：**
- ❌ 新功能中直接 `DataStore.deleteRecord()` 绕过软删除 → 用户无法撤销
- ❌ 忘记处理 `_pendingDelete` 状态 → 并发删除冲突
- ✅ 所有记录删除操作必须走软删除流程

### 规则 #13：PIN 加密生命周期

**关键流程：**
```
设置 PIN → setPin(pin) → 加密数据 → 删除明文存储
启动应用 → 检测到加密 → 显示 PIN 弹窗 → unlockData(pin) → init()
自动锁定 → lockData() → 清除内存和明文
```

**实现位置：** `02-datastore.js`（加密/解密/验证），`07-ui-core.js`（PIN 弹窗/锁定）
**存储键名：** `budgetAppPinHash`、`budgetAppSalt`、`budgetAppDataEncrypted`、`budgetAppData`

**常见错误：**
- ❌ 直接读取 `localStorage.budgetAppData` 获取数据 → 加密状态下为空
- ❌ 忘记 PIN 相关操作是 async 的 → 返回值是 Promise
- ❌ 新增数据功能在加密状态下绕过解密流程 → 数据不一致
- ✅ 所有数据操作通过 `DataStore` 单例进行，不要直接操作 localStorage

### 规则 #16：money-wise-mobile.html 同步

**手机版支持的页面：** 记账、流水、分类、设置（仅 JSON 导入导出）
**手机版不支持的页面：** 总览、统计、报告、假设分析、图表
**数据格式共用度：** 记录和分类数据结构与主应用完全一致

**常见错误：**
- ❌ 修改记录/分类 schema 后忘记更新手机版 → 手机版导入主应用数据报错
- ✅ 手机版只涉及核心 CRUD，不影响数据格式的 UI 变更无需同步

---

## §UI

### 规则 #1：移动端适配

**断点系统（`12-responsive.css`）：**
```
< 481px    → 手机（单列、紧凑间距）
481-1023px → 平板（两列、舒适间距）
≥ 1024px   → 桌面（侧边栏 + 四列、大间距）
```

**关键实现：**
- 侧边栏：`@media (min-width: 1024px) { .sidebar { display: flex; } .bottom-nav { display: none; } }`
- 安全区域：`--safe-bottom: env(safe-area-inset-bottom, 0px)`
- 触控反馈：`.nav-item:active { transform: scale(0.92); }`
- 网格响应：`.grid-2` / `.grid-3` / `.grid-4` + 媒体查询

**常见错误：**
- ❌ 写死像素宽度 → 在小屏设备溢出
- ❌ 添加固定高度元素 → 在短屏手机上内容被截断
- ❌ 忽略 `safe-area-inset-bottom` → iPhone 底部被刘海遮挡
- ❌ hover-only 交互 → 触屏设备无法触发
- ✅ 使用 CSS `var()` 和 `calc()` 做弹性布局
- ✅ 始终用 `@media` 控制桌面/移动端差异

### 规则 #3：深色模式

**CSS 变量系统（`01-base.css`）：**
```css
:root {
  --bg: #F8FAFC;
  --card-bg: #FFFFFF;
  --text-primary: #1E293B;
  /* ... */
}
[data-theme="dark"] {
  --bg: #0F172A;
  --card-bg: #1E293B;
  --text-primary: #F1F5F9;
  /* ... */
}
```

**Canvas 主题色（`11-theme-colors.js`）：**
```javascript
function getThemeColors() {
  const style = getComputedStyle(document.body);
  return {
    text: style.getPropertyValue('--text-primary').trim(),
    muted: style.getPropertyValue('--text-muted').trim(),
    border: style.getPropertyValue('--border').trim(),
    bg: style.getPropertyValue('--bg').trim(),
    cardBg: style.getPropertyValue('--card-bg').trim()
  };
}
```

**常见错误：**
- ❌ 在 CSS 中硬编码颜色值（除了品牌色） → 深色模式不生效
- ❌ Canvas 绘制使用固定颜色 → 切换主题后图表不匹配
- ❌ 新增深色模式覆盖时忘了检查 Canvas 颜色 → 图表在白底/黑底不可见
- ✅ 新 CSS 颜色用 `var(--xxx)` 引用
- ✅ 新 Canvas 绘图从 `getThemeColors()` 读取颜色

### 规则 #4：国际化

**i18n 引擎位置：** `src/js/00-i18n.js`
**核心 API：**
- `__(key, ...args)` — 获取翻译文本（带参数插值 `{0}`、`{1}`...）
- `addI18nEntries({key: {zh: '中文', en: 'English'}})` — 注册翻译
- `setLocale('zh' | 'en')` — 切换语言（刷新页面）
- `getCurrentLocale()` — 获取当前语言
- `applyI18nToDOM()` — 应用到 DOM

**HTML 中使用：**
```html
<!-- data-i18n 翻译元素文本 -->
<span data-i18n="nav.overview">总览</span>

<!-- data-i18n-title 翻译 title 属性 -->
<button data-i18n-title="btn.guide" title="页面引导">❓</button>

<!-- 带参数插值 -->
<span data-i18n="record.count" data-i18n-arg-0="42">共 42 条</span>
<!-- __("record.count", 42) → { zh: "共 {0} 条", en: "{0} records" } -->
```

**JS 中使用：**
```javascript
// 直接调用
var text = __('stats.totalSpending', monthTotal);
// 注册翻译（在文件底部，EXPORTS 之前）
addI18nEntries({
  'stats.totalSpending': { zh: '总支出: RM {0}', en: 'Total Spending: RM {0}' }
});
```

**常见错误：**
- ❌ 在 JS 中写死中文字符串 → 切换英文后仍然是中文
- ❌ 忘记为新增 key 提供 en 翻译 → 英文模式下显示 `??key??`
- ❌ 在 `data-i18n` 元素中混合了文本和子元素 → `textContent` 覆盖子元素
- ✅ 所有用户可见文本必须用 `__()` 或 `data-i18n`
- ✅ 只注册一条翻译时采用以下模式：`{ zh: '中文', en: 'English' }` 同时提供

### 规则 #7：Canvas Retina 适配

**标准模式（见 `13-canvas-drawing.js`）：**
```javascript
const dpr = window.devicePixelRatio || 1;
const rect = canvas.getBoundingClientRect();
const cssSize = rect.width || 160;
const bufferSize = Math.round(cssSize * dpr);

// 只在尺寸变化时重建 buffer（性能优化）
if (canvas.width !== bufferSize || canvas.height !== bufferSize) {
  canvas.width = bufferSize;
  canvas.height = bufferSize;
}

// 缩放绘图上下文到 CSS 像素坐标
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// 之后所有 ctx 操作使用 CSS 像素坐标
ctx.clearRect(0, 0, cssSize, cssSize);
// 绘制...
```

**常见错误：**
- ❌ 直接设置 `canvas.width = cssSize` → 在 Retina 屏上模糊
- ❌ 不考虑 DPR 做 `getImageData`/`putImageData` → 坐标错位
- ❌ 每次渲染都重新设置 `canvas.width` → 触发重绘并清除画布内容
- ✅ 在尺寸未变时跳过 `canvas.width` 赋值

---

## §安全

### 规则 #2（安全部分）：CSP

**当前 CSP 策略：**
```
default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';
```

这意味着：
- ❌ 不允许 `<img src="...">`（除非 data: URI）
- ❌ 不允许 `<script src="...">` 外部脚本
- ❌ 不允许 `<link rel="stylesheet" href="...">` 外部样式
- ❌ 不允许 `<iframe>`
- ❌ 不允许 `@font-face` 加载外部字体
- ❌ 不允许 `connect-src`（AJAX / WebSocket）
- ❌ 不允许 `worker-src`（Web Worker）

符合 CSP 的做法：
- ✅ 图片使用 emoji/unicode 替代
- ✅ 图标使用 unicode 字符（📊 ✏️ 📋 🏷️ 📈 ⚙️ 等）
- ✅ 字体使用系统字体栈：`-apple-system, "Segoe UI", Roboto, ...`
- ✅ 数据通过 `localStorage` 存取

---

## §文档

### 规则 #14：文档配套

**需要更新的文档清单：**

| 变更类型 | 需更新 | 模板位置 |
|---------|--------|---------|
| 新增函数/导出 | STRUCTURE.md 函数地图 | - |
| 新增功能 | technical/ + user/ 日志 | 参考已有日志格式 |
| 功能变更 | README.md Features 列表 | - |
| 版本升级 | README.md 版本号 | - |

**日志格式参考（`technical/`）：**
```markdown
# Technical Log — 功能名
**Date:** YYYY-MM-DD
**Task:** 简短描述
**File:** 涉及的文件路径

## Summary
...

## Operations Performed
...

## Statistics
| Metric | Value |
...
```

### 规则 #18：开发工作流

工作流章节应被添加到 `STRUCTURE.md` 中，参见 [WORKFLOW.md](./WORKFLOW.md) 的完整说明。

---

## §其他

### 规则 #11：统计范围联动

**实现位置：**
- `01-constants.js`：`getStatsRange()` 和 `getPeriodDateRange()`
- `02-datastore.js`：`getStatsRange()` / `setStatsRange()`
- 所有页面渲染函数中调用 `getPeriodDateRange()` 获取当前范围

**影响范围检查清单：**
- [ ] 总览（overview）— 月总计、环图、折线图
- [ ] 统计（stats）— 饼图、折线图、柱状图、热力图
- [ ] 报告（report）— 月度报告
- [ ] 流水（records）— 记录列表筛选
- [ ] 假设分析（whatif）— 模拟数据范围

**注意：** 预算和储蓄环图始终按日历月统计，不受滚动范围影响。

### 规则 #15：版本号判断指南

**B 级（次版本递增）的情况：**
- 新增功能（新页、新图表、新操作）
- 重构但不破坏 API
- UI 大调整
- 新增数据字段（有迁移兼容）

**C 级（修订号递增）的情况：**
- 修复 bug
- CSS 微调
- 拼写错误/翻译错误
- 性能优化但不影响功能
- 文档更新
