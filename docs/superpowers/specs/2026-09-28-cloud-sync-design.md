# 2026-09-28 — 云端同步设计（端到端加密，跨设备自动同步）

> ## ⚠️ 本稿已被取代（2026-09-28）
>
> 本设计的多处结论已被推翻，由 [`2026-09-28-cloud-sync-design-v2.md`](./2026-09-28-cloud-sync-design-v2.md) 取代。
> 被推翻的包括：「records 用 `_mergeData` 合并天然安全」（实测删除会复活）、「`paidAmount` 取 `max`」
> （50 与 30 得 50 而非 80）、「复用 `sanitizeIncoming`」（不幂等，逐轮叠加转义）、5.2 的前提
> （`lockData()` 无生产调用方，真实路径 `lockApp()` 不置 null）、「HKDF 派生 ECDSA 密钥对」（WebCrypto
> 做不到）、Storage 上的 `If-Match` 条件写等，证据见 v2 附录 A。
> 下文保留为当时的记录，**不要按本稿实现**。

> **状态**：设计稿，待用户审阅。**尚未写任何实现代码。**
>
> **本设计经过一次红队对抗评审**，评审推翻了初稿的 6 项 blocker。本文第 5 节记录了
> 全部 6 项、以及初稿为什么错。初稿中「`_mergeData` 可原样复用」「整本上传最简单」
> 「Cloudflare 免费额度是选型依据」三条已被推翻，不要再看初稿结论。
>
> **本设计会打破项目的两条既有不变量**（`docs/ai/RULES.md` 规则 #2「绝不引入任何外部
> 资源」与 `README.md:64`「不支持跨设备同步」）。这需要用户明确批准，见第 10 节。

---

## 1. 背景

### 1.1 项目现状

个人记账应用，MIT 开源，作者自述不具备专业软件开发背景，全部代码由 AI 生成、未经人工安全审计（`README.md:40`）。

- 零依赖单 HTML 文件，1,047,174 字节。`src/js/` 27 个文件（各包在 IIFE 内），`src/css/` 15 个
- 存储：浏览器 `localStorage`，单个 key `budgetAppData`（`02-datastore.js:202`）
- 加密：可选 PIN 锁，PBKDF2-SHA256 **100,000 次** + 16 字节随机 salt → AES-GCM-256、12 字节 IV（`02-datastore.js:941-1050`）
- 构建：`bash build.sh` 把 `src/` 拼成 `index.html`。测试跑在**构建产物**上（jsdom），`npm i --no-save jsdom`
- 托管：GitHub Pages，MIT 公开仓库
- 现有同步：`23-lan-sync.js`（36,991 字节，WebRTC P2P，SDP 手动复制粘贴）；JSON 导出/导入

### 1.2 问题

现有两条同步路径都要求**用户充当中间人**：

| 路径 | 用户要做什么 |
|---|---|
| JSON 导出/导入 | 导出 → 传到另一台设备 → 导入 |
| 局域网 WebRTC | 两台设备同时开机 + 手动复制粘贴 SDP offer/answer |

作者的评价是「太过依赖用户了，并不自然」，想要「本来就应该这样」的效果：记一笔，其他设备自动有。

### 1.3 需求（已与用户逐条确认）

| # | 需求 | 说明 |
|---|---|---|
| R1 | 跨设备自动同步 | 无需手动操作，打开即最新 |
| R2 | 端到端加密 | 服务端只能看到密文 |
| R3 | 每人一本独立账本 | 多人使用，互不可见 |
| R4 | 冲突自动合并 | 新的盖旧的 |
| R5 | 零成本 | 不买设备、不订阅 |
| R6 | 托管不变 | 继续用 GitHub Pages 分发链接 |
| R7 | MIT 开源 | 作者 + 几个朋友使用 |

### 1.4 为什么必须有一个服务器

两台设备不同时在线时，需要有地方暂存数据。R1（自动）与「不同时在线」共同要求服务端存在。
唯一的例外是要求两台设备同时在线——那正是现有局域网同步，属于用户已否决的方案。

---

## 2. 决策记录

### 2.1 已确认决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | **用 Supabase 免费版**，不选 Cloudflare | 初稿推荐 Cloudflare，理由是「免费版不会 7 天闲置停机」。用户指出账本每天记录 → 不会闲置停机，该理由不成立。撤回。 |
| D2 | **存储用 Supabase Storage（存文件），不用数据库表格** | 整本账本加密后是一个不透明字节流，没有可查询的结构。存文件比建表简单，且无单行大小限制（初稿选 Cloudflare D1 时撞上 2MB 单行上限，见 5.4） |
| D3 | **整本账本整体上传，不做增量** | 账本体积（几百 KB）小于页面本身（1MB），用户感知不到。整本上传使合并逻辑可整块复用 |
| D4 | **密钥即身份**：不设密码、不强制邮箱 | 见 3.1。**邮箱降级为可选的新设备登录提醒**，不是被否掉的方案（初稿此处论证有误，见 5.5） |
| D5 | 复用 `_deriveKey` / `HKDF` 的思路，不引入任何前端库 | 保持零依赖。`crypto.subtle` 是浏览器内置 |
| D6 | 冲突策略用「时间戳新者胜」，但**逐表分类** | `_mergeData` 里混了三种语义，不能整体复用。见 4.3 |
| D7 | 密钥分发用**复制粘贴优先**，二维码作为可选项 | 二维码编码器要 300+ 行才能正确实现，对一个「零依赖」项目不划算。粘贴 27 字符比手抄 27 字符的出错率低一个数量级 |
| D8 | 免费版无自动备份（PITR）**接受** | 账本存在于用户的每一台设备上，云端只是中转站而非唯一副本。云端丢失可从任一设备重建。这是本地优先设计的固有优势 |

