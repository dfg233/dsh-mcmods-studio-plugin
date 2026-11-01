# 项目状态：已实现、未实现与要求

> 适用版本：模组工坊（`dsh-mcmods-studio-plugin`）v0.2.5
> 更新日期：2026-11-01
> 本文档回答三个问题：**现在能做什么**、**还不能做什么**、**必须遵守什么**。
> 历史变更见 [CHANGELOG.md](CHANGELOG.md)，版本规则与发版流程见 [VERSION-PLAN.md](VERSION-PLAN.md)，开发方式见 [DEVELOPMENT.md](DEVELOPMENT.md)，当前主线见 [PLAN.md](PLAN.md)，代码索引见 [INDEX.md](INDEX.md)。
> 本文区分 **as-built（v0.2.5 已实现）** 与 **目标能力（v0.3 起）**；旧路线已归档到 [archive/PLAN-v0.1.md](archive/PLAN-v0.1.md)。

## 0. 设计目的

> **宗旨**：模组工坊是一个「人机共用」的模组开发工作台。它把模组开发中可结构化的部分
> （想做什么、有哪些内容、每个内容的属性、素材在哪、代码该长什么样）从笔记与源码里抽出来，
> 变成一份人和 agent 都能直接读写的结构化事实。

对 agent 提供准确、紧凑、可校验的项目上下文；对用户提供直观的项目关系与低门槛的编辑方式。
判断标准：新功能若既没让 agent 更准确理解项目，也没让用户更容易表达意图，就不应做。

当前承担的三件事：

1. **为 agent 提供上下文**（**已完成**）：22 个 DSH 原生工具、项目摘要 `summary.json`、
   schema 外置 `data/schema.json`、9 类校验器、导入判定提示；
2. **为用户提供直观平台**（**已完成 v0.2**）：构想、计划、物品属性、贴图模型、语言/配方/标签/模型与文档；
3. **衔接设计与实现**（**进行中**）：想法/系统/任务与内容编辑已落地；模板、API 索引与代码生成规划在 v0.3/v0.4。

## 1. 需求对照

| # | 需求 | 状态 | 实现落点 |
| --- | --- | --- | --- |
| 1 | 明确的模组功能列表 | 已实现 | 「构想」页；导出 `docs/FEATURES.md` |
| 2 | 画布 / 列表形式的物品管理 | 已实现 | 「物品」页双视图；画布拖拽坐标写入物品 `canvas` 字段 |
| 3 | 清晰明了的物品属性文档 | 已实现 | 19 个字段、五组分类的属性编辑器；导出 `docs/ITEMS/<id>.md` |
| 4 | 贴图、模型管理页面 | 已实现 | 「贴图与模型」页；上传、预览、模型 JSON 编辑、缺失统计 |
| 5 | 工程文件格式清晰，`docs/` 下存放 Markdown 更新日志与开发文档 | 已实现 | 项目数据集中在 `.mcstudio/`；插件自身文档在 `docs/` |
| 6 | 允许编写代码（浏览 / 编辑源码、生成注册代码） | 计划中（v0.4） | 由模板 + AI 任务 + 标记区块生成承接；当前版本不含代码工作区 |
| 7 | 图形化创建与修改模组内容（物品 / 方块 / 配方等） | 部分实现 | 物品已支持图形化创建与编辑；语言、配方、标签、模型与内容历史从 v0.2 起 |
| 8 | 与 AI 对话定制模组，AI 有模板、上下文和任务边界 | 规划中（v0.2–v0.3） | 想法卡、系统卡、模板、任务包、上下文包；API 签名来自项目 classpath 索引；见 [PLAN.md](PLAN.md) |
| 9 | 项目管理：想法/系统/任务/验收 | 规划中（v0.2–v0.3） | 工作台「计划」页与任务数据；见 [design/TASK-SPEC.md](design/TASK-SPEC.md) |

后续追加的需求：

| 需求 | 状态 | 说明 |
| --- | --- | --- |
| 项目文件夹更名为 `dsh-mcmods-studio-plugin` | 已完成 | 包名、客户端模块 id、接口路径、数据目录同步统一 |
| 左侧栏显示插件入口 | 已完成 | `sidebar.panellist`，`order: 2`，与「插件市场」「上下文洞察」同区 |
| 右侧栏显示「模组工坊」标签 | 已注册，待视觉确认 | `sidebarRightTabs` + `sidebar.right.pane.tab`（key `mc-mod-studio`），内容为项目概览与选中物品属性 |

## 2. 已实现功能

### 2.1 项目管理

