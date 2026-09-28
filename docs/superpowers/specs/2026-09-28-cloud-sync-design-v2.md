# 2026-09-28 — 云端同步设计 v2（可选启用 · 端到端加密 · 旧数据零改动）

> **状态**：**已实现并上线验证（2026-09-28）**。服务端（Supabase 项目 + 迁移 SQL）与客户端（`28-cloud-sync.js` 等）均已完成；`tests/cloud-sync-test.js`（233 条）、`tests/cloud-merge-test.js`（52 条）、`tests/pin-lock-test.js`（22 条）全绿，并跑通真实 Supabase 项目的端到端验证（见 §12 阶段 3）。阶段 0 的 PIN 数据丢失 bug 已在本次一并修复。详见 [STRUCTURE.md](../../../STRUCTURE.md) §28、[docs/ai/RULES.md](../../ai/RULES.md) #21、[README.md](../../../README.md) v3.3.0 发布说明。
>
> **取代** [`2026-09-28-cloud-sync-design.md`](./2026-09-28-cloud-sync-design.md)。旧稿的多处结论被推翻（证据见附录 A），已按 RULES #14 在其顶部加取代说明并保留原文。
>
> **本稿的三条硬约束**（用户在本次对话中明确提出或批准）：
>
> 1. **旧数据不能消失，仍然要能调用** → §2.1
> 2. **支持不登录使用，与现状一致** → §2.2
> 3. **CSP 可以开白名单**：只放行同步后端这一个地址 → §2.3

---

## 0. 出处：哪些是你定的，哪些是我的默认

| 项 | 出处 |
|---|---|
| Supabase 免费版可用；每日记账不会触发 7 日暂停 | 用户（本次对话） |
| CSP 可以开白名单 | 用户（本次对话） |
| 旧数据不消失；支持不登录使用 | 用户（本次对话） |
| 保留端到端加密 | 用户（第二轮对话，明确确认） |
| Supabase 项目由 AI 用已连接的 Supabase 工具创建 | 用户（第二轮对话，明确授权）；免费档，费用 0 |
| 不再单独做「单次请求最大体积」验证 | 用户（第二轮对话）。注：同步上传的是整本账本的密文，不是单条记录；改由客户端 4MB 硬上限 + 超限提示兜底，见 §6.1 |
| R1–R7（§1） | 旧稿称「已逐条确认」，**无法从仓库核实**；沿用，请过目 |
| 恢复码方案、邀请码、PIN 用户暂不开放、手机版不参与、三方合并、3 秒防抖、云端保留 5 个历史版本、「新的盖旧的」的落地方式 | **我的默认，未经你确认** → §15 |

---

## 1. 需求与非目标

| # | 需求 | 说明 |
|---|---|---|
| R1 | 跨设备自动同步 | 记一笔，其他设备自动有 |
| R2 | 端到端加密 | 服务端只能看到密文 |
| R3 | 每人一本独立账本 | 多人使用，互不可见 |
| R4 | 冲突自动合并 | 「新的盖旧的」（落地方式见 §7.3） |
| R5 | 零成本 | 不买设备、不订阅 |
| R6 | 托管不变 | 继续用 GitHub Pages 分发 |
| R7 | MIT 开源 | 作者 + 几个朋友使用 |
| **N1** | **旧数据零丢失、仍可调用** | §2.1 |
| **N2** | **可不登录使用，与现状一致** | §2.2 |

**非目标**：实时协作 / 秒级推送；单设备吊销；邮件通知；手机版页面参与同步；把账本分享给别人；服务端理解账本内容。

---

## 2. 三条硬约束怎么落实

### 2.1 旧数据不消失（N1）

1. **数据形状零改动。** 不改 `_defaults()`、不给任何字段加时间戳、不做任何迁移。`budgetAppData` 这个键、它的结构、JSON 导出/导入格式、AI 导入规范、Excel/CSV、局域网同步、手机版页面全部照旧。旧备份 JSON 照常能导入。
2. **同步状态放在独立的 `budgetSync*` 键里**，不进账本（否则会随 `exportJSON`、局域网、Excel 泄露，见 RULES #9「新字段进 `_defaults()`」的反例）。
3. **启用同步的第一步是本机快照备份**（压缩后存独立键）。备份写不进去（配额不足）→ **中止启用**，账本不动。
4. **首次合并只做并集，绝不删除。** 本机有数据、云端也有数据时，底稿为空，三方合并退化为并集；合并前先给出汇总（本机 X 条 / 云端 Y 条 / 合并后 Z 条），你确认后才执行。
5. **任何失败都不写本机账本**：网络断、5xx、409 重试用尽、解密失败、版本回滚、格式不认识、校验全被拒。
6. **每次自动合并前留一份「合并前快照」**（只保留最近一份，覆盖式）。写不进去则跳过这次合并并提示，不硬合。
7. **云端保留最近 5 个版本。** 需要时可在设置页把某个历史版本**导出为 JSON**，再用现有「导入」功能恢复（不新造恢复通道）。
8. **关闭同步不删任何数据**：本机账本不动，云端副本保留，恢复码继续有效。「删除云端副本」是单独的、二次确认的操作。
9. **整体替换类操作要先问**（`clearAll`、`importJSON('replace')`、局域网 replace）。三方合并会把它们理解成「大量删除」并传给所有设备，所以见 §8 的 G3。
10. **PIN 用户在 P1 不开放同步入口**：现有 PIN 流程有丢数据 bug（已在另一个会话修复中），恢复码怎么与 PIN 共存要等修复方案定了再接。

### 2.2 不登录使用（N2）

- **默认状态 = 现状**：同步关闭。全新安装或从未启用过时，**零网络请求**、零定时器、不读任何同步密钥。
- **不需要账号、邮箱、密码。** 「登录」只发生在新设备上：粘贴恢复码，一步完成。
- `save()` 里只加一个守卫调用 `window.CloudSync && CloudSync.notify()`，包在自己的 try/catch 里；未启用时 O(1) 早退。`28-cloud-sync.js` 即使加载失败（`build.sh:35` 会吞掉异常），`save()` 也不受影响。
- 入口只在「设置 → 云端同步（可选）」。
- 断网、后端不可达、Supabase 项目被暂停：App 所有功能照常，只是同步状态条变红。

