# Casleo 功能清单（迁移评估用）

> 用途：官方桌面端（deepseek-ai/deepseek-harness 自带桌面壳）发布后，按此清单逐项权衡：
> 值得带走的，迁移成官方桌面端的外挂；官方自带的，直接放弃；都不需要就随仓库一起清空。
>
> **打勾列**留给你自己填：留 / 不留 / 等官方看。

---

## A. 外挂插件（健康资产，不碰引擎源码，升级不用重做）

位于 `packages/`，通过 Harness 的插件体系与公开插槽挂载，是最容易整体搬走的部分。

| # | 功能 | 干什么用 | 官方桌面端大概率自带？ | 我的取舍 |
|---|------|----------|:---:|---|
| A1 | 预设导入导出 `dsh-desktop-preset-transfer` | 把 Agent 预设打包成 .dshpreset 文件，跨电脑搬 | ❓ 大概率不会（官方连预设转移都没有） | |
| A2 | 插件市场安装器 `dsh-desktop-market-installer` | 一键装好 dsh-market（第三方插件市场），含重启按钮的设置入口 | ❓ 不确定 | |
| A3 | 通用设置三行（`dsh-desktop-client-ui`）<br>① 网络代理 ② 安全模式重启 ③ 桌面通知 | ① 模型请求走代理（修“没 Clash 的电脑连不上中转”）② 无第三方插件重启排障 ③ 失焦弹系统通知 | ①❓ ②❓ ③✅ 官方桌面端很可能自带通知 | |
| A4 | HMR 降级 `dsh-desktop-hmr-fallback` | 打包后的 Electron 里官方 HMR 服务起不来时的替代品 | ❓ 官方桌面端自己会解决，大概率不需要 | |
| A5 | 品牌插槽占用（同一插件内） | 侧栏 Casleo 标志/字标 | ✅ 官方必自带 | 可直接弃 |

## B. 桌面壳能力（Electron 主进程，`src/main`，与引擎版本几乎无关）

| # | 能力 | 干什么用 | 官方桌面端大概率自带？ | 我的取舍 |
|---|------|----------|:---:|---|
| B1 | 原生 Windows 标题栏 + 托管 Node/pnpm 打包 | 真正的安装包分发（CI 自动构建） | ✅ 官方桌面端必有 | |
| B2 | 网络代理注入 | 启动引擎时注入 HTTP(S)_PROXY，Node 不读系统代理开关，国内直连被断流的中转靠这个救 | ❓ 不确定，官方未必想到 | 重点候选 |
| B3 | 桌面通知 | 失焦才弹、点击回窗、开关即时生效 | ✅ 大概率自带 | |
| B4 | 安全模式管理器/恢复界面/崩溃恢复 | 插件搞挂启动时的救援流程 | ❓ 官方可能有类似 | |
| B5 | 托盘/关闭最小化、单实例、GPU 降级、窗口恢复 | Windows 桌面体验细节 | ✅ 成熟桌面壳都会有 | |
| B6 | localStorage 持久化桥 | 引擎界面设置不丢 | ❓ | |
| B7 | 网页版数据导入 | 官方 web 版数据一键迁移到桌面 | ❓ | |

## C. 界面手术补丁（改官方 UI 源码，官方升级 = 重做；能不带走就不带）

锁死在 `0.1.5-rc.2`，每换引擎版本全部要重新适配。