### 2.2 待用户确认的决策

见第 9 节。这些不确认无法进入实现。

### 2.3 已被推翻的初稿决策（保留记录）

| 初稿结论 | 现状 |
|---|---|
| 「`_mergeData` 一行都不用改逻辑」 | **错**。它混了三种语义，其中两种在云同步下不安全。见 4.3 |
| 「splitBills/purchasePlans 改成新者胜，5 行搞定」 | **错**。分摊还款是累加器，整对象覆盖会静默吞钱。见 5.3 |
| 「整本存一行最简单」 | **错**（在 Cloudflare D1 上）。D1 单行上限 2MB，官方文档确认。改用 Storage 后此问题消失 |
| 「Cloudflare 免费额度是选型依据」 | **错**。整本上传每次读写 1 行/次，一天 288 行，离 500 万行/日上限差 4 个数量级。行数从来不是瓶颈，拿它当卖点是找错了重点 |
| 「用『服务端无法找回密钥』否定邮箱」 | **错**。邮箱的职能是身份与通知，从来不是恢复通道。这是两个不同的问题 |
| 「改动清单：2 个文件各改 3-5 行 + 3 个新文件」 | **不完整**。漏了 CSP、`schemaVersion`、数据清洗复用、`.gitignore` 防护、5 处文档同步 |

---

## 3. 架构

### 3.1 总览

```
   设备 A（电脑）                    Supabase                    设备 B（手机）
┌──────────────────┐                                    ┌──────────────────┐
│ 28-cloud-sync.js │                                    │ 28-cloud-sync.js │
│                  │   GET  /ledger                      │                  │
│  save() ─────┐   │◄───────────────────────────────────┐│  save()           │
│              │   │                                    ││                  │
│  快照队列 ◄──┘   │   PUT  /ledger  (If-Match: v)       │  快照队列         │
│      │       │   │───────────────────────────────────►│      │           │
│      ▼       │   │                                    │      ▼           │
│  加密+上传   │   │   POST /challenge  (公钥)           │  加密+上传       │
│              │   │◄───────────────────────────────────►│                  │
│  解密+合并   │   │   POST /verify     (签名)           │  解密+合并       │
│  +写回 local │   │───────────────────────────────────►│                  │
│  Storage     │   │                                    │                  │
└──────────────────┘                                    └──────────────────┘
        ↑ 页面仍由 GitHub Pages 分发（不变）        ↑ 静态托管零变更
```

**前端仍零依赖**：只用浏览器内置的 `fetch()` 与 `crypto.subtle`，不引任何库。Worker 侧的密码学只在浏览器内执行，服务端不接触密钥。

### 3.2 身份与密钥

#### 密钥材料

```
accountSecret = crypto.getRandomValues(new Uint8Array(16))   // 128 位，仅此一份
        │
        ├── HKDF-SHA256(info="auth")  → ECDSA P-256 密钥对   （身份）
        │      公钥 → 上云（公开）
        │      私钥 → 永不离开设备
        │
        └── HKDF-SHA256(salt=<每份密文随机 16 字节>, info="enc")
                 → AES-GCM-256 加密密钥（随密文一同存储 salt）
```

- 选 **ECDSA P-256** 而非 Ed25519：P-256 全平台支持；Ed25519 需 Safari 17+ / Chrome 137+。理由是项目已有「现代浏览器 + 优雅降级」的基线（`23-lan-sync.js:24-30` 已为 Safari <16.4 做特性检测）
- 每个密文用**独立随机 salt**，避免跨密文的 nonce 复用风险
- AES-GCM 的 AAD 绑定 `userId + version`，使密文不能被挪到别的账号或别的版本上

#### 恢复码

```
16 字节 → Crockford Base32 → 26 字符 → 分 5 组（5-5-5-5-5）+ 2 字符校验和
```

- 校验和用 CRC-8：抄错时立即发现，而不是同步到云端才发现解不开
- **启用向导首屏必须写明**：这把码 = 全部数据，丢了没有任何人能恢复（包括作者自己）。不提供「以后再说」的跳过选项
- 建议载体：可打印为纸质卡片 + 密码管理器各存一份

#### 登录（无密码）