### 2.3 CSP 白名单

只改 `src/index.html:6`（构建产物 `index.html` 随 `build.sh` 同步）：

```
default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src https://<PROJECT_REF>.supabase.co;
```

- **只放一个地址**：不加 `'self'`，不加 `wss://`（不用 Realtime）。
- **`money-wise-mobile.html` 的 CSP 不动**（它不参与同步，最小权限）。
- 代价要说清：不是「不能离线打开」——离线照样能开能用。真正的代价是 **`default-src 'none'` 不再是「浏览器根本发不出请求」的保证**。
- 缓解：服务端**只有持有效邀请码才能创建新账本行**（§5.3）。所以即使页面出现代码注入，攻击者也无法把数据发进自己在同一主机上的账号；他能做的只是拿受害者自己的钥匙去读写受害者自己的行。
- 必须同步修改 RULES #2：「绝不引入任何外部资源」保留，加一条例外——`connect-src` 白名单一个用户自己的同步后端，仅用于用户主动启用的加密同步。

---

## 3. 架构总览

```
 设备 A                          Supabase（免费版）                    设备 B
┌─────────────────┐                                            ┌─────────────────┐
│ 28-cloud-sync.js│  POST /rest/v1/rpc/ledger_pull             │ 28-cloud-sync.js│
│  · 钥匙派生     │◄────────────────────────────────────────►  │  · 钥匙派生     │
│  · 加密/压缩    │  POST /rest/v1/rpc/ledger_push             │  · 加密/压缩    │
│  · 三方合并     │  (expected_version 对上才写)                │  · 三方合并     │
│  · 底稿 base    │                                            │  · 底稿 base    │
└─────────────────┘        sync.ledgers   sync.ledger_versions  └─────────────────┘
   页面仍由 GitHub Pages 分发（不变）      sync.invites（私有 schema，只经 RPC 访问）
```

- 前端零依赖：只用 `fetch`、`crypto.subtle`、（可选）`CompressionStream`。
- **服务端不写任何程序**：一份 SQL 迁移（三张表 + 5 个数据库函数）。旧稿的 Edge Function、自研签名登录、设备表、配对接口全部取消。
- 服务端从头到尾看不到账本内容，也看不到加密钥匙。

---

## 4. 密钥与身份

```
secret = crypto.getRandomValues(16 字节)                  // 128 位，仅此一份 = 恢复码
   ├─ authKey = HKDF-SHA256(secret, salt="budget-sync/v1", info="auth") → 32 字节   // 发给服务器认人
   └─ encKey  = HKDF-SHA256(secret, salt="budget-sync/v1", info="enc")  → AES-GCM-256（不可导出） // 永不离开设备
keyHash = SHA-256(authKey)                                 // 服务器只存这个，也是账本行的 id
```

- 全程只用 WebCrypto 原语，**不用非对称签名**。旧稿的「HKDF → ECDSA 密钥对」在 WebCrypto 里做不到（实测 `deriveKey` 不支持 ECDSA；见附录 A）。
- 服务器拿到 `authKey` 只能认人，**推不出 `encKey`**（HKDF 不同 info）。服务器泄库只泄 `keyHash`，无法冒充。
- `authKey` 只放 POST body，**绝不放 URL**（URL 会进网关日志）。
- 每条密文用**随机 12 字节 IV**。一个账本一辈子最多几万次推送，远低于同一密钥下随机 IV 的安全上限，因此不需要旧稿的「每密文随机 salt」。

**恢复码**：16 字节 → Crockford Base32 = 26 字符，加 2 字符校验（CRC-8）= **28 字符 = 7 组 × 4 字符**，如 `ABCD-EFGH-…`。解码时同时校验末位补零位。抄错一位在**粘贴阶段**就报错，而不是等到解密失败。

**存放**：`budgetSyncSecret`（localStorage）。与账本本身同等信任级别（账本也是明文放在同一处）。用户可随时在设置页查看/复制，建议存进密码管理器；**不强制打印**（浏览器做不到强制）。

**丢了恢复码**：云端副本无法解密，任何人都救不了（包括作者）。但每台设备的本地账本仍完整，可以重新启用同步。启用向导首屏必须写明这一点，勾选「我已保存」才能继续。

**没有「单设备吊销」**：所有设备共用同一把钥匙，本来就做不到（旧稿的 A17 不可能通过）。替代做法是「换码」：生成新恢复码、重新上传、删除旧云端行，其他设备重新粘贴（P3，可选）。

---

## 5. 云端（Supabase）

### 5.1 表（私有 schema `sync`，不对外暴露）

| 表 | 字段 | 说明 |
|---|---|---|
| `sync.ledgers` | `key_hash` PK、`version` int、`blob` text、`updated_at` | 当前版本 |
| `sync.ledger_versions` | `key_hash`、`version`、`blob`、`created_at` | 最近 5 个历史版本，推送时顺手裁剪 |
| `sync.invites` | `code_hash` PK、`used_at`、`used_by`、`note` | 你在后台手动加行；只存哈希 |

- 全部开启 RLS 且**不建任何 policy**（等于对 anon 全拒）。表在非暴露 schema 里，双保险。
- `version` 明文存放，同时被 AAD 绑定（§6.1），服务器谎报版本会导致解密失败。

### 5.2 五个数据库函数（`public` schema，`security definer`，`set search_path = ''`）

参数名统一带 `p_` 前缀（避免与列名 `blob`/`version` 冲突）；前端 RPC 请求体的 JSON 键就用这些名字。所有函数都返回 JSON，形如 `{"status": "...", ...}`。

| 函数 | 作用 |
|---|---|
| `ledger_pull(p_auth_key, p_known_version)` | `ok`（带 `version`、`blob`、`updated_at`）/ `unchanged` / `none`（云端没有这个账本） |
| `ledger_push(p_auth_key, p_expected_version, p_blob, p_invite)` | 见下 |
| `ledger_history(p_auth_key)` | `ok` + `versions:[{version, at}]`（当前版本 + 最多 5 个历史版本，新的在前）/ `none` |
| `ledger_fetch(p_auth_key, p_version)` | `ok` + `blob` / `none`，供导出任一保留版本 |
| `ledger_delete(p_auth_key)` | `ok` / `none`；连同全部历史版本一起删（外键级联） |

