# V2Wpro · Topogenesis

在 Switchyard 的高架岔道上选定航线，检查曲率、速度和机身净空，再用 Skimmer 的游戏记录复核预测。这个有限区域有两条走廊、两个分流口和十条有向边。同一套六种参数化模块也供 Skimmer 的按需生成城市使用。

一段拍到书架与红椅的镜头，可以给出一套空间生成规则：把横向搁板与竖向支撑组合成结构单元，重复排列，再把椅子设为岔路口的地标。v0.2.0 将这些解释与设计编译成可执行的 WorldIR。玩家可以在空间中自由转向，检查节点之间的路线，并通过种子改变同一规则下的排列。

[运动检查器](https://styayur.github.io/V2Wpro/?world=topogenesis) · [独立中文教程](https://styayur.github.io/V2Wpro/guide.html#zh) · [生成规则与实飞证据](docs/topogenesis.md) · [English](README.md)

## 快速开始

安装 Node 24 并克隆仓库，在根目录运行：

```sh
npm ci
node cli.js preview
```

打开终端给出的网址，选择场景，按页面上的操作说明飞行。Canopy 从参考片中的家具和搁架提取结构；Caldera 从文字简报生成不同高度的地形与分支；Lattice 将自制环形加速动画中的动作应用到分流、汇合的路线。页面可切换种子、查看规则与来源。三个 v0.1.0 世界也在同一入口，其几何指纹保持一致。

## 从证据重建世界

```sh
node cli.js verify examples/reviews/canopy.json clip examples/canopy-source.mp4
node cli.js compile examples/reviews/canopy.json .v2w/reading-rooms.json
node cli.js generate .v2w/reading-rooms.json
node cli.js preview .v2w/reading-rooms.json
```

新视频、图像或关键帧可用 `node cli.js ingest 文件路径` 导入，`node cli.js analyze` 为选定资料生成审阅任务。Coding Agent 或人工解释时序、材料和空间关系，分别记录观察、推断、设计决策及程序化扩展。CLI 校验证据引用、生成开销和玩家球体沿路线的实际净空。审阅完成后，重建、局部修订与生成变体均可离线执行。

把 skills/v2wpro 复制到目标项目的 .agents/skills/ 下即可安装 Agent Skill。处理新素材时需要 FFmpeg，基础体验无需 Blender 或商业 API。离线站点压缩包解压后可运行 `python -m http.server 8000`，再在浏览器打开 localhost:8000。

[编译与迁移指南](docs/compiler.md) · [WorldIR 2.0 规范](docs/morphogenesis.md) · [视频案例与反馈迭代](docs/case-study.md) · [对照实验](docs/experiment.md) · [三维资产处理](docs/assets-v2.md) · [下游交换验证](docs/downstream.md) · [素材许可](examples/CREDITS.md)
