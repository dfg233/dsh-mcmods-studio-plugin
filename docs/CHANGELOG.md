# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [Unreleased]

### 计划中

- 批量导入贴图（多选拖放）。
- 项目快照的差异对比（导入后与当前数据的变更）。
- 供 AI Agent 调用的工具集（通过对话创建物品、导出文档）。
- 方块状态与多方块模型的可视化编辑。

## [0.1.0] - 2026-10-20

### 新增

- 插件骨架：Host 半注册 `/mcmods-studio/api` HTTP 路由，Client 半注册 `sidebar.panellist` 入口与 `main` 页面。
- 侧栏入口：`sidebar.panellist` 图标区（与「插件市场」「费用统计」「上下文洞察」同一区域，`order: 2`），显示「模组工坊」图标与文字，点击打开主面板。
- 右侧栏标签页：`sidebarRightTabs` 注册 `mc-mod-studio` 类型与 `sidebar.right.pane.tab` 内容，显示当前项目概览（名称、modid、加载器、版本、物品与功能统计）以及主面板中选中物品的属性详情；同时在右侧栏「开始」页提供「模组工坊」引导卡片。
- 项目页：项目列表、新建项目、扫描根目录候选工程、导入已有工程（读取 `fabric.mod.json` / `mods.toml` / 构建脚本），并生成 `docs/mcstudio-snapshot.md` 快照。
- 功能列表页：功能条目增删改，状态（构思 / 规划中 / 实现中 / 已完成）与优先级。
- 物品页：列表与画布双视图、搜索、物品属性编辑器（基础 / 数值 / 行为 / 标签 / 兼容五组字段）。
- 画布视图：卡片自由拖拽排布，松开后自动把坐标保存到物品的 `canvas` 字段。
- 素材页：贴图上传（PNG 校验、正方形检查、16×16 提示）、贴图预览、模型 JSON 查看与编辑、缺失素材统计。
- 文档导出：`docs/FEATURES.md`、`docs/ITEMS.md`、`docs/ITEMS/<id>.md`、`docs/ASSETS.md`、`docs/README.md`。
- 构建教程页：内置 1.20.1 Forge / NeoForge / Fabric 的 IDEA 构建流程。
- 数据格式：项目数据保存在 `.mcstudio/`（`project.json`、`features.json`、`items/*.json`），不污染 gradle 工程。

### 说明

- 目标版本固定为 Minecraft 1.20.1；加载器支持 Forge、NeoForge、Fabric。
- 首版不生成 gradle 工程，构建由用户在 IDEA 中完成。
