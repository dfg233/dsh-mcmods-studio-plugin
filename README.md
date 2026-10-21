# 模组工坊（dsh-mcmods-studio-plugin）

面向 **Minecraft 1.20.1**（Forge / NeoForge / Fabric）的模组设计与素材管理插件，
运行在 DeepSeek Harness 的 Web UI 中。

## 功能

- **项目**：以「项目」为单位管理模组目录，支持新建、扫描与导入已有 gradle 工程；
- **功能列表**：梳理模组玩法，记录状态与优先级；
- **物品**：列表 / 画布双视图，按分组编辑物品属性（性质）；
- **贴图与模型**：上传 PNG、预览、编辑模型 JSON、统计缺失素材；
- **文档**：一键导出 Markdown 到项目 `docs/`；
- **构建教程**：内置 1.20.1 三种加载器的 IDEA 构建流程。

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

- [开发文档](docs/DEVELOPMENT.md)
- [架构说明](docs/ARCHITECTURE.md)
- [数据格式](docs/DATA-FORMAT.md)
- [兼容性](docs/COMPATIBILITY.md)
- [更新日志](docs/CHANGELOG.md)
- [构建教程](docs/BUILD-GUIDE.md)

## 许可

私人项目，未声明开源许可。