```
1. 客户端 POST /challenge { publicKeyJwk }
   → 服务端：userId = base64url(SHA-256(canonicalJwk))，首次见到则登记
   → 返回随机 nonce
2. 客户端用 authKey 私钥签名 nonce（ECDSA P-256 / SHA-256）
3. 客户端 POST /verify { publicKeyJwk, nonce, signature }
   → 服务端验签 → 签发 session token（localStorage 存储，到期刷新）
```

服务端从头到尾不接触 `accountSecret` 或任何对称密钥。

#### 配对新设备

```
设备 A（已有密钥）  →  设置页「添加设备」→ 生成配对码（= 恢复码的编码形式）
设备 B（全新）      →  首次打开 → 粘贴配对码 → 派生出相同密钥 → 立即可用
```

配对过程**不经过服务端**（就是传递一把钥匙）。设备 B 首启时本机是空账本，同步时从云端拉取。

#### 撤销

每个设备持有独立的 `deviceToken`（服务端登记，可单独吊销）。**但必须诚实说明**：吊销只能阻止该设备*今后*登录；若密钥已被复制走，吊销无效。这是端到端加密的固有性质，不是实现缺陷。

### 3.3 同步协议

#### 服务端数据结构

Supabase Storage：一个私有 bucket，每用户一个文件。

```
ledger/<userId>.enc        ← base64( 12 字节 IV ‖ salt(16) ‖ AES-GCM 密文 )
```

密文解包后的明文信封：

```json
{
  "schemaVersion": 2,
  "version": 42,
  "savedAt": "2026-09-28T14:03:11",
  "data": { /* 完整账本，与 exportJSON() 同构 */ }
}
```

#### 拉取

```
1. GET /ledger
2. 若服务端 version < 本机记住的最大 version  →  判定为回滚，拒绝，写审计日志，提示用户
3. 若 version == 本机最大 version            →  无变化，结束
4. 解密 → 校验 schemaVersion，不认识则整本拒绝（不合并）
5. 清洗（见 4.4）→ _mergeData() → 写回 localStorage
6. 记住 version
```

#### 推送

```
1. 快照 = save() 那一刻的账本（见 5.2，不是延迟读 _data）
2. version = 本机最大 version + 1
3. 加密 → PUT /ledger，携带 If-Match: 本机最大 version
4. 服务端条件更新：仅当服务端当前 version == If-Match 时才写入，否则 409
5. 收到 409 → 重新走「拉取 → 合并 → 重推」，最多重试 3 次
```

**条件写（If-Match）是必需的**：没有它，一台离线一周的设备回来会无条件覆盖别人一周的改动。

### 3.4 触发时机

| 事件 | 动作 |
|---|---|
| `DataStore.save()` | 快照入队，打标记 |
| 队列非空且静默 30 秒 | 上传（时间随机化 ±0~20 秒，见 4.5） |
| 页面 `visibilitychange` → hidden | 立即 flush |
| `pagehide` / `beforeunload` | 立即 flush |
| `DataStore.lockData()`（PIN 锁定） | **立即 flush**（见 5.2） |
| App 启动 + 联网 | 拉取 |
| 浏览器 `online` 事件 | 拉取 + 推送 |

**`build.sh:35` 把每个 JS 文件包在 `try{...}catch(e){console.error(...)}` 里** —— 任何加载期异常都会被静默吞成一行控制台错误。因此密码学必须**惰性初始化**（首次使用时才跑），且同步状态必须在设置页**可见**（成功/失败/进行中/未登录），不能让用户以为同步开着而它从未成功过一次。

---

## 4. 关键设计细节

### 4.1 单一挂钩点

所有账本数据只经由一个函数落盘（`02-datastore.js:197-211`）：

```js
save() {
  try {
    this._rev = (this._rev || 0) + 1;
    localStorage.setItem('budgetAppData', JSON.stringify(this._data));
    this._log('save', 'records=' + this._data.records.length);
  } catch(e) { ... showToast ... }
}
```

全仓库其余 `localStorage.setItem` 存的均为界面偏好（图表密度、主题、层级），非账本数据。云同步挂在 `save()` 之后，**27 个业务文件一个都不用碰**。

### 4.2 快照队列

```js
// 28-cloud-sync.js
const queue = [];        // 待上传的账本快照（不可变）
function markDirty(snapshot) { queue.push(snapshot); scheduleFlush(); }
```

队列里存的是**快照本身**，不是 `DataStore._data` 的引用。这一点是 5.2 那个 bug 的唯一防线。

### 4.3 合并语义：逐表分类

`_mergeData`（`02-datastore.js:694-760`）现有 3 类语义。云同步下**只有第一类安全**。

