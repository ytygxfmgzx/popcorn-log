# popcorn-log 产品与技术设计（全量）

> 全量设计覆盖 MVP → Sync → Enhance 三阶段；实施按阶段分轮交付。
> 视觉与交互规范见 [design-system.md](./design-system.md)（已确认稿）。

## 1. 产品概述

**家庭观影记忆手账**（popcorn-log）：以家庭为单位的观影记录 PWA。夫妻多端协作、数据私有（存于个人坚果云）、离线可用（本地优先）、影片信息自动填充（TMDB）。

三阶段：

| 阶段 | 交付 | 状态 |
|---|---|---|
| MVP | 单机记录 + TMDB 搜片联动 + 海报缓存 + JSON 备份导出 + Worker + README | 本轮 |
| Sync | 云端双人同步（etag 对账 / If-Match 冲突 / 物理删除+云端删除跟随 / 软合并）+ 基础统计 | 待启动 |
| Enhance | 想看清单 + 时间轴 + 年度总结卡 + 语音输入 | 想看清单已交付，其余待启动 |

## 2. 总体架构

```
手机 PWA（Vue3，本地优先，数据在 IndexedDB）
   │ HTTPS
   ▼
Cloudflare Pages（静态托管 web/ 构建产物，免费不限量）
   │ fetch（JSON / 图片 / WebDAV）
   ▼
Cloudflare Worker（无状态转发，免费 10 万次/天）
   ├─ /tmdb/*  → api.themoviedb.org（API Key 存 Worker secret，前端不可见）
   ├─ /image/* → image.tmdb.org（海报图片）
   └─ /dav/*   → dav.jianguoyun.com（坚果云 WebDAV，Sync 阶段启用）
```

转发层解决两个硬伤：坚果云 WebDAV 无 CORS 头（浏览器直连必被拦）；TMDB 大陆被封锁（Worker 海外出口不受限）。Worker 不存储任何数据、不写日志，数据私有性不变。

## 3. 仓库结构与技术选型

```
popcorn-log/
├─ docs/                  # 设计文档
├─ scripts/               # 辅助脚本（PWA 图标生成）
├─ web/                   # 前端 → Cloudflare Pages
│  └─ src/{pages, components, services, sync, stats, db, composables, utils, types, styles, router}
└─ worker/                # 转发层 → Cloudflare Worker
   └─ src/index.ts, wrangler.toml
```

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | Vue 3 + TypeScript（严格、禁 any） | idea.md 指定 |
| 构建 | Vite + vite-plugin-pwa | PWA 一体化 |
| UI 库 | Vant 4（全量引入，CSS 变量映射 tokens） | 移动端组件齐全；家庭自用体积无感 |
| 本地存储 | Dexie.js（IndexedDB）+ liveQuery | 响应式查询天然替代状态管理（不引 Pinia） |
| Worker | Cloudflare Worker + wrangler | 免费、无状态 |
| 包管理 | pnpm workspace | monorepo |
| 质量 | Vitest（纯函数单测）+ ESLint 9 | 核心逻辑可测 |

## 4. Worker 转发层设计

**路由**（host 白名单硬编码，无任何用户可控 host 参数，防开放代理滥用）：

| 路径 | 目标 | 规则 |
|---|---|---|
| `GET /health` | — | 200 纯文本，部署自检 |
| `/tmdb/<path>?<query>` | `https://api.themoviedb.org/3/<path>` | 透传 query；**强制覆盖 `api_key` = 环境变量 `TMDB_API_KEY`**，忽略前端传入 |
| `/image/<path>` | `https://image.tmdb.org/<path>` | 原样转发字节流 |
| `/dav/<path>` | `https://dav.jianguoyun.com/dav/<path>` | 全方法透传（PROPFIND/GET/PUT/MKCOL/DELETE/OPTIONS…）；透传请求头 `Authorization / Depth / If-Match / Content-Type / Overwrite`；透传状态码（含 412 冲突）与响应头 `ETag / Last-Modified` |
| 其他 | — | 404 |

**CORS**：OPTIONS 预检放行；所有响应附加 `Access-Control-Allow-Origin: *` 与 **`Access-Control-Expose-Headers: ETag, Last-Modified`**（同步协议依赖 JS 读取 etag）。

**凭据链路**：坚果云账号+应用密码只存各自手机 IndexedDB；前端生成 Basic Auth 头经 Worker **原样透传**（Worker 无法解 HTTPS 内容之外留存，全链路加密）。

## 5. 前端页面设计

导航：底部 Tabbar 四项（手账/想看/统计/设置），MVP 点亮手账+设置。