`p_auth_key` 是 64 位小写十六进制（32 字节 `authKey`）。服务端算 `key_hash = sha256(decode(p_auth_key,'hex'))`，与客户端 §4 的 `keyHash` 一致（AAD 里用的就是它）。

`ledger_push` 的规则与返回值：

1. 行不存在：`p_expected_version` 必须为 0，且带有效未使用邀请码（服务端把邀请码去掉非字母数字并转大写后取 SHA-256 比对，所以「abcd-…」的写法随意）；创建 `version=1`，并在同一事务里把邀请码标为已用。返回 `ok` / `invite_required` / `invite_invalid`；若 `p_expected_version > 0` 返回 `gone`（云端副本已被删除，客户端不得自动重传）。并发创建时后到者得到 `conflict`，且**不消耗**邀请码。
2. 行存在：先对该行加锁（`SELECT … FOR UPDATE`）再比较 `p_expected_version` 与当前版本，同一事务内写入，等价于 `UPDATE … WHERE version = expected` 的原子条件写。不相等 → `conflict` 并带当前版本，**不写入**。
3. 距上次写入不足 2 秒 → `too_fast`，不写入（防客户端 bug 空转烧额度）。
4. `p_blob`（base64 文本）超过 4 MiB（4194304 字节）→ `too_large`，不写入。
5. 写入成功（`ok`，带新 `version`）后把旧版本挪进 `ledger_versions`，只留最近 5 个。
6. 参数格式不对 → `bad_request`。

**只有 `ok` 会改动数据库。** 客户端遇到 `conflict` 走 §6.3 第 6 步；遇到 `gone` / `too_fast` / `too_large` 都不自动重试，直接在状态条提示。

- 函数只 `grant execute … to anon`，并 `revoke … from public`。
- 前端需要 `apikey` 请求头（anon key）。anon key 是公开值，与项目 URL 一样直接写进 `28-cloud-sync.js`；因为表全封，它本身不授予任何数据访问。
- 实际 SQL 见 [`supabase/migrations/20260928000000_cloud_sync.sql`](../../../supabase/migrations/20260928000000_cloud_sync.sql)。
- 内部辅助函数 `sync.invite_hash()` 与 `sync.add_invite(明文码, 备注)` 在私有 schema，anon 无权执行；你在 SQL 编辑器里用它给朋友加邀请码。邀请码明文至少 16 位字母数字（`add_invite` 会拒绝更短的）。
- 新项目里要给 anon 的 `EXECUTE` 必须**显式授予**（迁移里已写）；同时对 `public`、`authenticated` 显式撤销，`authenticated` 用不到。

### 5.3 邀请码

- 你在后台给每位朋友插一行 `sync.invites`（存哈希），把明文码私下发给对方。
- 朋友在启用向导里输入一次；之后同步只靠恢复码，不再需要邀请码。
- 这不只是防蹭额度：它让「CSP 白名单变成外传通道」这条路走不通（§2.3）。

### 5.4 免费额度与暂停（已核对官方文档）

- 免费项目**按「用户数据库活动」判不活跃，低活动 7 天会被暂停**；暂停前一周发邮件警告；暂停后 **90 天内可在控制台一键恢复**。新方案每次同步都会查一次数据库，且你每天记账，正常不会触发。
- 暂停后要**你本人**登录控制台点 Resume，朋友自救不了。设置页显示「上次成功同步」，方便发现。
- 免费档出站流量 **5GB/月**（Supabase 官方计费文档）。账本压缩后约几十到几百 KB，且只在版本变化时下载，远低于额度。
- 免费档无自动备份：所以云端只是中转站，**每台设备的本地账本才是完整副本**；再加上 5 个历史版本兜底。

### 5.5 已建好的项目与实测记录（2026-09-28）

| 项 | 值 |
|---|---|
| 项目名 / 区域 | `budget-app-sync` / `ap-southeast-1`（新加坡，与你已有的 `hackathon-demo` 同区；区域建后不可改） |
| 项目 ref | `sfwnpwchujslqfnmdyxo` |
| API 地址（也是 CSP 白名单里唯一的一项） | `https://sfwnpwchujslqfnmdyxo.supabase.co` |
| 组织 / 计划 | `xbl2602's Org` / free；创建费用 0 美元/月 |
| 客户端密钥 | 用**公开的** publishable key（`sb_publishable_…`），只放 `apikey` 请求头，**不要**放 `Authorization`。它是公开值，表全封，本身不授予任何数据访问，可以写进 `28-cloud-sync.js`；取值用 Supabase 控制台的 API Keys 页 |
| 已有项目 `hackathon-demo` | 未触碰 |

**实测（真实项目，全部通过）**：

| 项 | 结果 |
|---|---|
| anon 对 `sync` schema 的 `usage`、对三张表的 `select`、对 `sync.add_invite` 的执行 | 全部无权限；三张表 RLS 均已开启 |
| 用 anon 角色直接 `select … from sync.ledgers` | `permission denied for schema sync` |
| 推送：无邀请码 / 错邀请码 / 坏密钥 / 云端已删（expected>0）/ 正常创建 / 邀请码复用 / 重复创建 / 2 秒内连推 / 超 4MB | 依次得到 `invite_required` / `invite_invalid` / `bad_request` / `gone` / `ok` / `invite_invalid` / `conflict` / `too_fast` / `too_large`，符合 §5.2 |
| 拉取：版本未变 / 版本有变 / 账本不存在 | `unchanged` / `ok`（带密文）/ `none` |
| 连续推 8 个版本 | 历史列表 = 8,7,6,5,4,3（当前 + 5 个历史）；v2 已被裁剪，取回得 `none`；v5 取回内容正确；用过期版本号再推得 `conflict` 且当前内容不变 |
| 删除 | `ok`；之后历史为 `none`；`ledger_versions` 残留 0 行（级联删除已确认） |
| 真实 HTTPS：`POST /rest/v1/rpc/ledger_pull`，只带 `apikey: <publishable key>` | HTTP 200 `{"status":"none"}` |
| CORS 预检：`Origin: https://…github.io`、`Origin: null`（对应 `file://`），请求头 `apikey,content-type` | 均 200，`Access-Control-Allow-Origin: *`，允许 `apikey,content-type` |
| `Accept-Profile: sync` 走 REST 访问 | `PGRST106 Invalid schema: sync`（只暴露 `public`、`graphql_public`） |
| 测试数据 | 全部在事务里回滚或已删除；库里 0 个账本、0 个历史版本、0 个邀请码 |