| 表 | 现有逻辑（行号） | 云同步判定 | 需要的改动 |
|---|---|---|---|
| `records` | id + `updatedAt` 新者胜（700-714） | ✅ **安全**，天然收敛幂等 | 无 |
| `allTags` | 并集（737-744） | ✅ **安全** | 无 |
| `colorIndex` | `max`（752-753） | ✅ **安全**（高水位语义） | 无 |
| `lastActiveMonth` | 取大（755-757） | ✅ **安全** | 无 |
| `budgets` | `Object.assign`（730-735） | ❌ 值是**裸数字**（`02-datastore.js:595`），无时间戳 | **要改结构** → `{ "2026-10": {"v": 3000, "ts": "..."} }` |
| `monthlyIncome` | 同上（`:561` 写裸数字） | ❌ | 同上 |
| `billAmounts` | 同上 | ❌ | 同上 |
| `categoryBudgets` | 同上，值是 `{value,type}` | ❌ | 加 `ts` 字段 |
| `tagColors` | 同上，值是颜色字符串 | ❌ 冲突无害 | 明确取「时间戳较新者」，或排除出自动合并 |
| `categories` / `contacts` / `billCategories` | 只新增 id（719-728） | ⚠️ 改名/改图标/改颜色在两台设备同时发生时会丢。**已核实这三张表完全没有 `updatedAt`** —— `updateCategory`（`02-datastore.js:470-474`）只做 `Object.assign(cat, updates)`，不写时间戳 | **必须先加 `updatedAt` 字段**再比时间戳；或保留「只新增」并由用户手动处理。**见 9.1** |
| `splitBills` | 只新增 id | ❌ **会静默吞钱**，见 5.3 | 账单级字段：`updatedAt` **已存在**（`26-split-bills.js:372`），直接比时间戳即可。参与人 `paidAmount` 是累加器，**不能用整体覆盖**，见 5.3 的专门讨论 |
| `purchasePlans` | 只新增 id | ⚠️ 混合。计划级字段：`updatedAt` **已存在**（`02-datastore.js:654`、`:679`），直接比时间戳。但 `overrides[month]` **不可用 `max`** —— 它可被删除（`02-datastore.js:677` `delete plan.overrides[month]`），删除无法用 `max` 表达 | `overrides` 需要与 9.3 同类的设计决策（操作日志式合并，或排除出自动合并） |
| `savingsTarget` / `whatIfParams` / `percentBase` | 有条件覆盖（746-749） | ⚠️ 无时间戳 | 加 `ts`；`percentBase` 冲突无害可取任一。**见 9.2** |

### 4.4 数据清洗复用

`23-lan-sync.js:276-307` 的 `sanitizeIncoming` 对所有线上数据做 XSS 清洗（`r.note`、分类 `name`/`icon`、联系人名、`splitBill` 的 `note`/`tag`/参与人名、计划的 `name`/`note`、`allTags`）。**云同步路径必须复用它。**

为什么端到端加密下还需要：只有持钥方能伪造密文，但**服务端可以选择你收到哪一份合法载荷**（回放攻击，见 5.5）。清洗是防「自己的旧密文里带毒」的最后一层。

必须把 `sanitizeIncoming` 从 `23-lan-sync.js` 提到共享位置（导出到 `DataStore` 或新建 `28-cloud-sync.js`），两条路径共用。

### 4.5 上传时机与元数据泄露

服务端从密文中看不到内容，但**能看到同步的时刻与频率**。若每笔记完就传，模式为「此人周二 14:32 有一笔」。攒批 30 秒 + 时刻随机化 ±0~20 秒后，服务端只看到「某人某时同步一次」。

坦白说明：这是**降低**元数据精度，不是消除。若要彻底消除，需要在密文内做填充（padding）——本设计不做，理由是投入产出比不划算（攻击者已知这是记账 App，量级信息价值有限）。

### 4.6 schema 版本

`_defaults()`（`02-datastore.js:38-55`）当前**没有版本字段**。两条数据入口的规范化强度还不一致：

- `importJSON` replace → 走 `_normalize()`（补全缺失键 + 清洗）
- `importJSON` merge / 局域网 → 只走 `_sanitizeEntities()`

后果：朋友的浏览器若缓存了**旧版 `index.html`**（没有 `28-cloud-sync.js`），首启会生成全新的 `accountSecret` 和一本空账本，看起来像「云端数据没了」。

措施：`_defaults()` 加 `schemaVersion`；同步载荷携带版本；不认识的版本**整本拒绝**而不是合并；设置页常驻显示「账本 ID」（即 `userId`），版本不匹配时提示重新配对。

---

## 5. 初稿的 6 项 blocker（红队评审）

以下每条都已复核到源码行。

### 5.1 CSP 拦截一切网络请求 🔴