| 页面 | 路由 | 阶段 | 要点 |
|---|---|---|---|
| 手账首页 | `/` | MVP | 记录卡片流（watchedDate 倒序）+ FAB + SyncIndicator + EmptyState |
| 录入/编辑 | `/record/new`、`/record/:id/edit` | MVP | 零输入原则：搜片（唯一必打）→ 自动填充元数据卡 → 日期（默认今天）→ 地点三点选+自定义 → 成员勾选（记忆组合）→ 点星 → 手记/孩子原话 |
| 记录详情 | `/record/:id` | MVP | 大海报 + 全元数据 + 编辑 / 删除（Dialog 确认，物理删除本地与云端） |
| 想看清单 | `/watchlist` | Enhance（已交付） | 搜片即入列；「全部 / 待看」筛选（默认全部）；同片已有手帐显示「已看过」徽章，按钮转「再记一次」；「看过」跳录入页预填；左滑移除 |
| 影片详情 | `/movie/:mediaType/:tmdbId` | Enhance（已交付） | TMDB 元数据 + 简介 + 主演 + 同片观看轨迹直达；底部「看过了，去记录」+ 想看开关 |
| 统计 | `/stats` | Sync/Enhance | 时间窗 + 组合筛选 + 总览卡 + 榜单反查 |
| 设置 | `/settings` | MVP 起 | Worker 地址+测试连接；坚果云凭据（Sync）；成员/地点管理；导出备份；版本与更新 |
| 冲突处理 | `/conflicts` | Sync | 本地/云端对比合并；疑似重复软合并 |

## 6. 数据模型

### 6.1 领域类型（`web/src/types/`）

```ts
type MediaType = 'movie' | 'tv'   // 家庭陪娃看动画剧高频，MVP 即支持两类

interface WatchRecord {
  id: string            // uuid v4，点保存时本地生成（离线可用）
  mediaType: MediaType
  tmdbId: number
  titleSnapshot: string // 片名快照，元数据丢失也可读
  watchedDate: string   // YYYY-MM-DD 本地日期（非记录创建日，支持补记）
  location: string
  members: string[]
  rating: number | null // 1-5，可不评
  quote?: string        // 孩子原话（核心情感点）
  note?: string         // 手记
  createdAt: string     // ISO UTC
  updatedAt: string     // ISO UTC
  deleted?: boolean     // 遗留墓碑标记（旧协议数据迁移用），物理删除协议下不再写入
}

interface MovieMeta {   // TMDB 元数据本地缓存，不随事件存云端
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath?: string
  releaseYear?: number
  runtime?: number      // 分钟；tv 取单集时长
  genres: string[]      // 中文名（language=zh-CN）
  overview?: string
  director?: string     // movie=crew Director；tv=created_by[0]
  cast: string[]        // 主演前 12（统计榜单口径）
  cachedAt: string
}

interface SyncState {   // 同步底账，MVP 即写入 pending（为 Sync 平滑迁移）
  recordId: string      // 主键 = records.id
  cloudFile?: string    // records/YYYY-MM-DD_<uuid>.json
  cloudEtag?: string
  status: 'pending' | 'synced' | 'conflict'
  pendingOp?: 'create' | 'update' | 'delete'
}

interface AppSettings {
  workerUrl?: string    // 空 = 同源（开发经 vite proxy；生产填 workers.dev 域名）
  members: string[]     // 与云端 config.json 三向合并（单边删除跟随、单边新增保留），非本地独占
  customLocations: string[]  // 同上三向合并；初始预置（家里/旅行途中/影院）v2 起入库为普通数据，可删可同步进备份
  lastMembersCombo?: string[]
}

interface WatchlistItem { id: string; mediaType: MediaType; tmdbId: number; titleSnapshot: string; addedAt: string }
// 业务键 = mediaType:tmdbId；同步为 watchlist.json 整文件三向合并（同 config），无需墓碑字段
```

### 6.2 Dexie 表（`web/src/db/`）

```
records:    'id, watchedDate, updatedAt, deleted'
movies:     'tmdbId'          // 复合唯一性由 [mediaType+tmdbId] 字符串化保证（key 为 `${mediaType}:${tmdbId}`）
posters:    'posterPath'      // → Blob，加载成功永久缓存
syncStates: 'recordId'
settings:   'key'             // 'app' / 'credentials'
watchlist:  'id, addedAt'
```

### 6.3 云端目录（Sync 阶段）

```
/popcorn-log/
  ├─ records/YYYY-MM-DD_<uuid>.json   # 一事件一文件，永不互相覆盖
  ├─ members.json                     # 低频，整文件 + If-Match
  └─ watchlist.json                   # 低频，整文件 + If-Match
```

## 7. 同步协议（Sync 阶段定稿，MVP 预埋）

