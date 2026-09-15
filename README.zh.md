# Casleo

Casleo 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地优先桌面应用。它在本机回环端口上启动 Harness 运行时，把配置档案、插件、工作区、模型设置和会话保存在应用目录之外，并在本地运行时就绪后直接打开完整的 Harness 界面。

## 功能

- 无需命令行或浏览器标签页即可启动、停止 Harness
- 使用系统原生目录选择器添加和管理项目工作区
- 支持 DeepSeek 官方模型和主流第三方模型服务商
- 通过 `.dshpreset` 预设包导入、导出完整的自定义 Agent 预设
- 内置 PPT 模式，把素材生成可编辑的 PPTX
- 应用升级时保留配置档案、插件、工作区、会话和模型设置
- 检测启动与前端插件故障，把诊断写入 `harness.log` 并提供引导式恢复
- 提供非破坏性的安全模式，临时屏蔽第三方插件
- 适配 macOS 与 Windows 的原生菜单、标题栏、窗口焦点、主题和品牌
- 侧边栏品牌文字、应用图标、启动动画和插件市场图标均为 Casleo 品牌

## 下载

Windows x64 安装包由 [构建流程](.github/workflows/desktop-installer.yml) 生成，并随标签发布在 [Releases](https://github.com/leoporoluo/Casleo/releases)。安装包未签名，首次运行可能出现 Windows SmartScreen 提示。

本地构建：

```bash
npm ci
npm run package:win
```

## 环境要求

- Windows x64（打包安装）；macOS 可用于开发
- 开发需要 Node.js 24+
- DeepSeek API Key，或在设置中配置的第三方服务商凭据

## 开发

```bash
git clone https://github.com/leoporoluo/Casleo.git
cd Casleo
npm ci
npm run dev
```

提交改动前运行：

```bash
npm test
npm run typecheck
npm run build
```

补丁维护与打包见 [开发指南](docs/development.md)，运行时设计见 [架构说明](docs/architecture.md)，预设包格式见 [preset-packages.md](docs/preset-packages.md)。

## 目录结构

```text
src/main/       Electron 主进程与应用编排
src/preload/    沙箱渲染进程接口与桌面端 UI 增强
src/shared/     共享契约与桌面菜单定义
packages/       内置桌面支撑包（客户端 UI、市场安装器、预设、PPT）
patches/        对固定版本 Harness 包的可复现 patch-package 补丁
build/          打包用 HTML 界面、图标、加载动画与 Harness 入口文件
test/           单元与源码契约回归测试
```

## 许可证

Casleo 使用 MIT 许可证，派生自 [DSH Desktop](https://github.com/dataelement/dsh-desktop)，并打包 DeepSeek Harness 及其依赖；它们分别遵循各自的上游许可证与商标政策。