- 项目列表：显示全部已登记项目，标记目录缺失的项目；
- 新建项目：指定目录、名称、modid、版本、加载器，自动创建 `.mcstudio/`；**目录可以位于任意位置**，只要求为空或尚不存在；
- 目录选择：新建项目、导入工程、扫描根目录三处都可点「浏览…」调起系统文件夹选择器，也可手动粘贴路径；
- 打开 / 关闭项目；打开后主面板各页共享同一份项目数据；
- 扫描候选工程：扫描「扫描根目录」下的子目录，识别 `fabric.mod.json`、`mods.toml`、`neoforge.mods.toml`、`build.gradle`；
- 扫描状态：以项目目录内的 `.mcstudio/studio.json` 标记判断是否已导入（不依赖注册表路径）；已导入的显示「已导入」徽章、导入时间与「打开」按钮，未导入的显示「导入」按钮；
- 标记文件：新建、导入、添加、打开项目时写入 `.mcstudio/studio.json`，保存 `projectId`、首次导入时间、来源与目标版本；只有 `project.json` 的老项目视为已导入，首次打开时自动补写标记；
- 导入已有工程：先读 `gradle.properties` 补全项目信息（modid、名称、版本、作者、许可证、包名、MC 与加载器版本范围），再按 [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) 的固定路径精确扫描——`assets/<modid>/textures/item|block`、`models/item|block`、`blockstates`、`lang`，`data/<modid>/recipes`、`loot_tables/blocks`、`tags/items|blocks`、`advancements`，并从 `src/main/java` 提取 `register("…")` 注册名；
- 导入信息校验：`modid`、`minecraft_version`、加载器版本缺失时抛异常要求人工介入；同一字段在「导入表单 / gradle.properties / 工程描述文件」三处不一致时也抛异常，并列出全部取值与来源；
- 导入三分支判定：在项目列表中 → 抛「该目录已经是工坊项目，可直接打开」；有工坊数据但不在列表（曾被移除）→ 走添加流程并补登记；全新目录 → 正常导入；
- 导入确认：点击「下一步」先调用 `project.analyzeImport` 展示将新增的条目、已存在条目、类型冲突与无对应资源的条目，确认后才写入；
- 重新导入：项目列表每行提供「重新导入」按钮，确认后按差异同步——新增条目自动创建，已有条目默认保留（可选按扫描结果改写类型冲突项）；
- 导入安全：导入 / 重新导入前把 `.mcstudio/` 与 `docs/mcstudio-snapshot.md` 备份到插件数据目录，失败自动回滚；分析结果带 `proof`，预览后工程有变化会拒绝执行并要求重新分析；
- 项目详情：列表每行提供「详情」按钮，默认只显示 modid、Minecraft 版本、加载器；作者、许可证、包名、版本范围等收在「更多信息」里；
- 导入分类：有 blockstate / 方块模型 / 方块贴图的条目归为「方块」；`CreativeModeTab` 注册文件里的条目归为「创造模式标签」，不计入物品；其余归为「物品」；语言文件名（`zh_cn`、`en_us`）不作为条目；
- 加载器识别：`fabric.mod.json` 直接判定 Fabric；`mods.toml` 因 1.20.1 的 Forge 与 NeoForge 共用文件名，改由 `build.gradle` / `gradle.properties` 中的 `net.neoforged` / `neo_version` 区分；
- 命名空间记录：快照中列出 `assets/` 与 `data/` 下检测到的全部命名空间，并标注是否属于本项目；
- 生成 `docs/mcstudio-snapshot.md`：按资源类型列出数量与清单（物品贴图、方块贴图、模型、方块状态、语言、配方、战利品表、标签、进度、注册名、创造模式标签）；
- 修改扫描根目录（默认 `D:\program`）。

### 2.2 构想

- 构想条目增删改；
- 字段：名称、说明、目标、玩法循环、约束、内容清单（existing/planned/deprecated）、关联系统、验收、假设、未决问题、状态（构思 / 已澄清 / 已确认 / 规划中 / 实现中 / 已完成）、优先级、目标版本、备注；
- 导出 `docs/FEATURES.md`（按状态分组）；
- 编辑草稿：未保存输入存 localStorage，重新打开自动恢复；离开页面提示、取消确认。

### 2.3 物品管理

- 列表视图：表格展示贴图缩略图、ID、显示名、类型、最大堆叠、耐久与操作按钮；
- 画布视图：4 列网格起排，卡片可自由拖拽，松手后把坐标保存到物品的 `canvas` 字段；
- 搜索：按 ID 或显示名过滤；
- 属性编辑：19 个字段，分五组——
  - 基础属性：最大堆叠、稀有度、创造模式分类、渲染模型、附魔光效；
  - 数值属性：最大耐久、附魔能力、修复材料、燃烧时间；
  - 行为属性：工具等级、采集等级、攻击伤害、攻击速度、护甲值、食物恢复值、食物饱和度；
  - 标签属性：物品标签、方块标签；
  - 兼容性：加载器差异备注；
