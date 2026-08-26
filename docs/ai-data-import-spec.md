# 📥 Budget App — AI 批量导入消费流水规范

> **适用版本**：v3.2.0（2026-08-25 校对）。`records` / `categories` 的字段规则自 v3.0 起未变；
> 若 `02-datastore.js` 的 `importJSON()` 有改动，请回头核对 §3 与 §8。

> **用途**：当用户提供聊天记录 / 文本消费清单，并要求「导入」时，AI 按本规范抽取数据 → 生成 JSON 文件 → 引导用户手动导入。
> **范围**：仅消费流水（`records` + `categories`）。**不**生成预算、收入、储蓄目标、账单分类、分摊账单、联系人、大额分期计划。

---

## 1. 目标与范围

- 输入：一段或多段中文/英文文本（聊天记录、手打清单、随手记），包含消费条目
- 输出：一个 `.json` 文件（文件名如 `budget-import-2026-08-12.json`）
- 用户动作：设置页 → 数据管理 → 导入 JSON → 选「合并」（默认，保留现有数据）
- 约束：
  - 金额一律 **RM（马币）**；文本中出现其他币种（¥/$/€…）按 **1:1** 记录，并在 note 中注明原币种（如 `（¥30≈RM30）`）
  - **不生成** `budgets`、`monthlyIncome`、`savingsTarget`、`billCategories`、`billAmounts`、`splitBills`、`contacts`、`purchasePlans` 等键
  - 字段名与类型必须与 app 内部 schema 完全一致（见 §3），否则 `importJSON` 直接失败
  - **默认交付「合并」模式文件**（只含新分类）；若用户明确要求「替换」，必须输出 §4 完整分类表（见 §8 警告）

---

## 2. 输入 → 输出对照示例

### 输入（聊天记录）
```
8/5 火锅 300，Alice 还没给钱
8/6 买菜 500
8/8 grab打车 32
8/9 网课年费 1999（¥1999 人民币）
8/10 奶茶 12.5
```

### 输出（`budget-import.json`）
```json
{
  "records": [
    { "id": "lzk3ab1c2d3", "amount": 300, "categoryId": "cat-child-1-3", "date": "2026-08-05T12:00:00", "note": "火锅", "tags": [], "excludeFromAvg": false, "createdAt": "2026-08-12T10:00:00.000Z" },
    { "id": "lzk3ab1c2d4", "amount": 500, "categoryId": "cat-child-1-1", "date": "2026-08-06T12:00:00", "note": "买菜", "tags": [], "excludeFromAvg": false, "createdAt": "2026-08-12T10:00:00.000Z" },
    { "id": "lzk3ab1c2d5", "amount": 32, "categoryId": "cat-child-2-4", "date": "2026-08-08T12:00:00", "note": "grab打车", "tags": [], "excludeFromAvg": false, "createdAt": "2026-08-12T10:00:00.000Z" },
    { "id": "lzk3ab1c2d6", "amount": 1999, "categoryId": "cat-root-7", "date": "2026-08-09T12:00:00", "note": "网课年费（¥1999≈RM1999）", "tags": [], "excludeFromAvg": false, "createdAt": "2026-08-12T10:00:00.000Z" },
    { "id": "lzk3ab1c2d7", "amount": 12.5, "categoryId": "cat-child-1-4", "date": "2026-08-10T12:00:00", "note": "奶茶", "tags": [], "excludeFromAvg": false, "createdAt": "2026-08-12T10:00:00.000Z" }
  ],
  "categories": [
    { "id": "cat-ai-1001", "name": "课程", "icon": "🎓", "color": "#14B8A6", "parentId": "cat-root-7", "sortOrder": 2 }
  ]
}
```

---

## 3. JSON Schema（严格字段）

### 3.1 顶层对象

必须包含 `records` 与 `categories` 两个数组（`importJSON` 校验条件，缺任一即失败）。允许省略其他所有键。

```json
{
  "records": [ ... ],
  "categories": [ ... ]
}
```

### 3.2 `records[]` — 消费流水

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `id` | string | ✅ | 唯一。生成规则见 §3.4 |
| `amount` | number | ✅ | **正数**（支出）。禁止字符串 `"300"`；禁止负数；两位小数以内 |
| `categoryId` | string | ✅ | 必须是 §4 分类表中**已存在**的 id（含本次新建的分类） |
| `date` | string | ✅ | 格式 `YYYY-MM-DDTHH:MM:SS`（示例 `2026-08-05T12:00:00`）。日期从文本提取；无日期时用「今天」 |
| `note` | string | 否 | 原始条目描述；非 RM 金额的币种说明写这里 |
| `tags` | string[] | 否 | 可省略或用 `[]`；文本无标签不编造 |
| `excludeFromAvg` | boolean | 否 | 仅当文本明确表示「不计入日均」（如一次性大额）才设 `true`，否则 `false` 或省略 |
| `createdAt` | string | ✅ | ISO 时间 `YYYY-MM-DDTHH:MM:SS.sssZ`（生成时刻） |