**安全顾问（`get_advisors` security）的提示，均为设计使然、接受**：

- `rls_enabled_no_policy`（INFO）×3：`sync.ledgers / ledger_versions / invites` 开了 RLS 但不建 policy，正是「对 anon 全拒」。
- `anon_security_definer_function_executable`（WARN）×5：`ledger_pull / push / history / fetch / delete` 允许 anon 执行，这就是唯一入口；每个函数内部用 `authKey` 哈希认人，并且都固定了 `search_path`。

**尚未验证**（仍要浏览器实测，见 §12 阶段 1 的 S1）：带 CSP `connect-src` 白名单的页面，在桌面 Chrome / iOS Safari / Android Chrome / `file://` 下的 `fetch` 行为。服务器一侧的 CORS 已确认没问题。

---

## 6. 同步协议

### 6.1 密文格式

```
blob = base64( 0x01 ‖ flags(1 字节, bit0=gzip) ‖ IV(12) ‖ AES-GCM 密文+tag )
AAD  = "budget-sync/v1" ‖ keyHash(32 字节) ‖ version(uint64 大端)
```

- 明文 = 账本 JSON（紧凑格式，不用 `exportJSON` 那种带缩进的），可选 gzip（有 `CompressionStream` 才压；`23-lan-sync.js:24-30` 已有同样的特性检测）。
- **version 在服务器行里明文存放，同时进 AAD**：服务器改版本号，或把 v3 的密文挪到 v5 上，解密都会失败。这解决了旧稿「AAD 绑定 version，但 version 在密文里」的自相矛盾。
- 推送前断言 **base64 文本**的长度 ≤ 4 MiB（约合 3MB 二进制）；超过则拒绝并提示。服务端对 `p_blob` 的字节数也是同一个上限。

### 6.2 客户端状态（都在 `budgetSync*` 键，不进账本）

| 键 | 内容 |
|---|---|
| `budgetSyncSecret` | 恢复码对应的 16 字节 |
| `budgetSyncMeta` | `{ keyHash, version, lastSyncAt, lastError, enabledAt }`，`version` = 上次成功同步的版本 |
| `budgetSyncBase` | **底稿**：上次成功同步时账本的完整副本（压缩） |
| `budgetSyncBackup` / `budgetSyncBackupTime` | 启用时的快照；另有一份「合并前快照」 |
| `budgetSyncConflicts` | 最近 20 条冲突记录 |

### 6.3 一次同步（单飞：同一时刻只跑一次）

```
0. 未启用 / 账本被 PIN 锁着 / _data 为空 → 直接返回
1. pull(known = meta.version)
2. 云端 version < meta.version → 判定回滚，拒绝并提示，不写任何东西
3. local = 现在的账本；changed = 内容哈希(local) ≠ 内容哈希(base)
4. 云端 version == meta.version：
      未改 → 结束；已改 → push(local, expected = meta.version)
5. 云端 version > meta.version：
      解密 → 校验（格式/结构/schema，见 §7.5）→ remote
      merged = 三方合并(base, local, remote)        // 首次连接时 base 为空 = 并集
      G1–G6 保护闸（§8）
      写「合并前快照」→ 应用 merged → save()（带「来自同步」标记，不再触发同步）
      merged 与 remote 不同 → push(merged, expected = remote.version)
      相同 → base = remote，meta.version = remote.version
6. push 成功 → base = 刚推的明文，meta.version = 新版本
   push 返回 conflict → 回到 1，最多 3 次，仍失败则标记「稍后重试」
```

- 「内容哈希」用 SHA-256（`crypto.subtle`）算在稳定序列化（`DataStore._stableStringify`）上，**不用 `getDataHash()`**（DJB2 截 6 位字符，会碰撞）。
- **不会互相乒乓**：步骤 5 只有 `merged ≠ remote` 才推送；两台设备各自同步后内容一致，version 就不再增长（验收项 P4）。
- 单飞锁：优先 Web Locks API（`navigator.locks`），不支持则用 localStorage 时间戳锁，避免多标签页同时同步。

---

## 7. 合并：三方合并

### 7.1 为什么不用旧稿的「逐表时间戳」

`_mergeData` 只会取并集，**不记得你删过什么**（实测：A 删了一条记录和一个分类，合并 B 的旧整本后两者都回来了）。三方合并多一个信息——底稿（上次同步时的样子）——就能判断「谁改了什么、谁删了什么」，且**不需要给任何字段加时间戳，也不需要墓碑**，账本形状因此不用变。

### 7.2 规则（作用在整本账本，对每个位置递归）

| 情形 | 结果 |
|---|---|
| 两边相同 | 取该值 |
| 只有一边相对底稿改了 | 取改了的那边（包括删除） |
| 两边都改了，且是**对象** | 逐键递归合并 |
| 两边都改了，且是**字符串数组**（`allTags`、记录的 `tags`） | 当集合合并：各自的新增取并集，任何一边删的都算删 |
| 两边都改了，且是**带 id 的对象数组**（`records`、`categories`、`contacts`、`billCategories`、`splitBills`、`purchasePlans`）| 按 id 对齐，逐个元素递归；`participants` 按 `contactId`（无则按姓名）对齐 |
| **`paidAmount`**（累加器） | 底稿 + 本机增量 + 云端增量，再用 `SplitEngine.withPaidAmount` 夹回 `[0, share]` 并重算 `paid` |
| 一边删除、一边修改 | **保留修改过的**，记一条冲突 |
| 同一字段两边改成不同值 | 见 §7.3，记一条冲突 |

**显式规则**（通用规则处理不好，实现时逐条补测试）：`colorIndex` 取大、`lastActiveMonth` 取大；`savingsTarget` / `whatIfParams` / `percentBase` 冲突时取本机（无害）；`billAmounts` 是「月 → 账单 → 金额」的两层嵌套，按叶子逐个合并。

### 7.3 R4「新的盖旧的」怎么落地