- 物品类型：普通物品、方块、工具、武器、盔甲、食物、材料、创造模式标签（`creative_tab`，导入时自动归类，不计入物品）；
- 删除物品；
- 编辑器分页：基础（含中文名 / 英文名）/ 属性 / 配方 / 标签 / 模型与备注 5 个页签，切换页签不丢失输入；
- 语言页：集中查看与编辑全部物品语言键，支持缺失筛选、行内编辑与批量保存；语言键随物品创建 / 删除维护；
- 编辑草稿：未保存输入存 localStorage，重新打开自动恢复；离开页面提示、取消确认；
- 内容历史：物品页顶部常驻「历史记录」，记录每次内容写入，可回到任一历史步骤（保留该步、撤销其后），被回滚记录在下一次修改时归档；
- 导出 `docs/ITEMS.md`（总览）与 `docs/ITEMS/<id>.md`（单件详情）。

### 2.4 贴图与模型

- PNG 上传：校验文件魔数、必须为正方形、单文件 ≤ 2MB；
- 贴图预览（像素化渲染）与列表；`textures/item` 与 `textures/block` 都支持上传 / 删除；
- 方块贴图：优先按 blockstate → 模型 → parent 链解析；没有 blockstate/模型时回退到同名 `textures/block/<id>.png`；
- 模型 JSON 查看、编辑、保存前校验；可为缺失模型生成默认 `item/generated` 模型；
- 缺失素材统计：哪些物品没有贴图、哪些没有模型；
- 存储位置：优先写入 `src/main/resources/assets/<modid>/textures/item|block` 与 `models/item`；工程没有标准资源目录时回退到 `.mcstudio/assets/<modid>/`。

### 2.5 文档导出

一次导出五个文件到项目 `docs/`：

| 文件 | 内容 |
| --- | --- |
| `FEATURES.md` | 构想，按状态分组 |
| `ITEMS.md` | 物品总览表 |
| `ITEMS/<id>.md` | 单件物品的完整属性文档 |
| `ASSETS.md` | 贴图与模型清单，含缺失提示 |
| `README.md` | 文档索引 |

导出内容全部来自 `.mcstudio/` 数据，可安全提交进 git；重复导出会覆盖同名文件。

### 2.6 构建教程

- 内置 1.20.1 三种加载器的 IDEA 构建流程（`docs/BUILD-GUIDE.md`），在「构建教程」页展示。

### 2.7 界面入口

- **左侧图标区**：`sidebar.panellist`，id 与 label 均为「模组工坊」，`order: 2`；
- **主面板**：`main` 槽位，key `mc-mod-studio`；
- **右侧栏标签**：`sidebarRightTabs` 注册 `id`/`kind` 为 `mc-mod-studio` 的标签类型，`sidebar.right.pane.tab` 渲染 `SidebarStudioPanel`；
  - 显示当前项目概览：名称、modid、加载器、版本、物品数、功能数与已完成数；
  - 显示主面板中选中物品的属性：显示名、类型、ID、最大堆叠、耐久、画布坐标、标签、描述；
  - 在右侧栏「开始」页提供「模组工坊」引导卡片（`guide`）。

### 2.8 运行与数据

- 项目数据：`<项目>/.mcstudio/project.json`、`features.json`、`items/<id>.json`、
  `studio.json`（工坊标记）、`content-history.json`（内容历史）、`summary.json`（派生摘要）、`structure.json`（派生代码结构）；
- 语言文件：`assets/<modid>/lang/zh_cn.json`、`en_us.json`（标准工程）或 `.mcstudio/assets/<modid>/lang/`（回退）；语言键随物品创建 / 删除维护；
- 插件注册表：`$DSH_HOME/mcmods-studio/registry.json`（记录扫描根目录与项目列表）；
- 导入前备份：`$DSH_HOME/mcmods-studio/backups/`（`.mcstudio/` 与快照，失败时回滚）；
- 内容备份：`$DSH_HOME/mcmods-studio/backups/<项目>/`（每次内容或语言写入前复制相关资源文件，历史步骤引用它）；
- Host 接口：`POST /mcmods-studio/api`，共 **54 个动作**：

| 分组 | 动作 |
| --- | --- |
| 项目与注册表 | `boot`、`projects.scan`、`projects.add`、`projects.remove`、`projects.remember`、`registry.setRoot`、`project.create`、`project.open`、`project.import`、`project.analyzeImport`、`project.reimport`、`project.saveMeta` |
| 构想与物品 | `features.list`、`features.save`、`features.delete`、`items.list`、`items.save`、`items.delete` |
| 计划 | `workbench.plan`、`systems.list/save/delete`、`tasks.list/save/delete` |
| 内容 | `content.get/preview/apply/rollback`、`content.history.list/rollback` |
| 语言 | `lang.list`、`lang.preview`、`lang.save`、`lang.ensure` |
| 素材与文档 | `assets.list`、`assets.upload`、`assets.read`、`assets.readMany`、`assets.delete`、`assets.model.get`、`assets.model.save`、`assets.root`、`docs.export`、`guide` |
| 代码结构 | `structure.refresh`、`structure.get`、`structure.find`、`structure.annotate` |
| Agent 与诊断 | `agent.summary`、`agent.validate`、`agent.tools`、`agent.call`、`debug.clientGraph` |

- Agent 工具：22 个，注册为 DSH 原生 `mcmods_*` 工具，清单见 [INDEX.md](INDEX.md) 第 4 节。

