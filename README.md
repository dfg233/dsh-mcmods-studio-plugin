# 模组工坊（dsh-mcmods-studio-plugin）

> 当前版本：v0.1.3
> 更新日期：2026-10-28

面向 **Minecraft 1.20.1**（Forge / NeoForge / Fabric）的模组制作插件，
运行在 DeepSeek Harness 的 Web UI 中。

**版本策略**：插件自身遵循语义化版本，每次优化或修复 bug 后 PATCH +1
（如 `v0.1.0` → `v0.1.1`），规则见[版本规划](docs/VERSION-PLAN.md)；
Minecraft 适配版本当前固定为 1.20.1，v1.0.0 起先加 1.21.1（见[项目计划书](docs/PLAN.md)）。

设计目的是把模组开发中可结构化的部分（想做什么、有哪些内容、每个内容的属性、素材在哪、
代码该长什么样）从笔记与源码里抽出来，变成**一份人和 agent 都能直接读写的结构化事实**：
对 agent 提供准确、紧凑、可校验的项目上下文，对用户提供直观的项目关系与低门槛的编辑方式。
生成物可读可改，删除插件后工程仍可正常开发。

完整定位见[项目计划书第 0 节「插件宗旨」](docs/PLAN.md)，agent 改进方案见
[Agent 结合与发展建议](docs/plans/AGENT-PLAN.md)；当前只适配 Minecraft 1.20.1。

## 功能

- **项目**：以「项目」为单位管理模组目录，支持新建、扫描与导入已有 gradle 工程；
- **导入保护**：导入 / 重新导入前自动备份 `.mcstudio/` 与快照，失败回滚；预览后用 proof 拒绝过期操作；创造模式标签自动归类，不混入物品；
- **构想**：梳理模组玩法，记录状态、优先级与关联物品；
- **物品**：列表 / 画布双视图，按分组编辑物品属性（性质）；
- **贴图与模型**：上传 PNG、预览、编辑模型 JSON、统计缺失素材、按方块面解析贴图；
- **文档**：一键导出 Markdown 到项目 `docs/`；
- **构建教程**：内置 1.20.1 三种加载器的 IDEA 构建流程；
- **代码结构**：扫描 Java 源码，生成 `.mcstudio/structure.json`，记录文件、类、方法、行号与注册点；
- **Agent**：21 个原生工具、项目摘要、校验、导入提示与语义注解；
- **设置**（v0.2 计划中）：页签栏齿轮入口，管理启动恢复、默认页签、物品默认视图、删除素材策略与 Agent 默认项目；
- **代码工作区**（v0.3 计划中）：浏览与编辑工程源码，生成带标记区块的注册代码与资源 JSON。

完整路线见 [项目计划书](docs/PLAN.md)，当前进度见 [项目状态](docs/STATUS.md)。

## 安装

```text
plugin_manager install_bundle  target: D:\program\dsh-mcmods-studio-plugin
```

安装后侧栏出现「模组工坊」图标。

## 数据位置

| 内容 | 位置 |
| --- | --- |
| 插件代码 | `D:\program\dsh-mcmods-studio-plugin` |
| 项目索引 | `$DSH_HOME/mcmods-studio/registry.json` |
| 插件设置（v0.2 规划） | `$DSH_HOME/mcmods-studio/settings.json` |
| 项目设计数据 | `<项目>/.mcstudio/` |
| 导出文档 | `<项目>/docs/` |

## 文档

- [版本规划（版本号规则与发版流程）](docs/VERSION-PLAN.md)
- [项目计划书（含插件宗旨）](docs/PLAN.md)
- [项目状态（已实现 / 未实现 / 要求）](docs/STATUS.md)
- [Agent 结合与发展建议](docs/plans/AGENT-PLAN.md)
- [模块计划索引](docs/plans/README.md)
- [设置页规划（v0.2）](docs/plans/SETTINGS-PLAN.md)
- [催更姬插件可借鉴实现](docs/REFERENCE-CUIGENGJI.md)
- [代码索引（函数与接口）](docs/INDEX.md)
- [模组项目文件结构（1.20.1）](docs/PROJECT-STRUCTURE.md)
- [开发文档](docs/DEVELOPMENT.md)
- [架构说明](docs/ARCHITECTURE.md)
- [数据格式](docs/DATA-FORMAT.md)
- [兼容性](docs/COMPATIBILITY.md)
- [更新日志](docs/CHANGELOG.md)
- [构建教程](docs/BUILD-GUIDE.md)

## 许可

私人项目，未声明开源许可。