同一字段两边改成不同值时：

1. 该字段所属的条目有 `updatedAt`（records、purchasePlans、splitBills）→ 取 `updatedAt` 较新的那边；
2. 没有时间戳的（categories、contacts、budgets 等）→ 取**后同步的那一边**（即当前设备）；
3. **一律记入冲突列表**，设置页能看到、能换回另一份。

`updatedAt` 只用来裁决「同一字段冲突」，**不决定条目是否存在**。所以设备时钟偏差的影响有限：最坏是一次冲突取错了边，且冲突可见、可换回。

### 7.4 派生数据收尾

- **分期记录去重**：每台设备启动时 `syncPlanRecords()`（`27-purchase-plans.js:174`）都会自动补建当月分期记录，两台设备各建一条、id 不同。合并后按 `(planId, planMonth)` 去重，保留 id 较小的一条（原型实测：不去重是 4 条，去重后 2 条）。
- 合并结果整体过一遍 `DataStore._normalize()`。三份输入都是完整账本，所以不会有「补出默认值覆盖本地」的问题（RULES #9 的那条限制针对的是合并**局部** payload）。

### 7.5 校验（不复用 `sanitizeIncoming`）

- **不复用** `23-lan-sync.js` 的 `sanitizeIncoming`：它把 `& ' " < >` 转义后**写进数据**，且不幂等——同步一圈多套一层（实测 `&amp;amp;amp;`），云同步每轮拉取都跑会让备注、分类名、联系人名逐轮恶化，不可逆。
- 云端载荷只能由持有恢复码的你自己的设备写入，与本机数据同等可信；显示时本来就 `escHtml`。所以云同步路径**只做结构校验**（复用 `validateSyncData` 的思路，校验器必须匹配 App 真实写入的格式，RULES #9），并保留「过滤了就必须让用户看见、全部被拒则中止」（RULES #9 末条）。
- 局域网同步的转义问题是**独立的既有 bug**，不在本方案范围内。

### 7.6 与 RULES #9「唯一合并实现」的关系

不新增第二个入口：三方合并作为 `DataStore._mergeData(incoming, { base })` 的**第二种模式**（传入 `base` 才启用）。**不传 `base` 时行为一字不改**，手动导入合并、局域网合并照旧（N1）。RULES #9 补一句说明。

### 7.7 已知边界（P2 必须定并测）

- **分摊账单的级联删除**：删一条分摊记录会连带删账单和它的所有关联记录（`02-datastore.js` `deleteRecord` 的级联）。若 A 删了整条链、B 同时给该账单登记了还款，「删 vs 改」会保留账单，但 A 已删的关联记录不会自动回来。规则需要定：账单因冲突保留时，同时补回它的关联记录（验收项 M9）。计划删除级联到分期记录同理。
- 一个元素两边都改了**不同字段**，按字段合并；改了**同一字段**才算冲突。

---

## 8. 危险操作与保护闸

三方合并会把「本机整体变了」理解成「大量删除」，并传给所有设备。所以：

| 闸 | 触发 | 动作 |
|---|---|---|
| **G1 空账本闸** | 要推送的账本记录数为 0，而底稿有数据，且用户没确认过「清空」 | 拒绝推送，提示 |
| **G2 大量删除闸** | 合并结果会让本机记录减少 ≥ 50%（或 ≥ 20 条） | 弹窗确认，展示将删除的数量 |
| **G3 整体替换闸** | 刚做过 `clearAll` / `importJSON('replace')` / 局域网 replace（这三处各加一行 `CloudSync.markBulk(kind)`） | 下次同步先问：「你刚整体替换了本机数据，同步会让其他设备也变成这样」——`[以本机为准并同步]` `[放弃替换，用云端覆盖本机（先备份）]` `[先不同步]` |
| **G4 回滚闸** | 云端版本 < 本机记住的版本 | 拒绝、写日志、提示 |
| **G5 结构闸** | 密文解不开 / 格式版本不认识 | 整本拒绝，**不合并** |
| **G6 配额闸** | 底稿或快照写不进 localStorage | 中止合并，提示 |

G3 的典型场景：你导入一份旧备份想「回到过去」。没有这一闸，所有设备上更新的数据都会被删掉。

---

## 9. 触发时机与状态显示

| 事件 | 动作 |
|---|---|
| `DataStore.save()` | `CloudSync.notify()`：静止 **3 秒**后同步（最长等 30 秒，避免持续编辑时一直不传） |
| App 启动（解锁后） | 延迟 2 秒后拉取 |
| 页面回到前台（`visibilitychange`） | 拉取 |
| 浏览器 `online` 事件 | 拉取 + 推送 |
| 设置页「立即同步」 | 同步 |
| 切后台 / 关页 | **尽力而为，不保证**：异步加密和 `fetch` 在页面卸载时不可靠。没传出去的改动**留在本机**，下次打开靠「本机 ≠ 底稿」自动补传（不需要额外的 dirty 标记） |

- 「内容没变就不上传」是核心：`init()` 每次启动都会 `save()`（`02-datastore.js:94`），`getNextColor()` 这种读取函数也会 `save()`，所以不能「save 即上传」。
- 设置页状态：**未启用 / 同步中 / 已同步（时间）/ 失败（原因）/ 有 N 条冲突 / 已暂停（PIN 锁定）**。`build.sh:35` 会把加载期异常吞成一行控制台错误，所以状态必须可见，不能让用户以为同步开着而它从未成功过。
- 密码学**惰性初始化**（首次使用才跑）。

---

## 10. 与现有功能的关系

| 功能 | 关系 |
|---|---|
| **PIN 锁** | P1 不开放同步。现有 PIN 流程会丢数据（`budgetAppDataEncrypted` 只在设/改 PIN 时刷新；`lockApp()` 删明文却不重新加密；`DataStore.lockData()` 在生产代码里无人调用，REFERENCE.md 的说法与代码不符），已在另一会话修复。修复方案定了之后再决定恢复码怎么与 PIN 共存（候选：用 PIN 派生的密钥加密恢复码，锁定期间暂停同步）。 |
| **局域网同步** | 不动。仍是手动、不经服务器的另一条路。 |
| **JSON 导出/导入** | 不动。导出格式不变；它同时是云端历史版本的恢复通道（§2.1-7）。 |
| **手机版页面** | 不参与同步，CSP 不动。它直接写同一个 `budgetAppData`（`money-wise-mobile.html:498`），绕过 `save()` 钩子；但三方合并只比较「现在 vs 底稿」，不依赖钩子，所以它的改动会在主 App 下次打开时被发现并带上。账本形状不变，因此不需要改动它（RULES #16）。 |
| **月份滚动 / 分期补建** | 启动时自动写数据（`21-month-rollover.js:22-30`、`syncPlanRecords()`）。会触发 `save()`，但内容哈希去重后不会白传；分期记录合并时按 §7.4 去重。 |

