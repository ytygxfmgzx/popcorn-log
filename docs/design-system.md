# popcorn-log 前端设计规范（Design System）

> 定稿于 2026-09-09，以 `ref/design-demo/index.html` 确认稿为准。
> 本规范是所有前端迭代的唯一视觉与交互依据；落地代码为 `web/src/styles/tokens.css` 与 `web/src/styles/vant-theme.css`。

## 1. 调性与设计原则

**暖橙奶油风**：爆米花/黄油的温暖家庭感——奶油底色 + 白卡片 + 大圆角 + 轻阴影 + 暖棕文字，像翻一本家庭相册，而不是使用一个工具。

原则：

- **情感优先**：这是记录家庭时光的手账，一切文案与视觉服务于"回忆的温度"
- **少打字**：录入零输入原则，唯一必打字段是片名搜索
- **轻量克制**：阴影只有一档、动效只有两档时长、不堆砌装饰
- **规范唯一来源**：所有颜色/字号/间距/圆角只允许引用 token，禁止页面内硬编码

## 2. Design Tokens

### 2.1 色彩

| Token | 值 | 用途 |
|---|---|---|
| `--c-primary` | `#F97316` | 主色：主按钮、选中态、链接、FAB |
| `--c-primary-active` | `#EA6A0C` | 主色按压态 |
| `--c-primary-weak` | `#FFF1E5` | 主色弱底：选中 chips、海报占位底 |
| `--c-bg` | `#FFF9F2` | 页面背景（奶油） |
| `--c-card` | `#FFFFFF` | 卡片、弹层 |
| `--c-text` | `#3D2E23` | 主文字（暖棕黑） |
| `--c-text-2` | `#8C7B6E` | 次要文字（暖棕灰） |
| `--c-text-3` | `#C4B5A8` | 占位符、时间戳、禁用 |
| `--c-border` | `#F0E4D7` | 分割线、卡片描边 |
| `--c-success` | `#10B981` | 成功 / 已同步 |
| `--c-warning` | `#F5A623` | 警告 / 待同步 |
| `--c-danger` | `#EF4444` | 危险 / 删除 / 冲突 |
| `--c-star` | `#F5A623` | 评分星（金） |
| `--c-star-off` | `#EBDFCE` | 未选中星 |
| `--c-mask` | `rgba(61,46,35,.45)` | 弹层遮罩 |

暗色模式：token 命名已预留（`--c-*` 体系），本期不做半吊子适配。

### 2.2 字体

系统字体栈：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Segoe UI", "Microsoft YaHei", sans-serif`

| 级别 | 规格 | 用途 |
|---|---|---|
| 28 / 600 | 大标题、统计大数字（`tabular-nums`） | 统计总览卡 |
| 20 / 600 | 页面主标题 | 首页/设置页顶栏 |
| 17 / 600 | 卡片标题、弹窗标题 | 记录卡片片名 |
| 15 / 400 | 正文、按钮 | 表单、按钮 |
| 14 / 400 | 次要信息 | 元数据行 |
| 12 / 400 | 时间戳、角标 | 卡片右下时间 |

统计数字一律 `font-variant-numeric: tabular-nums`。

### 2.3 间距

全部为 4 的倍数：`4 / 8 / 12 / 16 / 24 / 32`。

| 值 | 典型用途 |
|---|---|
| 4 | 图标与文字 |
| 8 | 紧凑元素间距、chips 间距 |
| 12 | 卡片内边距、卡片之间 |
| 16 | 页面水平边距、区块间距 |
| 24 | 大区块间距 |
| 32 | 页面顶部留白 |

### 2.4 圆角与阴影

| Token | 值 | 用途 |
|---|---|---|
| `--r-card` | 12px | 卡片 |
| `--r-btn` | 8px | 按钮、输入框 |
| `--r-sheet` | 16px | 底部弹层顶部圆角 |
| （全圆） | 999px | chips、指示器胶囊 |
| `--shadow-card` | `0 1px 4px rgba(61,46,35,.08)` | 卡片唯一一档阴影 |
| `--shadow-fab` | `0 4px 12px rgba(249,115,22,.4)` | FAB 主色投影 |

卡片不加边框、只靠轻阴影分层；阴影不叠重影。

## 3. Vant 主题映射

`web/src/styles/vant-theme.css` 集中把 Vant 4 CSS 变量映射到 tokens，全站组件自动继承：

```css
:root {
  --van-primary-color: var(--c-primary);
  --van-text-color: var(--c-text);
  --van-text-color-2: var(--c-text-2);
  --van-text-color-3: var(--c-text-3);
  --van-border-color: var(--c-border);
  --van-background: var(--c-bg);
  --van-background-2: var(--c-card);
  --van-radius-md: var(--r-btn);
  --van-radius-lg: var(--r-card);
  --van-button-primary-background: var(--c-primary);
  --van-button-primary-border-color: var(--c-primary);
  --van-rate-icon-full-color: var(--c-star);
  --van-dialog-radius: var(--r-sheet);
}
```

