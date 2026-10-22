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
- 开发文档：新增 [STATUS.md](STATUS.md)，汇总已实现功能、未实现功能（按 P1/P2 分级）与项目要求。
- 计划书：新增 [PLAN.md](PLAN.md)，明确设计目的（编写代码、信息管理、图形化创建内容）与 v0.1–v1.0 路线。
- 代码索引：新增 [INDEX.md](INDEX.md)，逐项说明各模块函数、HTTP 动作、客户端组件与座位注册点的用法、参数与返回，附「想改什么 → 改哪里」检索表。
- 目录选择器：新建项目、导入工程、扫描根目录三处增加「浏览…」按钮，调用 `uiWorkspace.pickDirectory()` 打开系统文件夹选择器；取消或不可用时回退为手动输入并给出提示。
- 项目目录放开：新建与导入不再限制在扫描根目录内，任意目录都可作为项目目录（仍要求空目录或不存在）；扫描根目录仅用于批量扫描候选工程。
- 按钮悬停：插件页面与右侧栏注入统一样式，悬停时按钮叠加中性灰（与 DSH 原生按钮的灰色高亮一致），按下加深并轻微下沉，另含禁用态与键盘焦点环；卡片悬停有边框与阴影反馈。
- 扫描状态：改为读取项目目录内的 `.mcstudio/studio.json` 标记判断是否已导入，不再依赖注册表路径；已导入的项目显示「已导入」徽章、导入时间与「打开」按钮，未导入的显示「导入」按钮。
- 工坊标记：新增 `.mcstudio/studio.json`，记录 `projectId`、首次导入时间、来源（create/import/add/open）与目标版本；新建、导入、添加、打开项目时自动写入；只有 `project.json` 的老项目视为已导入，首次打开时补写标记。

### 说明

- 目标版本固定为 Minecraft 1.20.1；加载器支持 Forge、NeoForge、Fabric。
- v0.1.0 不生成 gradle 工程，构建由用户在 IDEA 中完成；代码工作区与代码生成列入 v0.2（见 [PLAN.md](PLAN.md)）。
