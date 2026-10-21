# 模组工坊（dsh-mcmods-studio-plugin）

面向 **Minecraft 1.20.1**（Forge / NeoForge / Fabric）的模组制作插件，
运行在 DeepSeek Harness 的 Web UI 中。

**版本策略**：当前只适配 Minecraft 1.20.1；其他版本在后续版本逐步适配
（v1.0.0 起先加 1.21.1，之后按需扩展），详见[项目计划书](docs/PLAN.md)。

设计目的是帮助模组作者完成三件事：**编写代码**、**集中管理模组信息**、
**用图形化方式创建与修改模组内容**。图形化负责「是什么」，代码负责「怎么实现」，
生成物可读可改，删除插件后工程仍可正常开发。

## 功能

- **项目**：以「项目」为单位管理模组目录，支持新建、扫描与导入已有 gradle 工程；
- **功能列表**：梳理模组玩法，记录状态与优先级；
- **物品**：列表 / 画布双视图，按分组编辑物品属性（性质）；
- **贴图与模型**：上传 PNG、预览、编辑模型 JSON、统计缺失素材；
- **文档**：一键导出 Markdown 到项目 `docs/`；
- **构建教程**：内置 1.20.1 三种加载器的 IDEA 构建流程；
- **代码工作区**（v0.2 计划中）：浏览与编辑工程源码，生成带标记区块的注册代码与资源 JSON。

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
| 项目设计数据 | `<项目>/.mcstudio/` |
| 导出文档 | `<项目>/docs/` |

## 文档

- [项目计划书](docs/PLAN.md)
- [项目状态（已实现 / 未实现 / 要求）](docs/STATUS.md)
- [代码索引（函数与接口）](docs/INDEX.md)
- [开发文档](docs/DEVELOPMENT.md)
- [架构说明](docs/ARCHITECTURE.md)
- [数据格式](docs/DATA-FORMAT.md)
- [兼容性](docs/COMPATIBILITY.md)
- [更新日志](docs/CHANGELOG.md)
- [构建教程](docs/BUILD-GUIDE.md)

## 许可

私人项目，未声明开源许可。