禁止在页面级覆写 Vant 样式；组件级微调必须引用 token。

## 4. 布局规范

- 内容区 `max-width: 480px` 居中（平板/桌面不散架）
- **底部 Tabbar 四项**：📖 手账 / ⭐ 想看 / 📊 统计 / ⚙️ 设置；含 `safe-area-inset-bottom` 底部安全区；MVP 点亮"手账 + 设置"，未交付项半透明置灰（`opacity: .45`）
- **FAB**：直径 56、主色、白＋号、右下角（Tabbar 上方 16px），录入入口
- **海报一律 2:3 比例**，缺省/加载中/失败统一显示弱橙底 + 🍿 占位
- 页面滚动主体在内容区，顶栏不吸顶毛玻璃（保持简单）

## 5. 组件规范

自定义组件 PascalCase 命名、props 全 TypeScript 类型化、样式只引用 tokens。

| 组件 | 规范 |
|---|---|
| `PosterImage` | 2:3；IndexedDB blob 加载；三态：正常 / 占位（弱橙底+🍿）/ 失败回占位，不裂图 |
| `RecordCard` | 手账卡片：海报 + 片名(年份) + 日期·地点 + 成员 chips + 星级 + 手记首行截断；右下相对时间；可挂"疑似重复"角标（Sync 阶段启用） |
| `MoviePicker` | 搜片联想：防抖 300ms、结果行 = 小海报 + 片名 + 年份·类型；选中后展示只读元数据卡 |
| `StarRating` | Vant Rate 封装；支持"未评分"态（`--c-text-3` 文字） |
| `SyncIndicator` | 三态胶囊：✓ 已同步(绿) / ⏳ 待同步 n(黄) / ⚠️ 有冲突(红，可点入冲突页)；MVP 为静态"已同步"占位，Sync 阶段接真状态 |
| `EmptyState` | 插画位(emoji) + 标题 + 副文案 + 主色引导按钮；所有空态必须给出下一步动作 |
| `MemberChips` | 成员多选 chips：选中 = 弱橙底 + 主色字 + ✓ |
| `LocationPicker` | 三点选：🏠 家里（默认）/ 🚄 旅行途中 / 🎬 影院 + ＋ 自定义（进入常用列表） |
| `UpdatePrompt` | PWA 新版本提示条（顶部，主色底），点击刷新 |

## 6. 交互与动效

- 动效两档：微交互 150ms、进出场 250ms，一律 `ease-out`；不加花哨动画
- 反馈分级：轻成功用 Toast（不打断）；破坏性操作（删除记录、清空数据）用 Dialog 二次确认，危险按钮用 `--c-danger`
- 网络操作**永不阻塞界面**：后台执行 + SyncIndicator 表达状态；保存记录永远先写本地
- 加载态：列表用骨架屏；搜片联想用行内 loading；海报用占位
- 下拉刷新：Sync 阶段接入（触发一次对账），MVP 不展示

## 7. 文案口吻

温暖家人式，多用"我们/今天/一起"，空态给情绪不给指令感。

| 场景 | 文案 |
|---|---|
| 首页空态 | 「还没有家庭观影记录」/「记下第一部电影吧」🍿 |
| 删除确认 | 「删除这条观影记忆？」 |
| 手记占位 | 「全家第一次一起看，妹妹全程目不转睛…」 |
| 孩子原话占位 | 「妹妹："波妞来我们家住好不好呀？"」 |
| 保存成功 | Toast「已保存」 |
| 同步 | 静默（仅指示器变化），不打扰 |

## 8. 图标与 PWA 视觉

- App 名称：**观影手账**（副名 popcorn-log）
- 图标：暖橙底 `#F97316` + 白色爆米花剪影；尺寸 192 / 512 / maskable-512 / apple-touch-icon(180)；maskable 图形居中、内容占约 62%（安全区）
- manifest：`theme_color: #F97316`、`background_color: #FFF9F2`、`display: standalone`
- 图标由 `scripts/generate_icons.py`（Pillow）生成，改图标改脚本后重新生成

## 9. 落地与执行

- tokens 唯一来源：`web/src/styles/tokens.css`；Vant 映射：`web/src/styles/vant-theme.css`；两者在 `main.ts` 最先引入
- Code Review 硬规则：页面/组件样式出现 token 之外的硬编码色值 = 不予合并（白色系文字阴影、`rgba(255,255,255,.9)` 等装饰性微调除外，需注释说明）
- 设计确认 demo 存档：`ref/design-demo/index.html`（ref/ 不入库，仅本地参考）