## 3. 未实现功能

### 3.0 Agent 接入（已完成）

v0.1.x 已补齐面向 agent 的能力层，不再需要自写脚本探测项目。

| 能力 | 落地 | 说明 |
| --- | --- | --- |
| 原生工具 | `lib/tools.js` + `lib/tool-bridge.js` | 27 个工具，注册为 DSH 原生 `mcmods_*` 工具，agent 可直接调用 |
| 项目摘要 | `lib/summary.js` | `.mcstudio/summary.json`，12 物品约 1.2 KB，写操作后自动刷新 |
| 紧凑 / 详细双表示 | `item_list` / `item_get` | 列举仅回 id / 名称 / 类型（12 物品约 300 字节）；详情才回 19 个字段 |
| schema 外置 | `data/schema.json` | 由 `lib/schema.js` 生成，`test/10-schema-sync.mjs` 守住一致性 |
| 校验器 | `lib/validate.js` | 9 类检查，分级 error / warning |
| 导入提示 | `lib/import.js` 的 `notices[]` | 占位符解析、加载器判定来源等结论随导入返回 |
| 通用入口 | `agent.call` | agent 只需记住一个动作名 + 工具名，不必为每个操作拼请求 |

界面也已消费这批能力：物品页显示校验提示条，右侧栏显示缺失素材数量，
导入确认弹窗显示判定提示与四类差异。

### 3.0.1 素材与状态修复（已完成）

针对实际使用中暴露的三个问题，本次修复前两项，第三项留待下一轮。

| 问题 | 根因 | 解决 |
| --- | --- | --- |
| 方块贴图不显示 | `listAssets` 只扫 `textures/item` 与 `models/item`，完全没看 `textures/block`、`models/block`、`blockstates` | 新增 `describeBlock` 按「blockstate → 模型 → parent 链 → 贴图」解析，素材页新增「方块面贴图」区块 |
| 项目切换不持久化 | `StudioPage` 挂载时无条件打开列表第一个未缺失项目 | 注册表新增 `lastProject`，新动作 `projects.remember`，启动时优先恢复上次项目 |
| 工程结构文档 | 缺少结构解析与实时更新机制 | 已在 3.0.2 完成 |

方块解析的具体规则：读 `blockstates/<id>.json` 收集 `variants` 与 `multipart`
引用的模型；沿 `parent` 链自下而上合并 `textures`；展开 `#all` 这类变量引用
（最多 8 层防循环）；按 `elements[].faces` 得出每个面用哪张贴图。六面相同标记
`uniform`，去重后只算一张。无 blockstate 时回退到同名 `models/block/<id>.json`。

遗留限制：`elements` 定义在 `minecraft:` 内置父模型里时，面信息取不到——内置
资源不在工程内，只按模型声明的 `textures` 归类。此时 `faces` 可能为空，界面
退回按 id 显示缩略图。

### 3.0.2 代码结构文档（已完成）

让 agent 不必反复 grep 源码：一次读出「哪段代码实现什么」「功能由哪些代码实现」。

| 层 | 落地 | 说明 |
| --- | --- | --- |
| 确定性扫描 | `lib/structure.js` 的 `parseJava` | 解析包、导入、类、字段、方法、注册调用，每项带行号；不调用模型 |
| 增量更新 | `refreshStructure` | 按文件哈希：未变整条复用（含注解），变了重扫并标记 `stale` |
| 语义注解 | `setAnnotation` | agent 写「这段代码实现什么」，只改指定文件 |
| 注册反查 | `findRegistration` | 回答「`ruby` 注册在哪个文件哪一行」 |
| 接入导入 | `importProject` / `reimportProject` | 导入后自动生成初版，失败不影响导入 |
| 合并摘要 | `summary.json` 的 `code` 字段 | 只放注册点与计数，明细留在 `structure.json` |
| 对外能力 | 4 个 HTTP 动作 + 4 个 agent 工具 | `structure.refresh/get/find/annotate` |

**为什么扫描不调模型**：

- 导入原本 1 秒级，调模型会变成分钟级；
- 同一份源码两次导入应得到同样的结构，否则破坏「事实只有一份」；
- 没有网络或未配置凭据时导入不能失败。

因此「功能由哪些代码实现」用确定性扫描，「这段代码实现什么功能」由 agent
在对话中按需补写，写进 `annotation`。

**解析边界**：按行浅解析，不建 AST。目标定位是「找得到」而非编译级准确，
跨行复杂泛型、匿名内部类里的方法可能漏掉。字符串与注释会先被掩码成空格，
避免把注释里的 `register("fake")` 当成真实注册。已支持「声明单行、初始化换行」
的常见字段写法与带类型形参的泛型方法；字段只从类体顶层收集，方法体局部变量
不会被误记。通过 `registerBlocks("id", ...)` 这类自定义辅助方法间接注册的
条目仍识别不到（调用处没有字符串字面量 id）。

