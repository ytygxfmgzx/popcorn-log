# 🍿 popcorn-log · 观影手账

以**家庭**为单位的观影记忆手账——记录全家陪伴时光与孩子的童言童语，而非单纯的打卡工具。

**PWA 形态**：网页即应用，iPhone / Android「添加到主屏幕」后拥有独立图标、全屏体验，免上架商店、免开发者账号。数据存于手机本地（离线可用、零延迟），联网时经你自己部署的 Cloudflare Worker 与免费影片库（TMDB）联动。

## 功能（按交付阶段）

| 功能 | 阶段 | 状态 |
|---|---|---|
| 观影手账录入（零输入：搜片后影片信息自动填充） | MVP | ✅ |
| 手账时间线、详情、编辑、删除（本地与云端物理删除） | MVP | ✅ |
| 海报本地永久缓存（加载一次，离线可用） | MVP | ✅ |
| 家庭成员 / 常用地点自定义 | MVP | ✅ |
| 本地数据导出 JSON 备份 | MVP | ✅ |
| PWA 离线 + 新版本提示 | MVP | ✅ |
| 云端双人协同同步（Worker+R2 默认 / S3 直连高级，多端一致、冲突处理、疑似重复软合并） | Sync | ✅ |
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
   └─ /sync/*  → R2 对象存储（云同步，Cloudflare 内部绑定，零密钥零 CORS）
```

为什么需要 Worker：① TMDB 在大陆无法直连，Worker 海外出口不受限；② 云同步默认把数据存进同账号的 R2 对象存储（Worker 经内部绑定读写，无 CORS 问题、存储密钥不出服务端）。

## 准备工作（一次性）

你需要准备 4 个免费账号/资源，全程约 30 分钟：

| 资源 | 用途 | 获取方式 |
|---|---|---|
| GitHub 账号 | 托管本仓库、自动构建 | [github.com](https://github.com) 注册 |
| Cloudflare 账号 | 部署 Pages + Worker | [dash.cloudflare.com](https://dash.cloudflare.com) 注册（无需绑卡） |
| TMDB API Key | 影片搜索/信息/海报 | 见下方「申请 TMDB Key」 |
| 云存储（云同步用） | 观影数据云端同步 | **默认方式不需要**（用你 Cloudflare 账号的 R2，免费 10GB）；选「直连 S3」高级方式才需要（阿里 OSS / 腾讯 COS 等） | 无需额外注册 |

### 申请 TMDB API Key（免费）

1. 打开 [themoviedb.org](https://www.themoviedb.org) 注册账号（**注册页可能需要临时开代理**，之后使用均经你自己的 Worker，无需代理）。
2. 登录后进入 **Settings → API**（或直接访问 `https://www.themoviedb.org/settings/api`）。
3. 点击 **Request an API Key**，选择 **Developer** 类型，用途随便填家庭自用工具即可。
4. 记下 **API Key (v3 auth)**——一串 32 位字符，这就是后面要配置到 Worker 的 `TMDB_API_KEY`。

### 云同步的两种方式（部署前先选好）

| | 方式一：Worker + R2（推荐） | 方式二：直连 S3（高级） |
|---|---|---|
| 数据存在哪 | 你 Cloudflare 账号的 R2（免费 10GB、零出口流量费） | 你自己的 S3 兼容存储（阿里 OSS / 腾讯 COS / R2 S3 API / B2…） |
| 手机上要填什么 | 一个「同步密码」 | Endpoint + Bucket + AccessKey + SecretKey 四项 |
| 存储密钥在哪 | 只在 Worker 服务端（R2 内部绑定，前端零密钥） | 每台手机本地（浏览器签名直连） |
| 额外配置 | 无 | 需在存储控制台配 CORS + 最小权限子账号 |
| 适合谁 | 所有人，尤其推荐给朋友用 | 想用已有国内存储、追求直连速度的用户 |

#### 方式一：Worker + R2（推荐）完整步骤

**服务端（部署者做一次）**：

1. **创建 R2 存储桶**（首次使用 R2 需在 Cloudflare 控制台 → **R2 Object Storage** 点击开通，免费档即可，可能要求添加付款方式作验证、不扣费）：

   ```bash
   cd worker
   pnpm exec wrangler r2 bucket create popcorn-log
   ```

2. **设置同步密码**（自拟，两台手机将填同一个；建议 12 位以上，含字母数字）：

   ```bash
   pnpm exec wrangler secret put SYNC_PASSWORD
   # 提示输入时敲入你定的同步密码，回车
   ```

3. **部署 Worker**（R2 绑定已写在 `worker/wrangler.toml`，随代码生效）：`pnpm exec wrangler deploy`
4. 自检：`curl https://<你的Worker地址>/sync/list?prefix=records/`，返回 `{"error":"服务端未设置 SYNC_PASSWORD..."}` 或 401 即为部署成功（说明 API 已就位，只是没带密码）。

**手机端（每台手机做一次）**：设置 → 云同步 → 选「默认 · Worker」→ 填同步密码 → **测试并保存**（提示"连接成功 ✅"）→ **立即同步**。

> 常见报错：401「同步密码不对」= 手机填的与 secret 不一致；503「未设置 SYNC_PASSWORD」= 服务端漏了第 2 步；503「未绑定 R2」= 桶没建或没重新部署。

#### 方式二：直连 S3（高级）完整步骤

> ⚠️ 前置认知：SecretKey 会存在每台手机本地用于签名（务必用**最小权限子账号**），且需要在存储控制台**配置 CORS**（一次性）。数据安全加分项：给桶开启**版本控制**，任何覆盖/删除都留有历史副本。

以**阿里云 OSS** 为例（腾讯 COS / R2 / B2 步骤同理，字段名略有差异）：

1. **创建 Bucket**：阿里云控制台 → 对象存储 OSS → 创建 Bucket（如 `popcorn-log`，地域选离你近的如 华东1-杭州，私有读写）。
2. **创建最小权限子账号**：控制台 → RAM 访问控制 → 用户 → 创建用户（仅 OpenAPI 调用访问）→ 为其添加**自定义权限策略**（只允许该桶的读写）：

   ```json
   {
     "Version": "1",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["oss:GetObject", "oss:PutObject", "oss:ListObjects"],
         "Resource": ["acs:oss:*:*:popcorn-log", "acs:oss:*:*:popcorn-log/*"]
       }
     ]
   }
   ```

   创建后记下 **AccessKey ID** 与 **AccessKey Secret**（只显示一次）。
3. **配置 CORS**（OSS 控制台 → 你的 Bucket → 数据安全 → 跨域设置 → 创建规则）：

   | 字段 | 填写 |
   |---|---|
   | 来源 Origin | `https://<你的Pages域名>`（如 `https://popcorn-log.pages.dev`；本地开发加 `http://localhost:5173`） |
   | 允许 Methods | `GET, PUT` |
   | 允许 Headers | `*` |
   | 暴露 Headers | `ETag` |
   | 缓存时间 | 600 |

4. **手机端**：设置 → 云同步 → 选「高级 · 直连 S3」→ 四项填写 → **测试并保存**：
   - Endpoint：`https://oss-cn-hangzhou.aliyuncs.com`（以你的地域为准，不要带桶名）
   - Bucket：`popcorn-log`
   - AccessKey / SecretKey：第 2 步的子账号密钥

> R2 直连的填法：Endpoint = `https://<账户ID>.r2.cloudflarestorage.com`（R2 控制台 overview 右侧可查），密钥用 R2 的 **Manage API Tokens** 生成的 AccessKey/Secret；CORS 在 R2 桶 Settings → CORS policy 配置。

## 本地开发

环境要求：Node.js ≥ 20、pnpm ≥ 10（`npm install -g pnpm`）。

```bash
git clone <你的仓库地址>
cd popcorn-log
pnpm install

# 1. 配置 Worker 本地密钥
cp worker/.dev.vars.example worker/.dev.vars
#    编辑 worker/.dev.vars，填入 TMDB_API_KEY=你的Key；
#    本地调试云同步再加一行 SYNC_PASSWORD=任意口令（手机「设置→云同步」填同一个值）
#    （此文件不入库）

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

2. 配置密钥（以 secret 形式存入 Cloudflare，**不进代码库**）：

   ```bash
   pnpm exec wrangler secret put TMDB_API_KEY    # 提示输入时粘贴你的 TMDB API Key (v3)
   pnpm exec wrangler secret put SYNC_PASSWORD   # 云同步密码（自拟，见「方式一」步骤 2）
   ```

3. 创建 R2 存储桶（云同步默认存储，见「方式一」步骤 1）：

   ```bash
   pnpm exec wrangler r2 bucket create popcorn-log
   ```

4. 部署：

   ```bash
   pnpm exec wrangler deploy
   ```

   输出会给出 Worker 地址，形如 `https://popcorn-log-proxy.<你的子域>.workers.dev`。

5. **自检**：浏览器打开 `https://.../health`，看到 `ok` 即部署成功。

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
3. **配置云同步**（两台手机做同样操作）：进入 **设置 → 云同步**，选「默认 · Worker」填同步密码（或选「高级 · 直连 S3」按上方方式二填写），点 **测试并保存**，提示"连接成功 ✅"后点 **立即同步**。详细步骤见上文「云同步的两种方式」。
   - 新手机/清空数据后：自动从网盘全量拉回全部记录与配置。
   - 配置前本地已有的记录：自动全部推送到网盘，无需任何手动迁移。
   - 若两边各自记了同一场（同一天同一部片），首页会出现提示，可一键软合并或选择"是两场都保留"。
4. 在 **设置 → 一起看** 添加你们家的成员（默认有"爸爸、妈妈"；配置云同步后两台手机自动共享成员与「在哪看」列表）。
5. 完成！点右下角 ＋ 记第一场电影。

### 同步是怎么工作的（了解即可，全自动）

- **本地优先**：记录永远先写手机本地（离线可用、零延迟），后台自动与云端对账；指示器显示 ✓ 已同步 / ⏳ 待同步 / ⚠️ 有冲突。
- **一事件一文件**：每场电影是云端 `records/` 下一个独立 JSON 文件（R2 对象 / S3 对象），两台手机并发记录互不覆盖，永不丢数据。
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
观影记录存在你手机本地 IndexedDB，并自动同步到你自己的云端存储（默认为你 Cloudflare 账号的 R2，每场电影一个 JSON 对象，可在 R2 控制台查看或下载，不依赖本应用也能拿走全部数据）。TMDB Key 与同步密码存 Cloudflare 环境变量（secret），不进前端代码；同步密码只存各自手机本地；Worker 无状态、不存储、不写日志。仍建议每月导出一次 JSON 备份（设置 → 本地备份）作为兜底。

**Q：TMDB 是什么？为什么搜片要注册它？**
The Movie Database，免费开放的影视数据库（类似豆瓣的公开版），提供中文片名、海报、导演、类型、简介。搜片与海报都从它获取，经你自己的 Worker 转发。

**Q：`*.pages.dev` 打不开或很慢？**
少数地区/运营商对 `pages.dev` 域名不稳定。可购买任意域名（约 ¥50/年）绑定到 Cloudflare Pages（Custom domains），或先换个网络试试。

**Q：想看电视剧/动画剧可以吗？**
可以。搜索同时支持电影和剧集（结果中标注「剧 / 电影」）。

**Q：换了手机 / 清了浏览器数据怎么办？**
在新手机上打开应用 → 配好 Worker 地址与云同步 → 点「立即同步」，全部记录与配置自动从云端拉回（数量多时自动分批，约几十秒）。

**Q：两台手机怎么保持数据一致？**
双方在设置页「云同步」填**同一个**同步密码（或同一套 S3 配置）即可。数据以"一事件一文件"形式同步到同一个云端存储，打开应用/保存记录/网络恢复时自动对账；同一条记录两边同时编辑会有冲突提示（用云端/用本机/软合并），两边同时记了同一场会有"疑似重复"提示，绝不静默丢数据。

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
│     ├─ services/         # TMDB / 海报缓存 / 云同步存储（Worker+R2 与 S3 直连双实现）/ 备份
│     ├─ sync/             # 同步引擎（对账/推送/冲突/软合并纯函数 + 触发调度）
│     ├─ db/               # Dexie（IndexedDB）schema 与读写（含云同步配置）
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

- 云同步配置（同步密码 / S3 密钥）只存各自手机本地，绝不上传、不进代码、不进备份导出
- TMDB Key 与同步密码存 Cloudflare Worker 环境变量（secret），前端与仓库内零密钥
- 默认方式下 R2 存储密钥不出服务端（Worker 内部绑定）；直连 S3 模式务必使用最小权限子账号并开启桶版本化
- Worker 无状态不存储；同步 API 仅允许 records/ 与 config.json 两种 key，密码认证 + 乐观锁防并发覆盖
- 已知取舍：/tmdb 与 /image 转发未设门禁（依赖地址私有；即使被刷爆仅当日停用、次日恢复、零费用，不涉及任何私有数据）
- 删除为物理删除：App 内删除会同时删本地与云端对象，不可恢复；在 S3/R2 控制台直接删对象，各端下一轮同步也会跟随删除本地（本地有未推送改动时不跟随，交由推送/冲突流程裁决）
- 直连 S3 模式建议开启桶版本化，误删可从对象版本找回
- 全链路 HTTPS
