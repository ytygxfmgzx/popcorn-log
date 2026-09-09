# 🍿 popcorn-log · 观影手账

以**家庭**为单位的观影记忆手账——记录全家陪伴时光与孩子的童言童语，而非单纯的打卡工具。

**PWA 形态**：网页即应用，iPhone / Android「添加到主屏幕」后拥有独立图标、全屏体验，免上架商店、免开发者账号。数据存于手机本地（离线可用、零延迟），联网时经你自己部署的 Cloudflare Worker 与免费影片库（TMDB）联动。

## 功能（按交付阶段）

| 功能 | 阶段 | 状态 |
|---|---|---|
| 观影手账录入（零输入：搜片后影片信息自动填充） | MVP | ✅ |
| 手账时间线、详情、编辑、删除（可恢复） | MVP | ✅ |
| 海报本地永久缓存（加载一次，离线可用） | MVP | ✅ |
| 家庭成员 / 常用地点自定义 | MVP | ✅ |
| 本地数据导出 JSON 备份 | MVP | ✅ |
| PWA 离线 + 新版本提示 | MVP | ✅ |
| 坚果云双人协同同步（多端一致、冲突处理、疑似重复软合并） | Sync | ✅ |
| 统计（时间窗/成员/地点/类型筛选、月度趋势、榜单反查） | Sync | ✅ |
| 同片观看次数（首页「第 N 次」徽章 + 详情页观看轨迹） | Sync | ✅ |
| 想看清单、演员/导演榜单、年度总结 | Enhance | 📋 规划中 |

## 架构

```
手机 PWA（Vue3，数据在本机 IndexedDB，离线可用）
   │ HTTPS
   ▼
Cloudflare Pages（静态托管前端，免费不限量）
   │
   ▼
Cloudflare Worker（无状态转发，免费 10 万次请求/天，不存任何数据）
   ├─ /tmdb/*  → api.themoviedb.org（搜片与影片信息，API Key 存 Worker，前端不可见）
   ├─ /image/* → image.tmdb.org（海报图片）
   └─ /dav/*   → dav.jianguayun.com（坚果云 WebDAV，双人同步）
```

为什么需要 Worker：① 坚果云 WebDAV 不返回 CORS 头，浏览器直连必被拦；② TMDB 在大陆无法直连，Worker 海外出口不受限。

## 准备工作（一次性）

你需要准备 4 个免费账号/资源，全程约 30 分钟：