### 3.0.3 版本规划与 v0.1.1 维护补丁（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 版本规则 | 新增 [VERSION-PLAN.md](VERSION-PLAN.md) | 当时规则：每次优化或修复 bug 后 PATCH +1；MINOR 按路线阶段；MAJOR 用于稳定版。2026-10-31 调整为「v0.x 为测试原型、v1.0.0 为正式稳定版、之后 MINOR 对应路线里程碑、PATCH 覆盖修复与里程碑内小功能、MAJOR 仅用于底层架构变化」，见 VERSION-PLAN 第 1 节 |
| 发版流程 | 同上，第 3 节 | 测试 → 版本号 → CHANGELOG → 全部文档 → 版本历史 → 提交 |
| 结构扫描修复 | `lib/structure.js` | 跨行字段声明、泛型方法与局部变量误判、`BlockEntity` 归类顺序、含 `/` 的注册 id |
| 摘要同步 | `lib/tools.js` | `structure_refresh` / `structure_annotate` 工具路径与 HTTP 动作一致，写后刷新 `summary.json` |
| 文档校准 | `docs/` 全量 | 工具 21、动作 37、测试 159、版本 v0.1.1；修复 `VERSION-PLAN.md` 死链 |

### 3.0.4 v0.1.2 可靠性补丁（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 持久写入 | `lib/registry.js` | `writeJson` / `writeText` 改为临时文件 + fsync + rename + 目录 barrier；随机临时名，避免崩溃空文件与并发相撞 |
| 导入备份 | `lib/backup.js` | 导入 / 重新导入前备份 `.mcstudio/` 与 `docs/mcstudio-snapshot.md`；失败自动回滚，成功返回 `imported.backup` |
| 导入 proof | `lib/import.js` | `analyzeImport` 返回 proof；`reimport` 校验 proof，预览后工程变化会拒绝执行 |
| 错误边界 | `client.js` 的 `StudioRoot` | 捕获 `StudioPage` 渲染异常，提供重试 / 刷新，避免 DSH 退休 main slot |
| 编辑器草稿 | `client.js` 的 `useDraftState` | 物品 / 构想草稿存 localStorage，重新打开恢复；离开提示与取消确认 |
| 测试 | `test/16-reliability.mjs` | 持久写入、备份回滚、备份保留、首次导入清理、proof 失效；总计 16 个文件 / 164 项 |

### 3.0.5 v0.1.3 导入分类与贴图显示（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 创造模式标签 | `lib/import.js`、`lib/schema.js` | 识别 `DeferredRegister<CreativeModeTab>` / `CreativeModeTab.builder` / `Registries.CREATIVE_MODE_TAB`；标签单独归为 `creative_tab`，摘要、素材、校验与侧栏不计入物品；`merge` 重新导入会纠正旧数据 |
| 方块贴图回退 | `client.js` 的 `AssetsTab`、`lib/assets.js` | 没有 blockstate / 方块模型时回退读取 `textures/block/<id>.png`；上传 / 删除支持 `kind: block`；`missing` 不再把「有贴图缺模型」算成缺贴图 |
| 测试 | `test/07-scan.mjs`、`test/12-render.mjs` | 标签分类与 merge 纠正、无 blockstate 方块贴图渲染；总计 16 个文件 / 166 项 |

### 3.0.6 方向调整（2026-10-29）

产品从「内容管理器」升级为「AI 工程工作台」。v0.1.3 的代码、测试、备份、草稿保护和工具继续作为基础；后续主线改为：

- 想法卡 → 系统卡 → 模板 → 任务包 → 上下文包 → 验收；
- 图形化编辑物品/配方/标签/语言/模型等数据；
- 代码逻辑交给模板 + AI 任务，不做可视化编程。

旧 v0.2 的「关系图 + 设置页」后移；旧路线存档见 [archive/PLAN-v0.1.md](archive/PLAN-v0.1.md)。

### 3.0.7 M1.1 工作台计划数据（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 系统卡 | `lib/workbench.js`、`.mcstudio/systems.json` | CRUD、字段归一、状态；资源字符串归一为 `{kind,path,required}` |
| 任务包 | 同上、`.mcstudio/tasks.json` | CRUD、所属系统校验、允许路径归一、检查对象归一 |
| 计划读取 | `workbench.plan` | 一次返回想法（features）、系统、任务 |
| 计划页 | `client.js` 的 `PlanTab` | 系统/任务卡片、新增/编辑/删除弹窗 |
| 测试 | `test/17-workbench.mjs`、`test/12-render.mjs` | 数据 CRUD、字段归一、引用校验、计划页渲染；总计 17 文件 / 172 项 |

> M1.1 为工作台骨架；内容编辑与想法字段由 M1.2/M1.3 补齐。