### 3.3 `categories[]` — 分类

仅当需要**新建分类**时才出现（默认分类表已含绝大多数场景）。

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `id` | string | ✅ | 唯一；风格 `cat-ai-<数字>`，如 `cat-ai-1001` |
| `name` | string | ✅ | 中文名 |
| `icon` | string | ✅ | 单个 emoji |
| `color` | string | ✅ | 与父分类颜色一致（见 §4 颜色表） |
| `parentId` | string | ✅ | 挂到 §4 中合适的根分类 id；无法归类时挂 `cat-root-8`（其他） |
| `sortOrder` | number | ✅ | 同级最后一个子分类的序号 + 1 |

### 3.4 id 生成规则（记录）

模仿 app 的 `uuid()`（`Date.now().toString(36) + Math.random().toString(36).substr(2,6)`）：
- 形如 `lzk3ab1c2d3`（小写字母+数字，约 10-13 位）
- 批量生成时用时间戳变化 + 随机后缀区分，保证不重复
- 简单做法：`Date.now().toString(36)` + 6 位随机，逐条递增毫秒

---

## 4. 分类规则

### 4.1 默认分类表（8 根分类，id 固定，不可改）

| 根 id | 名称 | 图标 | 颜色 | 子分类 |
|---|---|---|---|---|
| `cat-root-1` | 餐饮 | 🍜 | `#6366F1` | 早餐 `cat-child-1-1` 🥐 / 午餐 `cat-child-1-2` 🍱 / 晚餐 `cat-child-1-3` 🍽️ / 饮料咖啡 `cat-child-1-4` ☕ |
| `cat-root-2` | 交通 | 🚗 | `#10B981` | 油费 `cat-child-2-1` ⛽ / 停车 `cat-child-2-2` 🅿️ / 公交地铁 `cat-child-2-3` 🚇 / 打车 `cat-child-2-4` 🚕 |
| `cat-root-3` | 购物 | 🛒 | `#F59E0B` | 日用品 `cat-child-3-1` 🧴 / 服饰 `cat-child-3-2` 👕 / 电子产品 `cat-child-3-3` 📱 |
| `cat-root-4` | 娱乐 | 🎮 | `#EF4444` | 电影 `cat-child-4-1` 🎬 / 游戏 `cat-child-4-2` 🎯 / 运动 `cat-child-4-3` ⚽ |
| `cat-root-5` | 居住 | 🏠 | `#8B5CF6` | 房租 `cat-child-5-1` 🏢 / 水电 `cat-child-5-2` 💡 / 网络 `cat-child-5-3` 📶 |
| `cat-root-6` | 医疗 | 💊 | `#EC4899` | 看病 `cat-child-6-1` 🏥 / 药品 `cat-child-6-2` 💊 |
| `cat-root-7` | 教育 | 📚 | `#14B8A6` | 书籍 `cat-child-7-1` 📖 / 课程 `cat-child-7-2` 🎓 |
| `cat-root-8` | 其他 | 📦 | `#F97316` | （无子分类） |

### 4.2 归类启发式

- 商户/关键词 → 子分类优先，再根分类：
  - 火锅/烧烤/外卖/餐厅 → 晚餐或午餐（看时间）；小吃/奶茶 → 饮料咖啡
  - grab/grabcar/打车/滴滴 → `cat-child-2-4`；油费/打油 → `cat-child-2-1`；TNG/过路费 → 交通根分类
  - 超市 → 日用品；淘宝/网店服饰 → 服饰
  - 网课/学费/报班 → 课程（新建或 `cat-child-7-2`）
- 无法确定子分类 → 用根分类 id（允许记录挂在根分类）
- 完全无法归类 → `cat-root-8`（其他）

### 4.3 自动新建分类规则

1. 仅在默认表无合适分类时新建（如「网课」「宠物」「旅行」等根级新类目）
2. 新分类挂到语义最接近的根分类下；若现有 8 根都不合适，新建根分类：`parentId: null`，`sortOrder: 8`
3. 颜色：新分类沿用父分类颜色；新建根分类按 `COLORS` 轮转顺序取 `#06B6D4`（第 10 位，index 8 起）
   > app 内 `addCategory()` 现已强制执行同一规则（有 `parentId` 就继承父级颜色），但**导入走的是 `importJSON`，不经过 `addCategory`**，所以导入文件里的 `color` 仍是必填，不会被自动补上。