---

## 11. 要改动的文件

### 11.1 新增

| 文件 | 内容 |
|---|---|
| `src/js/28-cloud-sync.js` | 钥匙派生、恢复码、加密/压缩、RPC 客户端、同步调度、保护闸、设置页逻辑（IIFE，`window.CloudSync`，i18n 用 `addI18nEntries`） |
| `src/css/16-cloudsync.css` | 状态条、恢复码卡片、冲突列表（含深色模式，RULES #3） |
| `supabase/migrations/<时间戳>_cloud_sync.sql` | 三张表 + 五个函数 + RLS + 授权 |
| `tests/cloud-sync-test.js` | §13 |

### 11.2 修改

| 文件 | 改动 |
|---|---|
| `src/index.html:6` | CSP 加 `connect-src`（§2.3） |
| `src/js/02-datastore.js` | ① `save()` 末尾加守卫调用 `CloudSync.notify()`；② `_mergeData(incoming, { base })` 增加三方模式；③ `clearAll` 与 `importJSON('replace')` 调 `CloudSync.markBulk()` |
| `src/js/18-render-settings.js` | 设置页新增「云端同步（可选）」一节 |
| `src/js/23-lan-sync.js` | 仅在 replace 分支加一行 `CloudSync.markBulk('lan-replace')`。**不动 `sanitizeIncoming`** |

**不改**：`_defaults()`、`_normalize()`、任何账本字段、导出/导入、`money-wise-mobile.html`、`docs/ai-data-import-spec.md`。

### 11.3 文档同步（RULES #14 / #15 / #17）

| 文件 | 改什么 |
|---|---|
| `docs/ai/RULES.md` | #2 加 `connect-src` 例外；#9 补「`_mergeData` 增加三方模式」 |
| `docs/ai/REFERENCE.md` | 「不允许 `connect-src`」一行；「已知限制」（分摊账单/计划的合并）改为已解决；**更正「自动锁定 → lockData()」**（与代码不符） |
| `STRUCTURE.md` | 新文件一节、测试章节登记、`23-lan-sync.js` 一节的已知限制 |
| `README.md` | Features、Tech Stack 的 Sync 一行、§5「数据存储安全」与§6「数据丢失风险」（现写「不支持跨设备同步」）、免责声明补「未经审计的密码学代码」 |
| 版本号 | 非破坏性新功能，按 RULES #15 是 B 位递增（v3.3.0），AI 可自行递增；A 位不动 |

---

## 12. 分阶段实施（全部完成，2026-09-28）

### 阶段 0：先修现有 bug ✅ 已完成

PIN 解锁丢数据（设 PIN → 继续记账 → 自动锁定 → 解锁，设 PIN 之后的记录全丢）。根因：密文只在 `setPin`/`changePin` 那一刻写入，`save()` 只写明文。修复：锁定时用内存里的密钥（`DataStore._pinKey`）重新加密并**读回校验**，通过才清明文；解锁/改 PIN/关 PIN 都以内存中的最新账本为准，不再用旧密文覆盖新数据。`tests/pin-lock-test.js`（22 条）覆盖全部路径，含变异验证。云端同步与 PIN 互斥（设置页对应入口在对方开启时互相拒绝）。

### 阶段 1：单设备备份 / 恢复 ✅ 已完成

- ✅ **服务端**（§5.5）：Supabase 项目已建，迁移 SQL 已应用并实测。
- ✅ 项目 URL 与 publishable key 已填入 `28-cloud-sync.js`（`CFG.URL` / `CFG.KEY`），CSP 已加 `connect-src`。
- ✅ CSP 白名单、恢复码（生成/校验/显示）、加密上传下载、启用与关闭向导、状态条（顶栏胶囊 + 设置卡片）。
- ✅ 推送全程条件写（`expected_version`）。
- **验证（spike）结果**：
  - S1：built-in browser（Chromium 内核）在 `http://127.0.0.1` 下确认 CSP `connect-src` 放行目标域、拦截白名单外域名；`crypto.subtle`、`CompressionStream`/`DecompressionStream`、`navigator.locks` 均可用；未启用时确认零网络请求。**iOS Safari / Android Chrome / 真实 `file://` 未实机验证**——移动端 WebKit 与 `file://` 源的 `crypto.subtle` 可用性仍是残余风险，建议上线后找一台真机补测。
  - ~~S2 RPC 最大请求体~~ —— 按原计划取消；改为客户端 4 MiB 硬上限，真实服务器已验证约 4 MiB 请求体能正常到达并被拒绝（`too_large`）。
  - S3：Web Locks 可用性已在浏览器验证；jsdom 测试走的是 localStorage 锁回退路径。

**出口**：N1、N2 全部验收项通过；两台设备各自能上传下载；无网时 App 照常。

### 阶段 2：多设备合并与自动同步 ✅ 已完成

三方合并（`DataStore._merge3`）、冲突列表、分期去重、保护闸 G1–G6、全部触发时机、内容哈希去重均已实现。**出口**：§13 的 M 系列、P 系列全部通过（`tests/cloud-merge-test.js` 52 条 + `tests/cloud-sync-test.js` 内的收敛/触发器/防护用例）。真实 Supabase 项目上跑通两台 JSDOM 设备离线编辑后收敛、并发推送行锁仲裁（`conflict,ok`）、限流重试、历史版本导出、非法请求全部按预期被拒。

### 阶段 3：文档与铁律同步 ✅ 已完成