**证据**：`src/index.html:6`（构建产物 `index.html:6`、`money-wise-mobile.html:6` 三处一致）

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
```

无 `connect-src` → 回落到 `default-src 'none'` → **所有 `fetch` 被浏览器拒绝**。

项目把这写成了明令禁止：`docs/ai/REFERENCE.md:432`「❌ 不允许 `connect-src`（AJAX / WebSocket）」、`docs/ai/RULES.md:46-51` 规则 #2「绝不引入任何外部资源…确保仍可离线打开运行」。

对照：`23-lan-sync.js` 中 `fetch`/`XMLHttpRequest`/`WebSocket` 匹配数为 **0**，只有 `RTCPeerConnection`（137、179 行）—— 现有同步能在 CSP 下工作，**正因为它一个网络 API 都没用**。

**修法**：保留 `default-src 'none'`，只放开
`connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co`，三处同步修改。同时必须改 `RULES.md` 规则 #2 与 `README.md:64`。

**后果要说清楚**：改完之后 App **不再能完全离线打开**——首次同步需要联网。这是「无服务器」与「自动同步」之间无法调和的取舍。

### 5.2 自动锁定会清空云端账本 🔴

**证据**：`02-datastore.js:1062-1066`

```js
lockData() {
  this._data = null;                                  // :1064
  localStorage.removeItem('budgetAppData');           // :1065
}
```

自动锁定默认 **5 分钟**、每 10 秒轮询（`07-ui-core.js:658` `setAutoLockTimeout`、`:673-680` `setInterval` 触发 `lockApp()`、`:692` `lockApp` 定义）。使用姿势「记一笔然后走开」正好落在这个窗口内。

初稿设计的是「`save()` 打标记 → 延迟上传」，延迟到 flush 时 `_data` 已是 `null`，`JSON.stringify(null)` === `"null"`。

**这个 bug 项目已经踩过一次并在注释里留了疤** —— `02-datastore.js:763-765`：

> `lockData() sets _data to null. Serialising that produced the string "null" — a normally-named backup file containing nothing at all.`

初稿把它从「导出出一个空备份文件」搬到了「把云端账本覆盖成 `null`」，后果从单机变成**所有设备同时清空**。

**修法**：快照在 `save()` 那一刻就入队（4.2）；`lockData()` 内强制 flush；`visibilitychange`/`pagehide` 也 flush。

### 5.3 分摊还款是累加器，整对象覆盖会静默吞钱 🔴

**证据**：`26-split-bills.js:567`

```js
const next = round2(partPaid(target) + add);
```

`applyRepayment` 先读 `partPaid(target)`（读 `p.paidAmount`，`:42-51`）再写回（唯一写入口 `withPaidAmount`，`:58-62`）。`554-556` 的注释自承「Each bill is re-read at write time so a stale preview can never push a participant past their share」。

**这是读-改-写累加器。** 两台设备各记一笔还款，整对象「新者胜」在数学上无法表示两笔——只能留一个数，另一个无声消失。下游 `getPendingSummary` / `getSplitBillUnpaid`（`:290-292`）/ `StatsEngine._splitUnpaidBetween`（`04-stats-engine.js:207-224`）全部跟着算错，**且没有报错、没有 toast、没有撤销入口，`getDataHash` 也报「正常」**。

**且项目已两次明确拒绝过这个改动**：`docs/ai/REFERENCE.md:221-223` 与 `STRUCTURE.md:784`「改这块前先想清楚冲突策略」。初稿拿 5 行翻了它。

**修法**：参与人 `paidAmount` 的合并**必须先回答 9.3**。若确认永不撤销还款 → 取 `max`（单调不减，安全的 CRDT 合并）。若要支持撤销 → 必须改成**按操作日志合并**（每次还款/撤销是一个不可变事件，合并 = 事件集合并集 + 重放），复杂度显著上升。

**`max` 的前提已经在代码里被破坏了。** `STRUCTURE.md:774-777` 描述 `setSplitPaidAmount` 时写明「也是撤销路径」—— 也就是说「把已还金额改小」这个操作**可能已经存在**。若确实如此，`max` 就是错的（撤销 = 变小，`max` 会把撤销吃掉）。**在 9.3 得到回答前，本项无法定稿。**

同构问题：`purchasePlans[].overrides`（`02-datastore.js:673-682`）同样是按月累加的人工干预，且同样**可被删除**（`:677` `delete plan.overrides[month]`）—— 所以 `max` 在这里也不成立。这是与 9.3 相同的一类问题，两个表要一起定。

### 5.4 整本存一行的容量天花板（已在 D2 规避）

初稿选 Cloudflare D1，撞上单行 2MB 上限（官方文档 `developers.cloudflare.com/d1/platform/limits/` 确认「Maximum string, `BLOB` or table row size: 2,000,000 bytes」）。localStorage 约 5MB，`exportJSON()` 用 `JSON.stringify(..., null, 2)`（`02-datastore.js:763-767`）本身还在膨胀 —— 越过约 1.5MB 后上传永久失败且无兜底。

**已通过 D2（改用 Supabase Storage 存文件）规避。** 但仍需在上传前做字节数断言并显式提示用户。

### 5.5 端到端加密只做了机密性，没做完整性/抗回滚 🔴

**证据**：`_mergeData` 全文（`02-datastore.js:694-760`）**无任何单调计数器**。`DataStore._rev`（`:201`）是每会话内存自增，且 `getDataHash` 明确排除下划线字段（`:909` `if (k.charAt(0) === '_') return;`），不能充当跨设备的可信修订号。

AES-GCM 能验证「这确实是持有者的密钥加密的」，但**验证不了「这是最新的一份」**。服务端保存 3 个月前的合法密文并每天回放 → 用户删掉的 3 个月流水全部复活，新记的账被丢弃，而同步 UI 报「成功」。

**修法**：3.3 节的 `version` 字段 + 客户端记住见过的最大 version + 拒绝更小的 + 服务端条件写。**不做这条，端到端加密只是个营销词。**

### 5.6 无条件写导致离线设备覆盖 🔴

`PUT /ledger` 若无条件覆盖，一台离线一周的设备回来会清掉别人一周的成果，而它自己那份要等下一轮才拿回来。`_mergeData` 的 records 路径虽是收敛的，但**只在两端都拿到对方全部数据时**才收敛。

**修法**：`If-Match` 条件写 + 409 重试（3.3 节）。这是 5.5 的必要配套。

### 5.7 密钥即身份的不可恢复性（产品诚实性问题）

邀请码发出即等同交出钥匙，该朋友**永久可见、无法撤销**（方案自述）。恢复码只是设置页 50 行里的一个「生成/复制」控件。

对照项目自己的免责口径：`README.md:40`「未经传统人工安全审计和专业代码审查」、`README.md:57-64` 把数据安全责任整体推给使用者。

一个由**自述不具备专业软件开发背景**的作者维护、AI 全量生成、未经审计的系统，把多年财务记录的唯一救援通道设为一个**需要手抄**的字符串。抄错一位 = 全部损失，且任何人都解不开，包括作者自己。

**这不是工程量问题，是产品诚实性问题。** 缓解方向见 3.2（校验和 + 强制打印 + 不提供跳过），但**不可逆这一点必须写在启用向导首屏**。

### 5.8 公开仓库是整个信任链的根

E2EE 的全部价值依赖「服务端看不到明文」，但持有密钥的 JS 是从**公开 MIT 仓库**分发的。能 push 到该仓库的人 = 能读到所有账本。`script-src 'unsafe-inline'` 允许任意内联脚本执行，被篡改的 `index.html` 可以在下次加载时把每台设备的 `accountSecret` 外传。

**方案漏掉的具体风险**：

1. 没把**分支保护 / 强制 review**列为同步功能的前置条件
2. **MIT 公开 = git 历史永久** —— 任何一次把开发机 localStorage 误提交进仓库都是**不可撤回**的泄露
3. 没提 `accountSecret` 绝不能进版本控制，也没提 `.gitignore` 防护或 pre-commit 检查

**措施**：启用同步前先配置仓库分支保护；`accountSecret` 加入 `.gitignore`；pre-commit 钩子扫描 `budgetAppSecret` / `accountSecret` / 私钥 JWK 等模式。

---

## 6. 要改动的文件

### 6.1 新增

| 文件 | 估算行数 | 内容 |
|---|---|---|
| `src/js/28-cloud-sync.js` | ~350 | 密钥生成/派生/恢复码/配对、加密信封、快照队列、上传下载、版本回滚检测、条件写重试 |
| `src/css/16-cloudsync.css` | ~80 | 同步状态条、恢复码卡片、设备列表、配对界面 |
| `worker/`（Supabase Edge Function） | ~120 | `POST /challenge`、`POST /verify`、`GET /ledger`、`PUT /ledger`、`POST /pair-code` |
| `supabase/schema.sql` | ~20 | Storage bucket（私有）+ device 表 |
| `tests/cloud-sync-test.js` | ~250 | 见 7.3 |

### 6.2 修改

| 文件 | 改动 | 性质 |
|---|---|---|
| `src/index.html:6` | CSP 加 `connect-src` | **打破不变量** |
| `index.html:6` | 同上（构建产物） | 随 `build.sh` 同步 |
| `money-wise-mobile.html:6` | 同上 | **破坏性**，见 9.4 |
| `src/js/02-datastore.js:38-55` | `_defaults()` 加 `schemaVersion` | **数据结构变更** |
| `src/js/02-datastore.js:149` | `_normalize()` 加旧格式迁移（裸数字 → `{v, ts}`） | **数据结构变更** |
| `src/js/02-datastore.js:197` | `save()` 末尾调 `CloudSync.markDirty(snapshot)` | 新增挂钩 |
| `src/js/02-datastore.js:1062` | `lockData()` 内强制 flush | **修数据丢失** |
| `src/js/02-datastore.js:719-728` | 5 张键值表 + 3 张 id 表改为带时间戳合并 | **改冲突语义** |
| `src/js/26-split-bills.js` | 参与人 `paidAmount` 合并取 `max` | **改冲突语义** |
| `src/js/23-lan-sync.js:276-307` | `sanitizeIncoming` 提取为共享导出 | 重构 |
| `.gitignore` | 密钥材料模式 | **安全前置** |

### 6.3 文档同步（不是可选项）

| 文件 | 位置 | 要改什么 |
|---|---|---|
| `docs/ai/RULES.md` | `:46-51` 规则 #2 | 「绝不引入任何外部资源」需加例外条款并说明理由 |
| `docs/ai/REFERENCE.md` | `:432` | 「❌ 不允许 connect-src」需修订 |
| `docs/ai/REFERENCE.md` | `:221-223` | splitBills 已知限制 → 改为已解决 |
| `README.md` | `:64` | 「数据仅存在于单一设备上，不支持跨设备同步」 |
| `README.md` | `:57-64` | 数据存储安全章节需说明云端为密文存储 + 密钥不可恢复 |
| `README.md` | `:234` | `Sync: WebRTC P2P (LAN sync, zero server)` |
| `STRUCTURE.md` | `:716`、`:784` | 同步章节与已知限制 |
| `README.md` | `:40-46` | AI 生成声明需补充「未经安全审计的密码学代码」警示 |

---

## 7. 实施计划

### 阶段 0：基础设施（不碰数据结构）

**目标**：先验证三件事 —— 门禁放开后网络通不通、加密上传下载跑不跑得通、手机浏览器能不能用。

- 放开 CSP（3 处）
- 密钥生成 / 恢复码 / 配对 UI
- 加密信封 + 快照队列 + flush 触发（`lockData` / `pagehide` / `visibilitychange`）
- Storage 上传下载，不做合并（本地为准，只做备份回传）
- 设置页显示同步状态

**出口条件**：两台设备能各自上传下载密文；自动锁定不丢数据；同步状态在 UI 可见。

### 阶段 1：合并语义

- 5 张键值表加 `ts` + `_normalize` 旧格式迁移
- `splitBills.paidAmount` 取 `max`、`purchasePlans.overrides` 按月取 `max`
- 3 张 id 表（categories/contacts/billCategories）加 `updatedAt`
- `sanitizeIncoming` 提取复用
- `schemaVersion`

**出口条件**：见 8. 验收标准。

### 阶段 2：自动同步与防回滚

- `version` 字段、客户端最大 version 记忆
- `If-Match` 条件写 + 409 重试
- 邀请码 / 设备管理 / 撤销

### 阶段 3：文档与铁律同步

第 6.3 节全部条目。

---

## 8. 验收标准

每条都要有对应断言。断言必须能真的失败 —— 加完先改坏源码验证 FAIL，再改回来（沿用 `STRUCTURE.md:923` 的既有规矩）。

| # | 断言 |
|---|---|
| A1 | 加密后的账本在 Storage 里**不含任何明文字段**（断言字节序列中搜不到 `records`、用户名、金额） |
| A2 | 密文被篡改 1 字节 → 解密抛错，不产生部分数据 |
| A3 | `lockData()` 后 flush，**上传的不是 `null`** |
| A4 | 队列非空时切后台 / 关页 → 数据已上传 |
| A5 | 恢复码抄错一位 → 校验和在配对阶段就报错，**不是**到解密才失败 |
| A6 | 两设备各记一条 → 同步后两台都有（共 2 条，不是一对一顶替） |
| A7 | **A7-1** 两设备各给同一账单登记还款 50 / 30 → 同步后 `paidAmount` == 80。**（仅当 9.3 选 C1/C2 成立；若选 C3 则改为「冲突被列出且未被自动覆盖」）** |
| A7-2 | **A7-2** 同上，但设备 B 的操作是**撤销还款**（把已还改小）→ 同步后撤销**不被吃掉**。**（仅当 9.3 选 C2；这条是 `max` 解法必须失败的反向证明）** |
| A7-3 | 设备 A 删除某月计划干预（`overrides[month]`），设备 B 未改动 → 同步后删除**不复活**。**（`max` 解法在 `overrides` 上必然失败，这条是防线）** |
| A8 | **A8-1** A 设备设 2026-10 预算 3000，B 设备设 8000（A 的编辑更晚）→ 最终 3000 |
| A9 | **A9-1** A 设备离线删除一条记录，B 在线新增一条 → 同步后 A 的删除**不复活**、B 的新增**不丢** |
| A10 | 服务端回放旧 version → 客户端拒绝并写审计日志 |
| A11 | PUT 时 `If-Match` 不匹配 → 409 → 客户端重下重合并重传，不静默覆盖 |
| A12 | schemaVersion 不认识 → 整本拒绝，**不合并** |
| A13 | 载荷含 `<img onerror>` 的 note → 清洗后无执行 |
| A14 | **A14-1** 局域网同步与云同步喂同一份脏数据，清洗结果一致 |
| A15 | PIN 锁定态下打开 App，同步不报错、不上传空数据 |
| A16 | 恢复码含校验位；配对码粘贴一次即完成，无需邮箱 |
| A17 | 吊销设备后该设备无法再 `POST /verify`，其他设备不受影响 |
| A18 | 旧格式备份（裸数字 `budgets`）导入后被迁移为 `{v, ts}`，功能不变 |

---

## 9. 未决问题（需用户确认后才能进入实现）

### 9.1 分类/联系人改名冲突

两台设备同时把同一个分类改名 / 换图标 / 换颜色。选项：

- **A1**：加 `updatedAt`，新的赢（与 records 一致）
- **A2**：保留「只新增」，冲突时列出来让用户手动选
- **A3**：分类树变更一律要求用户手动确认，不自动合并

我倾向 **A1**（与用户锁定的「新的盖旧的」一致，实现也最省）。

### 9.2 储蓄目标 / 假设分析参数冲突

`savingsTarget` / `whatIfParams` / `percentBase` 无时间戳。倾向：加 `ts`，新的赢。

### 9.3 分摊还款与计划干预的「撤销」怎么办 ⚠️ **本设计最大的未决项**

`splitBills[].participants[].paidAmount` 与 `purchasePlans[].overrides[month]` 都是**可累加、也可删除**的字段：

- `26-split-bills.js:567` `round2(partPaid(target) + add)` —— 累加
- `STRUCTURE.md:774-777` 提到 `setSplitPaidAmount`「也是撤销路径」—— 意味着传入更小的值是允许的
- `02-datastore.js:677` `delete plan.overrides[month]` —— 删除是真的删除

**因此「取 `max`」的简单解法在这两个字段上都不成立**：撤销和删除都无法用 `max` 表达。

三个选项：

- **C1 禁止撤销**：产品上取消「把已还金额改小」和「删除计划干预」两个操作 → `max` 成立，方案最简单，但**要砍现有功能**
- **C2 操作日志式合并**：每次还款/撤销是一个不可变事件存进 `repayments[]`，合并 = 事件集合并集（按 id 去重）+ 重放算出当前值 → 正确但复杂度显著上升，且要迁移现有数据
- **C3 排除出自动合并**：这两张表冲突时不自动处理，列出来让用户选 → 最诚实，但破坏「无感同步」

**我倾向 C2**（数据正确性优先，且这是唯一能同时保留撤销功能和自动同步的方案），但代价是要多写约 150 行 + 迁移。**这需要用户明确回答。**

### 9.4 手机版要不要一起支持

`money-wise-mobile.html` 与主应用**共享同一份 localStorage**，但用的是 v1 的 6 键结构。它需要：

- 同步 CSP（第 6 行）
- 决定是否支持 schemaVersion 2 的数据结构
- 决定是否支持云同步

选项：一起改 / 明确声明「手机版不支持云同步，只用主应用同步」。

### 9.5 是否批准打破「零外部资源」铁律

5.1 已说明：不放开 CSP 这件事做不了；放开后 App 不再能完全离线打开。**这需要用户明确批准修改 `RULES.md` 规则 #2 与 `README.md:64`。**

### 9.6 邀请机制

- **B（我倾向）**：主人预生成一次性邀请码发给朋友，陌生人进不来
- **A**：开放注册，各账本独立 + 加密所以互相看不见，但陌生人可消耗免费额度（需要限流）

### 9.7 恢复码的载体

纸质打印 / 密码管理器 / 两者都要？是否强制打印？

---

## 10. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| **密钥丢失 = 数据永久消失** | 高 | 校验和 + 强制打印 + 引导首屏明说不可逆 + 多设备冗余（每台设备都是完整副本） |
| 公开仓库被篡改 → 所有账本泄露 | 高 | 分支保护 + pre-commit 密钥扫描 + 启用向导复述信任边界 |
| 密码学实现有 bug（AI 生成、无人审计） | 高 | 密码学部分逐条人工评审；只用 Web Crypto 原语，不自研；A1-A18 覆盖 |
| 免费层额度耗尽 / 项目被删 | 低 | 账本在每台设备上，可从任一设备重建；5GB/1GB 远超需求 |
| Supabase 停服 | 低 | 数据格式是普通 JSON 密文，可导出迁移到别处 |
| 手机版被改动后数据不兼容 | 中 | 见 9.4 |
| 数据结构变更导致老备份失效 | 中 | `_normalize` 向后兼容迁移 + A18 |

---

## 11. 与被否决方案的对比

| 方案 | 为什么否决 |
|---|---|
| 现有 JSON 导出/导入 | 用户充当中间人，不满足 R1 |
| 现有局域网 WebRTC | 需两台设备同时开机 + 手动复制 SDP，不满足 R1 |
| Cloudflare Worker + D1 | 撞 2MB 单行上限（5.4）；且「不会闲置停机」这一选型理由已被 D1 推翻 |
| WebDAV / NAS / 坚果云 | **用户无 NAS、不愿买设备**（已确认 R5） |
| 纯 P2P / WebTorrent | 不满足「不同时离线」 |
| 逐记录增量同步 | 更精细，但需自建版本号、墓碑、增量查询；整本上传（D3）已足够，且能整块复用 `_mergeData` |
| 开放注册 + 服务端明文 | 违反 R2 |

---

## 12. 附：术语

| 词 | 含义 |
|---|---|
| 本地优先（local-first） | 读写以本地为主，云端只是副本。断网可完整使用 |
| 端到端加密 | 加密在客户端完成，服务端只见密文 |
| 快照（snapshot） | 某一时刻账本的不可变副本 |
| 条件写 / CAS | 写入时校验「我基于哪个版本改的」，版本不符则拒绝 |
| 墓碑（tombstone） | 删除标记。本设计用整本版本号替代，未使用墓碑 |
| CRDT | 无需协调即可合并的数据结构。`paidAmount` 取 `max` 即是 |
| 抗回滚 | 拒绝比已见过的更旧的数据 |
