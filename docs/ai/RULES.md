# 📋 18 条规则 Checklist

> 每条规则含：**规则编号 + 一句话规则 + 为什么这样做**
> 修改前快速过一遍，确保没有踩雷。

---

## 🎨 UI 规则

### #1 移动端适配
**所有 UI 修改必须同时考虑桌面端 + 移动端。**
- 1024px 断点：≥1024px 显示侧边栏，<1024px 显示底部导航栏
- 使用 `safe-area-inset-bottom` 适配刘海屏
- 触控元素加 `-webkit-tap-highlight-color: transparent` + `:active` 缩放反馈
- 勿破坏 `12-responsive.css` 中的响应式断点逻辑

### #3 深色模式
**所有样式和 Canvas 绘图必须适配深色模式。**
- CSS 使用 `[data-theme="dark"]` 变量覆盖，不硬编码颜色值
- Canvas 绘图调用 `getThemeColors()` 获取当前主题色
- 新增组件后检查亮/暗两套主题下的对比度
- `01-base.css` 中 `:root` + `[data-theme="dark"]` 是样式变量中心

### #4 国际化（英文/中文）
**所有对用户可见的文本必须经过 i18n。**
- 使用 `__('key')` 函数获取翻译文本
- 使用 `data-i18n="key"` 属性标记 DOM 元素文本
- 使用 `data-i18n-title="key"` 标记 title 属性
- 翻译条目通过 `addI18nEntries({...})` 注册在文件底部
- 默认语言为中文（zh），英文（en）为第二语言
- 新增 i18n key 必须同时提供 zh 和 en 两种翻译
- 参见 `src/js/00-i18n.js` 的完整实现

### #7 Canvas Retina 适配
**所有 Canvas 绘图必须适配 `devicePixelRatio`。**
- 读取 `window.devicePixelRatio || 1`
- Canvas 的 `width/height` 设为 `Math.round(cssSize * dpr)`
- 通过 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 缩放绘图上下文
- CSS 中的 canvas 尺寸用 `width/height` 或 CSS 属性保持逻辑尺寸
- 示例见 `src/js/13-canvas-drawing.js`

---

## 🏗️ 架构规则

### #2 零依赖 / 离线 / CSP
**绝不引入任何外部资源。**
- 不引用 CDN、外部字体、第三方库、图片、iframe
- 所有内容自包含在单 HTML 文件中（构建后）
- CSP 头 `default-src 'none'` + `style-src 'unsafe-inline'` + `script-src 'unsafe-inline'`
- 新增功能后确保仍可离线打开运行

### #5 构建纪律
**永远修改 `src/` 下的源文件，然后运行 `bash build.sh`。**
- 不直接编辑 `index.html`（它是构建产物）
- CSS 在 `src/css/*.css`，JS 在 `src/js/*.js`
- 运行 `bash build.sh` 后验证 `index.html` 正常工作
- 如果构建脚本需要修改，同步更新 `build.sh`

### #6 IIFE 模块约定
**每个 JS 文件用 IIFE 包裹，跨文件符号必须显式导出。**
- 每个文件以 `(function() { 'use strict';` 开头
- 以 `// === EXPORTS === window.xxx = xxx; })();` 结尾
- 只通过 `window.*` 导出被其他文件或 HTML onclick 引用的符号
- 不要直接访问其他文件的 IIFE 内部变量
- 不要在文件外部或全局作用域声明变量

---

## 💾 数据规则

### #8 数据兼容性
**localStorage schema 变更必须做向前兼容。**
- `DataStore._defaults()` 返回最新默认数据结构
- `DataStore.init()` 中按字段逐一检查并补全缺失字段（见 `02-datastore.js`）
- 不要假设用户数据拥有新版本的完整结构
- 移除字段前确认没有代码依赖该字段

### #9 JSON 导出 / 导入同步
**新增数据字段必须同步更新导出/导入。**
- `exportJSON()` 使用 `JSON.stringify(this._data)` 自动包含所有新字段
- `importJSON()` 的 **merge 模式** 必须处理新字段的合并逻辑
- replace 模式直接替换整个数据对象
- 新增字段不需要迁移的，确保 `_defaults()` 有合理默认值即可
- 导入时需要验证字段合法性（类型、范围等）

### #10 软删除机制
**不要绕过 5 秒撤销窗口。**
- `deleteRecordConfirm()` → 软删除 → 5 秒内可 `undoDelete()`
- 5 秒后 `_finalizeDelete()` 真正删除
- 新功能涉及删除记录时必须走软删除流程
- 批量删除同样通过软删除机制处理（见 `15-render-records.js`）

### #12 路由 / 页面注册
**新增页面必须在三处注册。**
1. `src/index.html` 中添加 `<section class="page-section" id="page-xxx">`
2. `06-router.js` 的 `navigateTo()` 中添加页面渲染调用
3. `06-router.js` 的 `pageTitles` 中添加标题映射
4. `src/index.html` 的侧边栏（sidebar-nav）和底部导航（bottom-nav）添加 tab 项

### #13 PIN 加密生命周期
**不要破坏加密存储 / 解锁 / 锁定流程。**
- 加密数据存储在 `budgetAppDataEncrypted` 中
- 解密流程：`verifyPin()` → `_decryptData()` → `init()`
- 调用 `lockData()` 后清除内存和明文存储
- PIN 相关操作涉及异步（Web Crypto API），注意 async/await

### #17 README 同步更新
**新增功能或行为变更后必须更新 README.md。**
- 更新 Features 列表（新增或修改对应条目）
- 更新版本号（见 #15）
- 如果技术栈变化，更新 Tech Stack 章节

---

## 🔧 其他规则

### #11 统计范围联动
**本月 / 近30天模式影响所有页面。**
- 当前模式通过 `getStatsRange()` 获取（`'month'` / `'rolling30'`）
- 受影响的页面：总览(overview)、统计(stats)、报告(report)、流水(records)、假设分析(whatif)
- 新增页面如果涉及时间范围筛选，也必须联动
- 预算和储蓄环图始终保持月口径，不受范围切换影响

### #14 文档配套
**新增函数/文件/功能后必须更新相关文档。**
- `STRUCTURE.md` 中的函数地图 — 新增的导出函数/方法须添加
- 新功能写 `technical/YYYY-MM-DD-xxx-technical.md`（技术日志）
- 新功能写 `user/YYYY-MM-DD-xxx-user.md`（用户日志）
- 日志放在对应目录下用于追踪变更历史

### #15 版本号规则
**版本号格式 `vA.B.C`。**
- **A（主版本号）**：只允许人类手动修改，AI 不可变更
- **B（次版本号）**：中规中矩的功能更新、重构、非破坏性变更，AI 可自行递增
- **C（修订号）**：令人羞耻的小修复 — bug fix、typo、样式微调，AI 可自行递增

### #16 money-wise-mobile.html 同步
**手机独立版与主应用保持数据格式兼容。**
- 新增数据字段时，如果影响记录/分类数据格式，同步更新手机版
- 手机版仅支持记账、流水、分类、JSON 导入导出，不涉及图表/统计/设置

### #18 STRUCTURE.md 开发工作流
**STRUCTURE.md 新增一个「广义开发工作流」章节。**
- 描述完整开发周期的角色分工和阶段流转
- 不是"当前任务"步骤，而是**通用的、针对整个项目的**工作流
- 详见 [WORKFLOW.md](./WORKFLOW.md) 的完整说明