### 3.0.8 M1.2 内容编辑（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 语言 | `content.get/apply` | `zh_cn` / `en_us` 按物品/方块键合并，保留原有键 |
| 配方 | 同上 | 有序、无序、熔炉；材料无命名空间默认当前模组 |
| 模型 | 同上 | 写入 `models/item/<id>.json`，generated/handheld |
| 预览 | `content.preview` | 只返回将写入的文件，不落盘 |
| 备份/回滚 | `content.apply` / `content.rollback` | 写入前复制资源，失败自动恢复；回滚校验路径 |
| 编辑器 | `ItemEditor` | 语言、配方类型、pattern/材料、模型选择；保存前列出变更文件 |
| 测试 | `test/18-content.mjs` | 预览、应用、回填、回滚、标准路径、非法配方；总计 18 文件 / 182 项 |

> 标签与想法字段在 M1.3 补齐；M1.2 已有内容预览、备份、回滚与标准路径写入。

### 3.0.9 M1.3 标签与想法字段（已完成，v0.2.0）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 资源标签 | `lib/content.js` 的 `readTagFiles` / `tagChanges` | 扫描 `data/*/tags/items|blocks`，按物品增删标签，保留其他成员与 `replace` |
| 标签编辑 | `ItemEditor` | 「资源标签」一行一个；方块写 `tags/blocks`，物品写 `tags/items` |
| 想法字段 | `lib/entries.js`、`FeatureEditor` | 目标、玩法循环、约束、内容清单、系统、验收、假设、未决问题 |
| 内容状态 | 同上 | `content[]` 区分 `existing/planned/deprecated` |
| 测试 | `test/04-entries.mjs`、`test/18-content.mjs`、`test/12-render.mjs` | 字段持久化、标签写入/移除、编辑器渲染；总计 18 文件 / 182 项 |

**v0.2.0 收口**：M1 完成。M2 进入 API 索引、模板、上下文包与检查；M1 的 `applied` 资源事务仍按“物品先保存、资源失败回滚”执行。

### 3.0.10 v0.2.1 内容编辑修复与内容历史（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| Pattern/材料键换行 | `client.js` 的 `ItemEditor`、`contentPayload` | 输入阶段只保存原始文本（含空行、末尾换行、Pattern 空格），预览/保存时才解析；不再边输入边切数组 |
| 多行解析 | `lib/content.js` 的 `lines` / `rawLines` | 同时接受数组与多行字符串，agent 直接调用也可用；Pattern 只丢空行、不 trim |
| 内容历史 | `lib/history.js`、`.mcstudio/content-history.json` | 每次 `content.apply` 成功写入后记一步；元数据在项目内，备份仍在插件数据目录 |
| 回到某步 | `content.history.rollback` | 逆序恢复目标步之后，目标步保持 `active`、后续标记 `rolledBack`；默认 `toStep`，`beforeStep` 为预留模式 |
| 失败处理 | 同上 | 备份缺失/恢复失败立即停止，该步标记 `failed`，已完成的步骤保留 `rolledBack` 并落盘 |
| 归档与上限 | `appendHistoryEntry` | 下一次成功写入时把 `rolledBack` 归档为 `archived`；非归档记录超过 50 条时归档最旧记录，不删记录与备份 |
| 兼容 | `content.rollback` | 旧 `{backupDir}` 调用继续可用；新界面不再调用 |
| UI | `ItemsTab` / `HistoryModal` | 常驻「历史记录」；列出时间、物品、改动类别、文件数与状态；确认文案写明「保留这一步，撤销其后 N 步」 |
| 测试 | `test/18-content.mjs`、`test/12-render.mjs` | 多行解析、历史跨调用读取、中间步回滚、归档、备份缺失、损坏降级、50 条上限、渲染与输入保留；总计 18 文件 / 194 项 |

**v0.2.1 收口**：四项历史配置以固定默认值落地（`toStep` / 保留备份 / 当前物品 / 50 条），设置页仍未实现，规划见 [plans/SETTINGS-PLAN.md](plans/SETTINGS-PLAN.md) §2.3。

### 3.0.11 v0.2.2 物品编辑器贴图预览修复（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 贴图栏恒为空 | `client.js` 的 `ItemsTab` / `ItemEditor` | 列表读取缩略图的键是 `item/<id>`（方块为主贴图名），编辑器却按 `images[draft.id]` 取；改为由 `ItemsTab` 传 `imageFor(id)`，内部走 `thumbKey` |
| 上传后不刷新 | 同上 | 编辑器上传成功后调用 `onTextureUploaded`，重新读取缩略图并刷新素材列表 |
| 测试 | `test/12-render.mjs` | 编辑器按 `imageFor` 渲染贴图；物品页点「编辑」后编辑器拿到正确的映射；总计 18 文件 / 196 项 |