| 资源 | 用途 | 获取方式 |
|---|---|---|
| GitHub 账号 | 托管本仓库、自动构建 | [github.com](https://github.com) 注册 |
| Cloudflare 账号 | 部署 Pages + Worker | [dash.cloudflare.com](https://dash.cloudflare.com) 注册（无需绑卡） |
| TMDB API Key | 影片搜索/信息/海报 | 见下方「申请 TMDB Key」 |
| 坚果云账号 | 观影数据云端同步（双人协同） | [jianguayun.com](https://www.jianguayun.com) 注册（免费档够用），并按下方「申请坚果云应用密码」获取应用密码 |

### 申请 TMDB API Key（免费）

1. 打开 [themoviedb.org](https://www.themoviedb.org) 注册账号（**注册页可能需要临时开代理**，之后使用均经你自己的 Worker，无需代理）。
2. 登录后进入 **Settings → API**（或直接访问 `https://www.themoviedb.org/settings/api`）。
3. 点击 **Request an API Key**，选择 **Developer** 类型，用途随便填家庭自用工具即可。
4. 记下 **API Key (v3 auth)**——一串 32 位字符，这就是后面要配置到 Worker 的 `TMDB_API_KEY`。

### 申请坚果云应用密码（免费，用于数据同步）

> 同步用的不是坚果云登录密码，而是单独生成的「应用密码」（WebDAV 协议要求，也更安全）。

1. 打开 [jianguayun.com](https://www.jianguayun.com) 注册并登录（网页版）。
2. 右上角头像 → **账户信息** → **安全选项**。
3. 找到「第三方应用管理」→ **添加应用密码**，名称随意（如 `popcorn-log`），生成后**立即复制保存**（只显示一次）。
4. 这串密码就是设置页「云同步 → 应用密码」要填的内容；账号填你的坚果云登录邮箱/手机号。

## 本地开发

环境要求：Node.js ≥ 20、pnpm ≥ 10（`npm install -g pnpm`）。

```bash
git clone <你的仓库地址>
cd popcorn-log
pnpm install

# 1. 配置 Worker 本地密钥
cp worker/.dev.vars.example worker/.dev.vars
#    编辑 worker/.dev.vars，填入 TMDB_API_KEY=你的Key（此文件不入库）

# 2. 终端 A：启动 Worker（本地转发层，端口 8787）
pnpm dev:worker

# 3. 终端 B：启动前端（端口 5173，已自动代理 /tmdb /image /dav 到 8787）
pnpm dev
```

打开 http://localhost:5173 即可。设置页「Worker 地址」**留空**表示使用同源（开发代理），无需任何配置。

> ⚠️ 本地开发注意：`wrangler dev` 的出口是你本机网络，大陆直连 TMDB 不通，**搜片功能本地需开系统代理**；部署到 Cloudflare 后走海外节点，手机使用无需任何代理。

常用命令（仓库根目录）：

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动前端开发服务器 |
| `pnpm dev:worker` | 启动 Worker 本地开发（wrangler dev） |
| `pnpm build` | 全量构建（web 类型检查 + 打包，worker 类型检查） |
| `pnpm test` | 运行单元测试（Vitest） |
| `pnpm lint` | ESLint 检查 |
| `pnpm deploy:worker` | 部署 Worker 到 Cloudflare |

## 部署（上线给家人使用）

部署分两部分：Worker（转发层）+ Pages（前端页面）。全部免费。

### 第一步：推送仓库到 GitHub

```bash
git remote add origin git@github.com:<你的用户名>/popcorn-log.git
git push -u origin main
```

建议仓库设为 **Private**（Cloudflare Pages 支持私有仓库自动构建；仓库内无任何密钥，将来公开也安全）。

### 第二步：部署 Cloudflare Worker

1. 安装/登录 wrangler（仓库内已带依赖，无需全局安装）：

   ```bash
   cd worker
   pnpm exec wrangler login   # 浏览器打开 Cloudflare 授权页
   ```

2. 配置 TMDB Key（以 secret 形式存入 Cloudflare，**不进代码库**）：

   ```bash
   pnpm exec wrangler secret put TMDB_API_KEY
   # 提示输入时粘贴你的 TMDB API Key (v3)
   ```

3. 部署：

   ```bash
   pnpm exec wrangler deploy
   ```

   输出会给出 Worker 地址，形如 `https://popcorn-log-proxy.<你的子域>.workers.dev`。

4. **自检**：浏览器打开 `https://.../health`，看到 `ok` 即部署成功。

> 将来更新 Worker 代码后，重复执行 `pnpm deploy:worker`（根目录）即可。

### 第三步：部署 Cloudflare Pages（前端）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 授权并选中 `popcorn-log` 仓库，构建配置：
   - **Framework preset**: `Vue`（或 None，均可）
   - **Build command**: `pnpm install && pnpm --filter @popcorn-log/web build`
   - **Build output directory**: `web/dist`
   - **Environment variables**（Production 与 Preview 都加）：`PNPM_VERSION = 10`（如遇构建报 pnpm 不存在，改用 Node 版本对应的内置 pnpm，或加 `npm_config_yes=true`）
3. 点 **Save and Deploy**，等待构建完成（约 1 分钟）。
4. 之后每次 `git push`，Pages 自动重新构建部署；家人手机上重新打开应用即最新版（有新版本时会弹顶部提示条）。

### 第四步：首次使用配置（每台手机各自做一次）

1. 手机浏览器打开 Pages 地址（形如 `https://popcorn-log.pages.dev`）。
2. **先做这一步再搜片**：进入 **设置 → 这里管影片资源 → Worker 地址**，填入第二步得到的 Worker 地址（如 `https://popcorn.log.riddles.top`），点 **测试连接**，提示"连接成功 ✅"即可。
   > ⚠️ 不配置 Worker 地址就搜片会报错（请求打到静态页自身，提示 JSON 解析错误或"请先填写 Worker 地址"）。每台新设备/浏览器第一次使用都要配一次（存在各自手机本地）。
3. **配置云同步**（两台手机填同一坚果云账号）：进入 **设置 → 云同步**，填入坚果云账号与应用密码，点 **测试并保存**，提示"连接成功 ✅"后点 **立即同步**。
   - 新手机/清空数据后：自动从坚果云全量拉回全部记录与配置。
   - 配置前本地已有的记录：自动全部推送到坚果云，无需任何手动迁移。
   - 若两边各自记了同一场（同一天同一部片），首页会出现提示，可一键软合并或选择"是两场都保留"。
4. 在 **设置 → 一起看** 添加你们家的成员（默认有"爸爸、妈妈"；配置云同步后两台手机自动共享成员与「在哪看」列表）。
5. 完成！点右下角 ＋ 记第一场电影。

### 同步是怎么工作的（了解即可，全自动）

- **本地优先**：记录永远先写手机本地（离线可用、零延迟），后台自动与坚果云对账；指示器显示 ✓ 已同步 / ⏳ 待同步 / ⚠️ 有冲突。
- **一事件一文件**：每场电影是坚果云 `popcorn-log/records/` 下一个独立 JSON 文件，两台手机并发记录互不覆盖，永不丢数据。
- **自动触发**：打开应用/切回前台、保存记录后、网络恢复时自动同步；也可随时手动点「立即同步」。
- **冲突不静默**：同一条记录两边同时编辑时，云端停在先保存的版本等人工裁决（用云端/用本机/软合并），任何一边的修改都不会悄悄丢掉。

### 第五步：添加到主屏幕（PWA 安装）

**iPhone（Safari）**：分享按钮（⬆️）→「添加到主屏幕」→ 确定。
**Android（Chrome）**：菜单（⋮）→「添加到主屏幕 / 安装应用」。

安装后从主屏幕图标进入：全屏无地址栏，体验如原生 App。

## FAQ

**Q：会花多少钱？**
不会。Pages 静态托管免费不限量；Worker 免费额度 10 万请求/天（家庭实际用量约 100~200 次/天，余量约 500 倍）；即使超额也只是当日停用、次日恢复，不产生费用。

**Q：我的数据存在哪？安全吗？**
观影记录存在你手机本地 IndexedDB，并自动同步到你自己的坚果云（`popcorn-log/` 目录下每场电影一个 JSON 文件，随时可在坚果云网页版查看或下载，不依赖本应用也能拿走全部数据）。TMDB Key 存在 Cloudflare 环境变量，不进前端代码；坚果云账号与应用密码只存各自手机本地，绝不上传；Worker 不存储、不写日志。仍建议每月导出一次 JSON 备份（设置 → 数据）作为兜底。

**Q：TMDB 是什么？为什么搜片要注册它？**
The Movie Database，免费开放的影视数据库（类似豆瓣的公开版），提供中文片名、海报、导演、类型、简介。搜片与海报都从它获取，经你自己的 Worker 转发。

**Q：`*.pages.dev` 打不开或很慢？**
少数地区/运营商对 `pages.dev` 域名不稳定。可购买任意域名（约 ¥50/年）绑定到 Cloudflare Pages（Custom domains），或先换个网络试试。

**Q：想看电视剧/动画剧可以吗？**
可以。搜索同时支持电影和剧集（结果中标注「剧 / 电影」）。

**Q：换了手机 / 清了浏览器数据怎么办？**
在新手机上打开应用 → 配好 Worker 地址与坚果云账号 → 点「立即同步」，全部记录与配置自动从坚果云拉回（数量多时自动分批，约几十秒）。

**Q：两台手机怎么保持数据一致？**
双方在设置页「云同步」填**同一个**坚果云账号与各自的应用密码即可。数据以"一事件一文件"形式同步到同一个坚果云目录，打开应用/保存记录/网络恢复时自动对账；同一条记录两边同时编辑会有冲突提示（用云端/用本机/软合并），两边同时记了同一场会有"疑似重复"提示，绝不静默丢数据。

## 目录结构

```
popcorn-log/
├─ docs/
│  ├─ design.md            # 产品与技术全量设计（架构/数据模型/同步协议）
│  └─ design-system.md     # 前端设计规范（色彩/字体/组件/交互）
├─ scripts/
│  └─ generate_icons.py    # PWA 图标生成（uv run --with pillow scripts/generate_icons.py）
├─ web/                    # 前端（Vue 3 + TS + Vite + Vant + Dexie + PWA）
│  └─ src/
│     ├─ pages/            # 路由页面（首页/录入/详情/冲突处理/设置）
│     ├─ components/       # 规范组件（RecordCard/MoviePicker/...）
│     ├─ services/         # TMDB / 海报缓存 / WebDAV 同步访问 / Worker 基址 / 备份
│     ├─ sync/             # 同步引擎（对账/推送/冲突/软合并纯函数 + 触发调度）
│     ├─ db/               # Dexie（IndexedDB）schema 与读写（含坚果云凭据）
│     ├─ composables/      # liveQuery 响应式封装
│     ├─ utils/            # 纯函数（日期/uuid/文件名/重复判定）+ 单测
│     ├─ types/            # 领域类型
│     └─ styles/           # design tokens / Vant 主题映射
└─ worker/                 # Cloudflare Worker 无状态转发层
   └─ src/index.ts
```

## 开发文档

- [产品与技术设计](docs/design.md)——数据模型、同步协议、三阶段规划
- [前端设计规范](docs/design-system.md)——所有 UI 迭代必须遵循的视觉/交互规范

## 数据安全设计要点

- 坚果云凭据只存各自手机本地，绝不上传、不进代码、不进备份导出
- TMDB Key 存 Cloudflare Worker 环境变量（secret），前端与仓库内零密钥
- Worker 白名单仅 3 个目标域名（TMDB API/图片、坚果云），不做开放代理
- 删除采用墓碑机制（软删除），可恢复
- 全链路 HTTPS