§11.3 全部条目已同步：`STRUCTURE.md`（新文件、函数地图、localStorage 键、测试章节）、`docs/ai/RULES.md`（新增 #21，#2/#9/#13 补充）、`docs/ai/REFERENCE.md`（CSP、合并、PIN、云端同步专节）、`docs/ai/README.md`、`README.md`（Features、发布说明、免责声明、技术栈、v3.3.0）。未做：换码、冲突「采用另一份」按钮——留作后续，不阻塞当前发布。

---

## 13. 验收标准

每条都要有对应断言，且必须能真的失败（先把源码改坏跑一次确认 FAIL，再改回来，RULES #19）。

### N —— 你提的两条

| # | 断言 |
|---|---|
| N1-1 | 以当前真实形状的数据为夹具（含只有 `paid` 布尔的旧分摊账单、`__split__` 伪分类记录、无 `updatedAt` 的记录与分类），加载新版且未启用同步：账本与升级前深度相等；`localStorage` 里没有 `budgetSync*`；`fetch` 调用次数为 0 |
| N1-2 | 旧 JSON 备份的导入（replace / merge）行为与升级前一致：现有测试全绿，且一条断言都不改 |
| N1-3 | 启用同步：快照备份存在且解压后等于启用前的账本；备份写失败则启用中止、账本不变 |
| N1-4 | 首次合并（两边都有数据）：合并后记录数 = |本机 ∪ 云端|，任何一方独有的记录都不丢；需确认才执行 |
| N1-5 | 网络断、5xx、409 用尽、解密失败、版本回滚、格式不认识、校验全被拒：本机账本逐字不变 |
| N1-6 | 关闭同步：账本不变、`budgetSync*` 清理、云端保留；「删除云端副本」需二次确认 |
| N1-7 | 连续推送 6 次后云端只留最近 5 个版本；导出的历史版本能被 `importJSON` 接受 |
| N2-1 | 全新安装：启动、记账、锁定/解锁、导出，全程 `fetch` / `XMLHttpRequest` / `WebSocket` 调用为 0，除现有自动锁定外没有新增定时器 |
| N2-2 | 断网 / 后端不可达 / 返回 5xx：所有功能照常，仅状态条变红 |
| N2-3 | CSP 仅新增一个 `connect-src` 源，其余不变；手机版 CSP 字符串不变 |

### M —— 合并（前 8 项已用原型验证，见附录 B）

| # | 断言 |
|---|---|
| M1 | A 删的记录 / 分类，合并 B 的旧整本后**不复活** |
| M2 | 两边各新增一条，合并后都在 |
| M3 | 两边各登记还款 50 和 30 → `paidAmount` = 80 |
| M4 | A 撤销 50、B 新收 30 → 30；A 标记还清、B 又记 30 → 封顶且 `paid=true` |
| M5 | A 删除某月计划干预 → 不复活 |
| M6 | 两台设备各自补建的分期记录合并后不翻倍 |
| M7 | 交换两边顺序，结果完全一致（交换律）；`merge(x,x,x)=x`（幂等） |
| M8 | 备注 `Tom & Jerry's <b>` 来回同步 5 圈原样不变 |
| M9 | 「删 vs 改」保留修改版并记冲突；分摊账单因冲突保留时，其关联记录一并补回 |
| M10 | `allTags` / `tagColors` / `budgets` / 嵌套的 `billAmounts` 的合并；`colorIndex`、`lastActiveMonth` 取大 |
| M11 | 合并结果再过 `_normalize()` 不变 |

### C —— 加密

| # | 断言 |
|---|---|
| C1 | 密文字节里搜不到 `records`、备注、金额等明文 |
| C2 | 密文被篡改 1 字节 → 解密失败，不产生部分数据 |
| C3 | 篡改 version（AAD）→ 解密失败 |
| C4 | 恢复码抄错一位 → 在粘贴阶段被校验拦下 |
| C5 | 恢复码往返：生成 → 编码 → 解码 → 得到同一把钥匙；`authKey` 与 `encKey` 互相独立 |

### S —— 服务端

| # | 断言 |
|---|---|
| S1 | 用 anon key 直接读写表 → 被拒 |
| S2 | 无有效邀请码创建账本 → 被拒；邀请码只能用一次 |
| S3 | `expected_version` 不匹配 → 返回 `conflict` 且不写入 |
| S4 | 两个并发推送带同一个 `expected_version` → 恰好一个成功 |
| S5 | 超过 4MB → 拒绝；2 秒内连续推送 → 拒绝 |
| S6 | `get_advisors` 无安全告警 |

### P —— 协议

| # | 断言 |
|---|---|
| P1 | 服务端回放旧版本 → 客户端拒绝并提示 |
| P2 | 关页时没传出的改动，下次启动自动补传 |
| P3 | 内容没变（含每次启动）不上传 |
| P4 | 两台设备连续同步 3 次后 version 不再增长（无乒乓） |
| P5 | G1–G6 各有一条：触发时确实拦住，确认后确实放行 |

---

## 14. 风险与残余

| 风险 | 说明 / 缓解 |
|---|---|
| **恢复码丢失 = 云端副本无法解密** | 启用向导首屏写明并要求勾选；每台设备本地账本仍完整；可重新启用 |
| **密码学由 AI 生成、无人审计** | 只用 WebCrypto 原语，不自研；C1–C5 覆盖；上线前建议找懂行的人过一遍 `28-cloud-sync.js` 的密码学部分 |
| **公开仓库是信任链的根** | 能改 `index.html` 的人能读走所有账本。这是「网页交付的端到端加密」的固有限制，启用向导要如实说明。README 自述全部代码由 AI 生成；有 push 权限的 AI 会话也在信任根里。分支保护在单人仓库里作用有限 |
| **CSP 不再是「浏览器发不出请求」的保证** | §2.3；邀请码使白名单不成为外传通道 |
| **元数据可见** | 服务端看得到同步时刻、频率、密文大小、IP；看不到内容。3 秒防抖不再做时间随机化（旧稿的 ±20 秒与「打开即最新」冲突，收益也有限） |
| **服务端回放 / 拒绝服务** | 回滚闸只对有基线的设备有效；**新设备第一次拉取无法发现旧版本**；服务端也可以直接不返回更新（冻结）。这是没有可信第三方时无法消除的 |
| **免费项目被暂停** | §5.4；账本在设备上不丢；需要你本人 Resume |
| **localStorage 配额** | 账本 + 底稿 + 快照会占用更多空间；压缩后通常几百 KB；写不进就中止（G6），不会静默降级 |
| **XSS 拿到恢复码** | 与它本来就能读走明文账本同级；服务端保留 5 个版本可回滚被覆盖的内容 |
| **Supabase 停服 / 改条款** | 数据是普通 JSON 密文，可导出迁移；同步是可选功能，关掉不影响使用 |