4. 一个文本批次中，同一新分类只建一次（按 name 去重）
5. 若用户说「分类表以我的为准」或提供了分类清单 → 以用户清单为准，不套用默认表

---

## 5. 文本抽取规则

1. **逐条拆分**：按日期/金额/换行切分条目；一句话多条（「火锅300，奶茶12.5」）拆成两条
2. **金额识别**：`(\d+(\.\d{1,2})?)` 或 `RM\d+`；优先取 `RM/¥/$/€` 等货币符后数字；多数字时取与语义最匹配的（商户+金额配对）
3. **日期识别**：
   - `8/5`、`8-5`、`8月5日` → 当年对应月日 → `YYYY-MM-DDT12:00:00`
   - 「今天/昨天/前天」→ 相对今天推算
   - 连续条目只写一次日期 → 后续条目沿用（直到新日期出现）
   - 完全无日期 → 用今天，并在交付说明中列出「日期为今天」的条目
4. **币种**：RM 直接记录；其他币种按 1:1 记录金额并在 note 注明（§3.2 note 规则）
5. **不推断**：文本未提到的信息（标签、excludeFromAvg）一律不编造
6. **模糊处理**：金额/日期有歧义 → 取最合理解释；实在无法判断的条目，**跳过**并列入交付说明「无法识别」清单，不要猜

---

## 6. 生成步骤（AI 执行顺序）

1. 读取文本，按 §5 逐条抽取 → 得到条目表 `[商户, 金额, 日期, 备注]`
2. 每条按 §4 归类 → 确定 `categoryId`（记下需要新建的分类）
3. 新建分类：按 §4.3 生成 `categories[]`
4. 生成 `records[]`：每条生成 id（§3.4）、`amount`（number）、`date`（`YYYY-MM-DDTHH:MM:SS`）、`note`、`tags: []`、`excludeFromAvg: false`、`createdAt`（ISO）
5. 组装顶层对象 `{ records, categories }`（categories 无新建时为 `[]`；**替换模式**时须输出 §4 全部默认分类 + 新建分类）
6. 按 §7 自检
7. 交付：把 JSON 写入项目目录（如 `budget-import-2026-08-12.json`），并把结果汇总给用户

---

## 7. 自检清单（交付前逐项核对）

- [ ] `records` 与 `categories` 两个键都存在
- [ ] 每条 record：`amount` 是 number 且 > 0；`date` 匹配 `YYYY-MM-DDT..`；`categoryId` 在分类表（默认+新建）中存在
- [ ] 所有 `id` 唯一
- [ ] 新建分类的 `parentId` 引用已存在根分类
- [ ] 每条都有 note（原始描述）；币种换算已在 note 注明
- [ ] 未编造 tags / excludeFromAvg / 用户未提的信息
- [ ] JSON 可被 `JSON.parse` 解析（无尾逗号、无注释、无单引号）
- [ ] 无法识别的条目已列入交付说明，未强猜

---

## 8. 用户导入步骤（交付时告知用户）

1. 打开 app → 「设置」
2. 数据管理 → 「导入 JSON」
3. 选择生成的 `.json` 文件
4. **优先选「🔀 合并到当前数据」**（保留现有数据与默认分类表，推荐）
5. **「🔄 替换当前数据」仅在完全重开时使用**：replace 模式执行的是 `this._data = data`，即用文件内容**整体覆盖**整个数据对象。文件里没有的键**全部消失**，不只是分类：

   | 丢失的内容 | 键 |
   |---|---|
   | 29 个默认分类（已有流水会变「未知分类」） | `categories` |
   | 预算 / 分类预算 / 月收入 / 储蓄目标 | `budgets` `categoryBudgets` `monthlyIncome` `savingsTarget` |
   | 固定账单分类与金额 | `billCategories` `billAmounts` |
   | **分摊账单与联系人（含已还金额）** | `splitBills` `contacts` |
   | **大额分期消费计划（含手动干预记录）** | `purchasePlans` |
   | 标签与标签颜色、假设分析参数 | `allTags` `tagColors` `whatIfParams` |

   本规范生成的文件按定义只含 `records` + `categories`，**因此用它做 replace 必然清空以上全部内容**。除非用户明确表示要清空重来，否则**一律交付合并模式文件**；即使用户要求替换，也要先口头确认这些数据会被清掉，并至少输出 §4 完整分类表（全部 29 个默认分类 + 新建分类）。
6. 导入成功后刷新页面检查流水/统计
7. 如提示「文件格式无效」→ 检查 §3 字段规则后重新生成

> 注：
> - `importJSON` 合并模式只追加 `records`（按 id 不查重，重复导入会重复记录），导入前请确认
> - 合并模式中，**新建分类不会污染现有数据**（按 id 去重，已有分类被跳过）
