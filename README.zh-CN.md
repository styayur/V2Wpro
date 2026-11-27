# V2Wpro · 视频驱动的程序化世界

**Video imagines. Algorithms expand. Engines realize.**

从本地视频或关键帧出发，记录可观察的空间与运动特征，把设计决策写入 WorldIR，用确定性规则扩展场景，最后在 Three.js 中试玩。参考流程使用本地文件，无须商业 API 密钥。

[在线试玩](https://styayur.github.io/V2Wpro/) · [English](README.md) · [下载 v0.1.0](https://github.com/styayur/V2Wpro/releases/tag/v0.1.0)

## 快速开始

安装 Node 24 LTS，克隆本仓库后执行：

```sh
npm ci
node cli.js preview
```

打开终端显示的网址。W/S 前后移动，A/D 横移，上下方向键调整高度，空格触发场景动作。建筑飞行从原创四秒动画中提取拱廊、色彩和前进运动线索。浮岛探索和冲刺游乐场使用独立编写的规则示范地形变体和运动机制。

处理视频需要 FFmpeg，可通过 FFMPEG 环境变量指定可执行文件。运行 `node cli.js ingest examples/reference.mp4` 和 `node cli.js analyze` 可创建带时间戳的审阅任务。模型或人工负责解释帧间变化。用 `node tools/replay.js` 复现已审阅的转换，再执行 `node cli.js preview .v2w/replayed.json`。保留源片摘要、取色位置、推断、设计参数和扩展规则，方便追溯。

通过 `npm link` 安装 v2w 命令后，可在新目录运行 `v2w init gate`、`v2w validate`、`v2w generate`、`v2w preview`。首次安装依赖及测试浏览器需要联网，此后基础示例可离线运行。执行 `npx playwright install chromium`、`npm test`、`npm run evaluate` 获取测试结果、截图和录像。

将 skills/v2wpro 复制到项目的 .agents/skills/ 下即可使用 Agent Skill。Three.js 适配器已实现，Godot、Unity 和商业供应商连接器留待扩展。Blender 可选。

[工作流及扩展开发](docs/workflows.md) · [WorldIR 规范](docs/worldir.md) · [实测报告](evidence/README.md) · [素材来源](examples/CREDITS.md)