### 3.0.12 v0.2.3 编辑器分页与语言页（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 编辑器分页 | `client.js` 的 `ItemEditor` | 5 页签：基础（含中文名 / 英文名）/ 属性 / 配方 / 标签 / 模型与备注；切换不丢输入，保存 payload 不变 |
| 语言页 | `client.js` 的 `LangTab`、`lib/lang.js` | 列出全部物品语言键，缺失统计与筛选，行内编辑、批量保存；未知键只读 |
| 语言生命周期 | `lib/lang.js`、`lib/api.js` | 创建物品连带建键（英文回填）、删除连带删键、旧项目补建；失败返回 `warnings`，不阻塞物品操作 |
| 历史适配 | `lib/history.js`、`HistoryModal` | 历史条目新增 `scope`；语言页 / 补建记项目级，创建 / 删除记物品级；弹窗显示「项目级」徽章 |
| 接口 | `lib/api.js` | 新增 `lang.list/preview/save/ensure`；动作 50 → 54 |
| 测试 | `test/19-lang.mjs`、`test/12-render.mjs` | 语言列表、保存、删除、补建、损坏、路径、分页与语言页渲染；总计 19 文件 / 210 项 |

### 3.0.13 v0.2.4 注册表清理工具（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 移除登记 | `lib/tools.js` 的 `project_remove` | 从注册表移除项目，不删除目录；目录已删除时也可移除；未登记时返回 `removed: false` |
| 测试 | `test/09-agent.mjs`、`test/11-tool-bridge.mjs` | 正常移除、目录已删除；工具数 22 → 23；总计 19 文件 / 212 项 |

### 3.0.14 v0.2.5 Agent 工具能力补齐（已完成）

| 事项 | 落地 | 说明 |
| --- | --- | --- |
| 内容工具 | `lib/tools.js` 的 `content` | `get` / `preview` / `apply` / `history.list` / `history.rollback` |
| 语言工具 | 同上 `lang` | `list` / `preview` / `save` / `ensure` |
| 素材工具 | 同上 `asset` | `list` / `upload` / `delete` / `model.get` / `model.save` |
| 项目维护 | 同上 `project_admin` | `reimport` / `add` / `saveMeta` / `setRoot` |
| 计划删除 | `workbench` | 新增 `system.delete` / `task.delete` |
| 测试 | `test/20-agent-tools.mjs` | 8 项；工具数 27；总计 20 文件 / 220 项 |

### 3.1 目标能力（v0.3 起）

| 里程碑 | 能力 | 说明 |
| --- | --- | --- |
| M1 / v0.2.0 | 工作台骨架 + 内容编辑 MVP | 想法卡、系统卡、任务卡最小页面；物品属性、配方、标签、语言、模型；应用预览、备份、回滚 |
| M1 / v0.2.1 | 内容编辑修复与历史 | Pattern/材料键换行；内容历史持久化、回到某步的递归回滚、rolledBack 保留与归档 |
| M1 / v0.2.2 | 物品编辑器贴图预览修复 | 按缩略图键映射取图；上传后立即刷新预览与素材 |
| M1 / v0.2.3 | 编辑器分页与语言页 | 5 页签；语言页、语言键生命周期与语言写入历史 |
| M1 / v0.2.4 | 注册表清理工具 | 新增 `project_remove`，支持目录已删除时清理登记 |
| M1 / v0.2.5 | Agent 工具能力补齐 | content / lang / asset / project_admin；workbench 支持删除 |
| M2 / v0.3.0 | API 索引 + 模板 + 上下文包 + 检查 | 从 Gradle classpath 提取签名（含 protected/继承/嵌套类）；模板清单/参数/渲染；`context.pack`；允许路径、structure-diff、资源引用、注册配对检查 |
| M3 / v0.4.0 | 代码生成 + Lock 试点 | 标记区块生成；方块实体/菜单、钥匙、网络同步模板；Lock「电子锁」端到端 |
| M4 / v0.5.0 | 进阶内容与稳定 | 战利品表、创造标签、多加载器模板、性能基线 |
| M5 / v1.0 | 稳定与 1.21.1 | 数据迁移、完整回归、发版验收 |

**后移**：关系图、设置页、完整代码工作区。它们不是取消，而是在工作台与模板/任务稳定后再做。

> 完整的阶段划分、对象模型与验收标准见 [PLAN.md](PLAN.md) 和 [design/](design/README.md)。
> v0.1.x 仍有待修复问题，优先于 v0.2 新功能；新功能进入 v0.2 前先清空阻塞项。
> 可靠性、导入安全、设置页与图画布的可借鉴模式见 [REFERENCE-CUIGENGJI.md](REFERENCE-CUIGENGJI.md)。

### 3.2 当前版本不做

- **v0.1.3 只含内容管理基础**；v0.2.0 已加入工作台计划与内容编辑，v0.2.1 补齐内容历史；模板、API 索引与代码生成从 v0.3 起分阶段加入；
- 不做完整 IDE：不实现编译、运行、调试、反编译；
- 不做自由节点式可视化编程：Java 逻辑仍由模板 + AI 任务完成；
- 不做云端同步或多人协作；
- 当前版本不修改用户的 Java、gradle、`mods.toml` 等工程文件（导入与结构扫描只读取）；代码生成只在后续版本的标记区块内、经用户确认后写入。

## 4. 项目要求

### 4.1 目标平台