| # | 补丁 | 干什么用 | 官方桌面端大概率自带？ | 我的取舍 |
|---|------|----------|:---:|---|
| C1 | `client-ui-workspace` | 会话右键删除（永久删 jsonl + 确认弹窗）、未读蓝点、归档/重命名菜单 | ❓ 删除是刚需，官方迟早会做 | |
| C2 | `client-ui-model-selection` | 模型选择器：搜索框、隐藏官方 DeepSeek 路由、无内置路由时不误报 | ❓ | |
| C3 | `client-ui-settings-models` | 模型设置页：目录搜索、两列高级项、下拉改搜索 | ❓ | |
| C4 | `client-ui-agent-preset` | 预设导入/导出的界面半边 | ❓（与 A2 配套） | |
| C5 | `client-ui-chat` | 思考态改“正在思考…”灰 shimmer（去品牌）、宽度机制清退 | ✅ 官方自己的壳不会有 DeepSeek 品牌？未必 | |
| C6 | `client-ui-conversation` | 工作区悬停环、hero 槽位（agentPreset/modeActions）、composer.dock 守卫、附件插槽可见性修复 | ❓ hero 槽是官方预留 | |
| C7 | `client-ui-deliverables` | 正文里出现真实路径时变成可点链接（含 e.g./React.FC 误链修复） | ❓ 官方可能迟早做 | |
| C8 | `client-ui-layout` | 折叠侧栏固定 56px、右侧面板可拖宽、窗口标题 Casleo | ❓ | |
| C9 | `client-ui-sidebar` | 侧栏品牌位（Casleo 标志/字标）、Compose 图标 | ✅ 品牌相关，官方壳自带 | |
| C10 | `client-ui-sidebar-right` | 右栏禁止分栏（单栏更简） | ❓ | |
| C11 | `client-ui-settings-general` | 插件市场图标 | ❓（与 A2 配套） | |
| C12 | `client-ui-directory-picker-native` | 目录选择走 Electron 原生对话框 | ❓ 官方桌面端在浏览器里跑，可能需要 | |
| C13 | `client-ui-message-feedback` | 掏空赞/踩（组合里也已 disable，双保险） | ✅ 可直接扔 | |
| C14 | `client-ui-agent-preset`（部分）+ `dsh`（package.json 注入外挂依赖） | 外挂注册所需的接线 | 随外挂走 | |

## D. 后端手术补丁（改引擎内部，升级重做成本最高的部分）

| # | 补丁 | 干什么用 | 我的取舍 |
|---|------|----------|---|
| D1 | `dsh-session-persistence` + `jsonl` + `dsh-workspace` + `api-session-controller` + `api-remotes`（5 件一套） | **永久删除会话**：官方只能归档，这套做到真删除（带写锁、竞态防护、未发布工作区容错） | 删除功能是不是刚需？官方若自带就全扔 |
| D2 | `cordis-plugin-loader` | 插件启动失败时能精确报告是哪个插件干的，并兜底 require | ❓ |
| D3 | `dsh-app-boot` | Windows 下 pnpm 符号链接被占用时的重试清理 | ❓ 官方桌面端会遇到同样问题 |
| D4 | `dsh-client-modules` | 客户端模块组合缓存的性能修复（启动提速） | ❓ 官方可能自己修 |
| D5 | `dsh-llm-pi-ai` | 部分服务商流式结束不带 content 数组时的恢复（真 bug 修复） | ❓ 官方可能自己修 |
| D6 | `dsh` package.json | 把四个桌面外挂包注册进依赖（A 区配套） | 随外挂走 |

## E. 组合配置（`build/dsh-desktop.patch.yml`）

| # | 改动 | 原因 | 我的取舍 |
|---|------|------|:---:|---|
| E1 | 关闭 `llm-deepseek` | 不内置 DeepSeek 路由，冷启动引导用户配自己的中转 | |
| E2 | 关闭 `ui-brand-official` / `ui-message-feedback` | 品牌位让给 Casleo；赞踩不要 | |
| E3 | 注入 4 个桌面外挂 + dsh-market 配置（allowRestart: false） | 外挂挂载点 | 随外挂走 |

## F. 工程资产（与引擎无关，可直接搬）

- CI：`.github/workflows/desktop-installer.yml`（测试 + 打包 + tag 发 Release）
- 打包：electron-builder 配置（asar 解包 node_modules、图标、AppUserModelId）
- 信任模型：引擎回环端口 + 自有页面的来源校验（安全层，建议保留）
- 数据目录：`%APPDATA%\casleo\harness` —— 引擎的工作区/会话/凭据全在这，换壳不丢数据（官方桌面端若用别的 home，把这一目录内容迁过去即可）

## 迁移方式速记（给未来执行用）

1. **外挂类（A/D6）**：整包复制到官方桌面端的插件目录即可，几乎零改动（配置文件读写那几行除外）。
2. **界面类（C）**：先等官方桌面端的界面定稿，再决定哪几条还要重打补丁——官方界面变了，这些补丁全部要重做，所以清空仓库前**别带走**，等需要时对照本清单重做。
3. **后端类（D）**：逐个判断官方是否已实现；删除会话（D1）是价值最高也最难重做的一套。
4. **代理/通知（B2/B3）**：官方桌面端若自带，直接用官方的；若没有，`desktop-proxy.ts`/`desktop-notifications.ts` 两个文件 + IPC + 设置行可整体搬走。