---

## 15. 待你确认（已全部落定）

**已回答**：

1. ✅ **端到端加密保留。**（代价：恢复码丢了，云端副本没人能解开，本机不受影响。）
2. ✅ **PIN 与同步的关系**：用户把「顺手修复 PIN + 继续推进同步」一并授权（"PIN呃。。。你直接等下顺手修复了，目前的重点依旧是云端同步，不要忘记RLS。只有登录了才能看到相关功能"）。落地为：PIN 修复见阶段 0；PIN 与云端同步**互斥**（而不是「PIN 用户暂不开放同步」）——两者都要用同一份本机明文账本做文章，互斥比阶段性搁置更彻底，且用户的原话「只有登录了才能看到相关功能」已确认「登录」= 粘贴恢复码，未登录时设置页只显示启用/登录两个入口。
3. ✅ **Supabase 项目由 AI 创建**，已建（§5.5）。
4. ✅ **RLS**：`sync` schema 三张表 RLS 全部开启、零策略，`anon` 无表权限，只能执行 5 个 `security definer` RPC；已用 `get_advisors` 核对无安全告警（用户原话强调「不要忘记RLS」）。

**按默认处理的项，均已按此落地**：邀请码由用户在后台手动加（`select sync.add_invite(...)`）；手机版页面不参与、CSP 不动；R4 按 §7.3 的方式落地；`_mergeData` 增加三方模式而不是新入口；云端保留 5 个版本；3 秒防抖；不做邮件提醒和单设备吊销；恢复码不强制打印。

---

## 附录 A：旧稿被推翻的点与证据

除标注「按文档推断」的以外，均已在真实构建产物（jsdom）或 Node WebCrypto 里实测。

| 旧稿结论 | 实际 | 新方案 |
|---|---|---|
| records 用 `_mergeData` 合并「天然安全」；A9「删除不复活」 | `_mergeData` 是并集，A 删的记录和分类合并后**都复活**；§12「不用墓碑」不成立 | 三方合并（§7） |
| 分摊 `paidAmount` 取 `max` | 50 与 30 取 `max` 得 50 不是 80；`markSplitPaid(…, false)`（`26-split-bills.js:1228`）让「撤销」是一等操作 | 增量合并（§7.2） |
| 云同步复用 `sanitizeIncoming` | 不幂等：`Tom & Jerry's <b>` 同步 3 圈变 `&amp;amp;amp;…`；局域网同步一次就已显示成字面 `&amp;`（按渲染代码推断） | 只做结构校验（§7.5） |
| 5.2「自动锁定会把 `_data` 置 null，需修 `lockData()`」 | `lockData()` 在生产代码里无调用方（唯一调用者是测试）；真实路径 `lockApp()`（`07-ui-core.js:692`）不置 null，实测 `_data` 仍完整 | 删除该补丁；改用 G1 空账本闸 |
| （顺带发现）PIN 流程 | 设 PIN 后继续记账，自动锁定再解锁，之后记的账全丢（`budgetAppDataEncrypted` 从不刷新） | 阶段 0 另会话修复 |
| HKDF 派生 ECDSA 密钥对 | WebCrypto `deriveKey` 不支持 ECDSA（Node 实测报错）；raw / 只带 `d` 的 JWK 也导入不了；手拼 PKCS#8 仅 Node 成功，浏览器未验证 | HKDF 派生双钥，不用非对称签名（§4） |
| Supabase Storage 上做 `If-Match` 条件写 | 官方 S3 兼容页给 Get/Head/Copy 列了条件操作，`PutObject` 条目里没有；原生 API 文档里只见 `upsert` 开关 | Postgres 一行 + 原子 `UPDATE … WHERE version = expected`（§5.2） |
| D2「存文件，避开 2MB 单行限制」 | 那是 Cloudflare D1 的限制，Postgres 单字段可达 GB 级 | 同上 |
| 撤销单个设备（A17） | 所有设备派生同一把钥匙，被吊销者可重新登录，不可能通过 | 取消；换码（P3） |
| CSP 的代价是「不能完全离线打开」 | `connect-src` 只管联网请求，离线照样能用；真正代价是外联屏障消失 | §2.3 如实写 + 邀请码堵住外传通道 |
| `save()` 即上传 | `init()` 每次启动无条件 `save()`（`02-datastore.js:94`，连调 3 次触发 3 次），`getNextColor()` 也会 | 内容哈希去重（§6.3） |
| 「27 个业务文件一个都不用碰」+ 手机版 | 手机版直接写同一个键（`money-wise-mobile.html:498`），绕过挂钩 | 三方比较不依赖挂钩（§10） |
| D2「不用数据库表」 vs 6.1「device 表」；`/challenge` 自动注册 vs 9.6「邀请未定」；「配对不经服务端」vs `POST /pair-code`；恢复码 26/25/27/28 字符；AAD 绑 version 但 version 在密文里 | 自相矛盾 | 已逐条消除（§4、§5、§6.1） |
| §2.1「已确认决策」 | 只有 D1 留有用户参与的痕迹，无法核实 | §0 重新标注出处 |

## 附录 B：三方合并原型的验证记录

原型在真实构建产物里驱动 App 自己的 `deleteRecord` / `applyRepayment` / `setSplitPaidAmount` / `setPlanOverride` / `syncPlanRecords` 造出「两台设备各自离线改动」，再合并。**13 项断言全部通过**，覆盖 M1–M8 与 M9 的前半（保留修改版并记冲突）。

**局限**：只覆盖 records、分摊账单、计划和备注；`colorIndex`、`lastActiveMonth`、`allTags`、`tagColors`、嵌套 `billAmounts` 等显式规则，以及 M9 的「补回关联记录」尚未实现；它不是正式代码。原型脚本在会话临时目录里（不在仓库），场景已写入 §13，实现时会成为真正的测试。