- **触发**：visibilitychange / 保存后 / online / 手动按钮；去抖 2s 合并；执行互斥
- **拉取**：清单（全量含分页）→ 与 syncStates diff（纯函数）→ 仅 GET 新增/变更；拉到遗留墓碑文件 → 物理清掉云端并删净本地
- **推送**：pending 逐条 PUT；update 携带 `If-Match: <本地 etag>`；`412` → 标记 conflict 人工处理；成功记录响应 etag
delete 意向（记录行已删、底账保留 cloudFile）→ DELETE 云端对象（幂等，404=成功），成功后清底账
- **冲突预防**：拉取入库遇本地 pending 同 id → 标记 conflict，绝不静默覆盖
- **云端删除跟随**：清单对账发现 synced 记录的云端文件已消失 → 物理删除本地；pending/conflict 不跟随（本地意图优先）；清单为空视为异常信号跳过（防误配桶全量误删）
- **首次全量**：>50 条分批（20/批，批间停顿）+ 429/503 指数退避（1s/2s/4s，上限 3 次）
- **重复识别**：`watchedDate 相同 + tmdbId 相同 + mediaType 相同 + 不同 id + 均未删` → 疑似重复 → 软合并弹层（保留较新主体 + 成员并集 + 手记拼接，可编辑确认）或保留两条
- **MVP 预埋**：保存/删除即写 `syncStates` pending，Sync 上线后存量数据自动待推送；diff 与去重纯函数 MVP 已实现并测试
- **想看清单对账**：`watchlist.json` 整文件三向合并（基准 = `watchlistSyncedSnapshot`，语义同 config：单边删除跟随、单边新增保留、同片两边都在取 `addedAt` 较早者）；本地脏或合并结果与云端不同才整文件 If-Match 上传，412 重拉同基准重试一次；Worker 未放行该 key 时 403 静默跳过（部署后自动恢复）；备份 v2 起 watchlist 随导出/导入（合并式，同片取较早 addedAt）

## 8. 统计引擎（Sync/Enhance）

纯本地内存聚合（毫秒级、零网络、离线可用）：records（时间窗+筛选）join movies。

- 时间窗：本周/本月/半年/1 年/自定义（基于 watchedDate）
- 筛选：成员多选（**全部在场**，且）/ 地点多选（任一命中，或）/ 类型（自动聚合自元数据，或）
- 输出：总览卡（部数/累计时长/平均评分/全家同看/成员参与榜）+ 趋势折线 + 类型分布 + 地点圆环 + 演员 TOP10/导演 TOP5
- 趋势联动：粒度随时间窗切换——本周→近 12 周、本月→近 12 个月、半年/一年/全部→按年（最近有数据的年份，≤12）；自定义按跨度自动选粒度。时间窗只决定粒度不裁剪趋势数据，条件筛选（成员/地点/类型）照常生效
- 演员仅按主演（cast 前 12）统计，客串不计；榜单按**去重影片数**计数（同一部重看不重复计），展示「看过他的 N 部」
- 榜单条目点击 → 反查记录列表（统计→回忆打通）

## 9. PWA 策略

- vite-plugin-pwa `generateSW`：precache 全部构建产物；SPA navigateFallback
- API 与图片请求不经 Service Worker（海报走 IndexedDB blob 库，只求成功一次）
- 更新策略：新 SW waiting → 顶部"发现新版本"提示条（UpdatePrompt）→ 点击刷新
- 海报仅拉 `w500` 一档入 blob 库，列表 CSS 缩放，省请求省空间

## 10. 开发环境约定

- 本地联调：`wrangler dev`（:8787，`.dev.vars` 放 `TMDB_API_KEY`）+ `vite dev`（proxy `/tmdb` `/image` `/dav` → 8787）→ **设置页 workerUrl 留空即同源，零配置**
- 生产：设置页填 Worker 的 `*.workers.dev` 地址（或自定义域名），存本地 IndexedDB
- 仓库零密钥：`.dev.vars`/`.env*` 均不入库，example 文件提供模板

## 11. 测试与质量

- Vitest 覆盖纯函数：日期（本地日期字符串、相对时间）、云端文件名、uuid、重复判定、同步 diff（Sync 阶段）、统计聚合（Sync 阶段）
- ESLint 9 + typescript-eslint + eslint-plugin-vue；`no-explicit-any: error`
- 提交前：`pnpm lint && pnpm test && pnpm build` 全绿

## 12. README 结构（面向部署使用者）

简介与功能 → 架构图 → 准备工作（坚果云应用密码/TMDB Key/Cloudflare，逐步操作）→ 本地开发 → 部署 Worker → 部署 Pages → 首次使用配置 → PWA 安装（iOS/Android）→ FAQ（额度/被墙/自定义域名）→ 数据安全 → 目录结构。