- **当前适配：Minecraft 1.20.1（唯一版本）**；其他版本在后续版本中逐步适配，路线见 [PLAN.md](PLAN.md) 第 2 节；
- v0.1.0 – v0.5.0 只保证 1.20.1，不提供跨版本兼容；
- v1.0.0 起新增 1.21.1，之后按需扩展 1.19.2 / 1.16.5 等候选版本；
- Forge 47.x、NeoForge 47.1.x、Fabric Loader 0.15.x + Fabric API（均对应 1.20.1）。

### 4.2 运行环境

| 项 | 要求 |
| --- | --- |
| DSH | 已安装本插件（bundle 方式） |
| JDK | **17**（1.20.1 构建必需；若本机是 JDK 21，需另装 17 并在 IDEA 中设为 Gradle JVM） |
| IDE | IntelliJ IDEA（社区版即可） |
| 构建工具 | MDK 自带 `gradlew`，无需全局 Gradle |
| 网络 | 首次构建需访问 Mojang、NeoForged、FabricMC 的 maven |

### 4.3 使用约束

- 新建与导入的项目可以位于任意目录；「扫描根目录」只用于批量扫描候选工程，不再是项目位置的限制；
- 只有存在 `.mcstudio/` 的目录才会被当作工坊项目读写；
- 业务数据只写入 `.mcstudio/` 与 `docs/`，素材写入标准资源目录或 `.mcstudio/assets/`；
- 贴图必须是 PNG、正方形、单文件 ≤ 2MB；接口请求体上限 8MB；
- 界面文案为中文。

### 4.4 数据格式要求

- 工坊数据使用 JSON，注册表带 `schemaVersion`（当前为 1）；
- 物品 ID 使用小写字母、数字、下划线（与 Minecraft 注册名规范一致）；
- 文档导出为幂等操作，同名文件会被覆盖；
- 画布坐标保存在物品的 `canvas: { x, y }` 字段，单位为像素。

## 5. 验证状态

已通过自动化验证（`npm test`，**20 个文件、220 项全部通过**）：

| 层 | 覆盖 | 手段 |
| --- | --- | --- |
| Host 业务 | 146 项 | 直接调 `dispatch`，每个用例用隔离的临时目录 |
| 方块贴图解析 | 7 项 | 真实工程结构：blockstate、parent 继承、multipart、无 blockstate 回退 |
| 项目持久化 | 10 项 | 记住 / 恢复 / 清除 / 移除清理 / 旧格式兼容 |
| 代码结构文档 | 15 项 | Java 解析、注册反查、跨行字段、泛型方法、按哈希增量、解析器版本、注解失效、摘要同步 |
| 可靠性 | 5 项 | 持久写入无临时残留、备份失败回滚、备份成功保留、首次导入失败清理、导入 proof 失效与重新导入 |
| 客户端加载 | 8 项 | 假 `__ModuleLoader__` + 假 React，验证加载、模块 id、座位注册 |
| 渲染结构 | 27 项 | 假 React 渲染组件，断言文本、按钮、条件分支、历史列表、输入保留、贴图映射与语言页 |
| schema 一致性 | 2 项 | 比对 `schema.js` 与 `data/schema.json` |

接口级验证：

- 接口：`boot`、项目创建与打开、物品保存、文档导出、贴图上传、模型生成；
- 导入：Fabric 工程与 Forge 工程均能识别 modid、版本、贴图与 Java 注册名；
- 可靠性：导入前备份、失败回滚、proof 拒绝过期预览均有自动化用例；
- 数据：画布坐标持久化、快照生成、注册表读写、摘要重建；
- 代码结构：真实 Forge 工程扫描 14 文件 / 15 类 / 38 方法，注册点按 `items` 归类；
- 内容历史：多次修改后跨调用读取、回到中间步、rolledBack 保留、下一次写入归档、备份缺失停止、损坏降级、50 条上限均有自动化用例；
- Agent：27 个工具全部注册到宿主，`agent.tools` 返回 23 工具 / 54 动作；
- 槽位：`main`、`sidebar.panellist`、`sidebar.right.pane.tab` 均已确认注册且处于激活状态；
- 安装：bundle 安装与卸载、接口新旧路径切换。

尚未验证（需人工确认）：

- **页面视觉效果**：样式数值、间距、配色、布局对齐；
- **鼠标交互**：拖拽手感、悬停反馈、弹窗动画；
- 右侧栏「开始」页引导卡片的实际显示效果；
- 真实 IDEA + Gradle 构建流程（未实际执行 `gradlew build`）。

> 渲染测试只验证「渲染出哪些元素」，不执行 CSS，样式问题仍需在页面上人工核对。

## 6. 维护约定

- 功能完成、取消或调整优先级时，同步更新本文档与 [CHANGELOG.md](CHANGELOG.md)；
- 每次改动按 [VERSION-PLAN.md](VERSION-PLAN.md) 判断版本类型（PATCH / MINOR / MAJOR），并同步全部文档；
- 本文档只描述**当前状态**，不记录历史；
- 需求变更时先改第 1 节对照表，再改代码。
