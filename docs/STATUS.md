# 项目状态：已实现、未实现与要求

> 适用版本：模组工坊（`dsh-mcmods-studio-plugin`）v0.1.1
> 更新日期：2026-10-28
> 本文档回答三个问题：**现在能做什么**、**还不能做什么**、**必须遵守什么**。
> 历史变更见 [CHANGELOG.md](CHANGELOG.md)，版本规则与发版流程见 [VERSION-PLAN.md](VERSION-PLAN.md)，开发方式见 [DEVELOPMENT.md](DEVELOPMENT.md)，版本路线与宗旨见 [PLAN.md](PLAN.md)，代码索引见 [INDEX.md](INDEX.md)。

## 0. 设计目的

> **宗旨**：模组工坊是一个「人机共用」的模组开发工作台。它把模组开发中可结构化的部分
> （想做什么、有哪些内容、每个内容的属性、素材在哪、代码该长什么样）从笔记与源码里抽出来，
> 变成一份人和 agent 都能直接读写的结构化事实。

对 agent 提供准确、紧凑、可校验的项目上下文；对用户提供直观的项目关系与低门槛的编辑方式。
判断标准：新功能若既没让 agent 更准确理解项目，也没让用户更容易表达意图，就不应做。

当前承担的三件事：

1. **为 agent 提供上下文**（**已完成**）：21 个 DSH 原生工具、项目摘要 `summary.json`、
   schema 外置 `data/schema.json`、9 类校验器、导入判定提示；
2. **为用户提供直观平台**（**大部分完成**）：构想清单、物品属性、贴图模型、文档集中在一处，
   可画布与列表浏览；缺依赖图、时间线与内联编辑；
3. **衔接设计与实现**（**未开始**）：结构化数据生成 Java 注册代码与资源 JSON，规划在 v0.3。

## 1. 需求对照

| # | 需求 | 状态 | 实现落点 |
| --- | --- | --- | --- |
| 1 | 明确的模组功能列表 | 已实现 | 「构想」页；导出 `docs/FEATURES.md` |
| 2 | 画布 / 列表形式的物品管理 | 已实现 | 「物品」页双视图；画布拖拽坐标写入物品 `canvas` 字段 |
| 3 | 清晰明了的物品属性文档 | 已实现 | 19 个字段、五组分类的属性编辑器；导出 `docs/ITEMS/<id>.md` |
| 4 | 贴图、模型管理页面 | 已实现 | 「贴图与模型」页；上传、预览、模型 JSON 编辑、缺失统计 |
| 5 | 工程文件格式清晰，`docs/` 下存放 Markdown 更新日志与开发文档 | 已实现 | 项目数据集中在 `.mcstudio/`；插件自身文档在 `docs/` |
| 6 | 允许编写代码（浏览 / 编辑源码、生成注册代码） | 计划中（v0.3） | 见 [PLAN.md](PLAN.md) 第 4 节 v0.3.0；当前版本不含代码工作区 |
| 7 | 图形化创建与修改模组内容（物品 / 方块 / 配方等） | 部分实现 | 物品已支持图形化创建与编辑；方块、配方、语言文件在 v0.4 计划 |

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
- 项目详情：列表每行提供「详情」按钮，默认只显示 modid、Minecraft 版本、加载器；作者、许可证、包名、版本范围等收在「更多信息」里；
- 导入分类：有 blockstate / 方块模型 / 方块贴图的条目归为「方块」，其余归为「物品」；语言文件名（`zh_cn`、`en_us`）不作为条目；
- 加载器识别：`fabric.mod.json` 直接判定 Fabric；`mods.toml` 因 1.20.1 的 Forge 与 NeoForge 共用文件名，改由 `build.gradle` / `gradle.properties` 中的 `net.neoforged` / `neo_version` 区分；
- 命名空间记录：快照中列出 `assets/` 与 `data/` 下检测到的全部命名空间，并标注是否属于本项目；
- 生成 `docs/mcstudio-snapshot.md`：按资源类型列出数量与清单（物品贴图、方块贴图、模型、方块状态、语言、配方、战利品表、标签、进度、注册名）；
- 修改扫描根目录（默认 `D:\program`）。

### 2.2 构想

- 构想条目增删改；
- 字段：名称、说明、状态（构思 / 规划中 / 实现中 / 已完成）、优先级（高 / 中 / 低）、目标版本、备注；
- 导出 `docs/FEATURES.md`（按状态分组）。

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
- 物品类型：普通物品、方块、工具、武器、盔甲、食物、材料；
- 删除物品；
- 导出 `docs/ITEMS.md`（总览）与 `docs/ITEMS/<id>.md`（单件详情）。

### 2.4 贴图与模型

- PNG 上传：校验文件魔数、必须为正方形、单文件 ≤ 2MB；
- 贴图预览（像素化渲染）与列表；
- 模型 JSON 查看、编辑、保存前校验；可为缺失模型生成默认 `item/generated` 模型；
- 缺失素材统计：哪些物品没有贴图、哪些没有模型；
- 存储位置：优先写入 `src/main/resources/assets/<modid>/textures/item` 与 `models/item`；工程没有标准资源目录时回退到 `.mcstudio/assets/<modid>/`。

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
  `studio.json`（工坊标记）、`summary.json`（派生摘要）、`structure.json`（派生代码结构）；
- 插件注册表：`$DSH_HOME/mcmods-studio/registry.json`（记录扫描根目录与项目列表）；
- Host 接口：`POST /mcmods-studio/api`，共 **37 个动作**：

| 分组 | 动作 |
| --- | --- |
| 项目与注册表 | `boot`、`projects.scan`、`projects.add`、`projects.remove`、`projects.remember`、`registry.setRoot`、`project.create`、`project.open`、`project.import`、`project.analyzeImport`、`project.reimport`、`project.saveMeta` |
| 构想与物品 | `features.list`、`features.save`、`features.delete`、`items.list`、`items.save`、`items.delete` |
| 素材与文档 | `assets.list`、`assets.upload`、`assets.read`、`assets.readMany`、`assets.delete`、`assets.model.get`、`assets.model.save`、`assets.root`、`docs.export`、`guide` |
| 代码结构 | `structure.refresh`、`structure.get`、`structure.find`、`structure.annotate` |
| Agent 与诊断 | `agent.summary`、`agent.validate`、`agent.tools`、`agent.call`、`debug.clientGraph` |

- Agent 工具：21 个，注册为 DSH 原生 `mcmods_*` 工具，清单见 [INDEX.md](INDEX.md) 第 4 节。

## 3. 未实现功能

### 3.0 Agent 接入（已完成）

v0.1.x 已补齐面向 agent 的能力层，不再需要自写脚本探测项目。

| 能力 | 落地 | 说明 |
| --- | --- | --- |
| 原生工具 | `lib/tools.js` + `lib/tool-bridge.js` | 21 个工具，注册为 DSH 原生 `mcmods_*` 工具，agent 可直接调用 |
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
| 版本规则 | 新增 [VERSION-PLAN.md](VERSION-PLAN.md) | 每次优化或修复 bug 后 PATCH +1（`0.1.0` → `0.1.1`）；MINOR 按路线阶段；MAJOR 用于稳定版与破坏性变更 |
| 发版流程 | 同上，第 3 节 | 测试 → 版本号 → CHANGELOG → 全部文档 → 版本历史 → 提交 |
| 结构扫描修复 | `lib/structure.js` | 跨行字段声明、泛型方法与局部变量误判、`BlockEntity` 归类顺序、含 `/` 的注册 id |
| 摘要同步 | `lib/tools.js` | `structure_refresh` / `structure_annotate` 工具路径与 HTTP 动作一致，写后刷新 `summary.json` |
| 文档校准 | `docs/` 全量 | 工具 21、动作 37、测试 159、版本 v0.1.1；修复 `VERSION-PLAN.md` 死链 |

### 3.1 计划中（按优先级）

> 优先级口径：P0 = 渲染层测试与代码结构文档（**已完成**）；P1 = v0.2 关系视图、编辑效率与设置；P2 = v0.3 代码工作区与生成；P3 = v0.4 图形化；P4 = v0.5 质量与效率。

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P1 | 关系视图 | 构想 → 物品 → 素材的依赖图、缺失面板、变更时间线；复用构想上已有的 `items` 关联字段（`FeatureEditor` 可编辑），不再新增 `itemRefs` |
| P1 | 设置页 | 页签栏最右侧齿轮入口；启动恢复、默认页签、物品默认视图、删除素材策略、Agent 默认项目；详见 [SETTINGS-PLAN.md](plans/SETTINGS-PLAN.md) |
| P1 | 内联编辑 | 列表内直接改名称、类型、堆叠，不必打开弹窗 |
| P1 | 批量操作 | 多选后统一改类型或标签 |
| P2 | 代码工作区 | 工程文件树 + 文本编辑器（行号、未保存提示、`Ctrl+S`），路径限定在工程内 |
| P2 | Java 注册代码生成 | 生成 `ModItems.java`，用注释标记生成区块，重复生成不覆盖手写代码；以工具形式暴露 |
| P2 | 资源 JSON 生成 | 物品模型、`lang/zh_cn.json`、`lang/en_us.json` |
| P3 | 图形化方块 | 属性表单 + blockstate + 方块模型 |
| P3 | 图形化配方 | 工作台有序 / 无序、熔炉、切石机 |
| P3 | 批量贴图导入 | 一次选择多张 PNG 或整个文件夹，按物品 ID 自动匹配 |
| P4 | 快照差异对比 | 重新导入工程时列出新增 / 变更 / 删除的素材与注册名 |
| P4 | 右侧栏自动打开 | 点左侧「模组工坊」图标时同步展开右侧标签（当前需手动从「开始」页打开） |
| P4 | 列表视图排序与筛选 | 按类型、堆叠、是否有贴图筛选；当前只有搜索 |
| P4 | 撤销 / 重做 | 编辑操作的历史栈 |
| P4 | 战利品表 | 方块掉落配置 |
| P4 | 创造模式标签拖拽排序 | 图形化调整物品分组与顺序 |
| P4 | 贴图动画 | `.mcmeta` 动画配置 |
| P4 | 导入 `.jar` | 当前只解析源码工程，不解析已编译的模组包 |
| P4 | 多 MC 版本 | 当前只适配 1.20.1；v1.0.0 起先加 1.21.1，之后按需扩展（见 [PLAN.md](PLAN.md)） |
| P4 | 界面多语言 | 目前仅中文，`en.json` 只用于插件标题与描述 |

> 完整的阶段划分与验收标准见 [PLAN.md](PLAN.md)。
> v0.1.x 仍有待修复问题，优先于 v0.2 新功能；设置页方案已确认，但不插队。
> 可靠性、导入安全、设置页与图画布的可借鉴模式见 [REFERENCE-CUIGENGJI.md](REFERENCE-CUIGENGJI.md)。

### 3.2 当前版本不做

- **当前版本（v0.1.x）不含代码工作区与代码生成**：代码编辑与 Java / 资源生成移到 v0.3（见 [PLAN.md](PLAN.md)），当前版本的构建仍由用户在 IDEA 中完成；
- 不做完整 IDE：不实现编译、运行、调试、反编译；
- 不做云端同步或多人协作；
- 当前版本不修改用户的 Java、gradle、`mods.toml` 等工程文件（导入与结构扫描只读取）；v0.3 起仅在作者确认后写入生成区块与资源 JSON。

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

已通过自动化验证（`npm test`，**15 个文件、159 项全部通过**）：

| 层 | 覆盖 | 手段 |
| --- | --- | --- |
| Host 业务 | 102 项 | 直接调 `dispatch`，每个用例用隔离的临时目录 |
| 方块贴图解析 | 7 项 | 真实工程结构：blockstate、parent 继承、multipart、无 blockstate 回退 |
| 项目持久化 | 10 项 | 记住 / 恢复 / 清除 / 移除清理 / 旧格式兼容 |
| 代码结构文档 | 15 项 | Java 解析、注册反查、跨行字段、泛型方法、按哈希增量、解析器版本、注解失效、摘要同步 |
| 客户端加载 | 8 项 | 假 `__ModuleLoader__` + 假 React，验证加载、模块 id、座位注册 |
| 渲染结构 | 15 项 | 假 React 渲染组件，断言文本、按钮、条件分支 |
| schema 一致性 | 2 项 | 比对 `schema.js` 与 `data/schema.json` |

接口级验证：

- 接口：`boot`、项目创建与打开、物品保存、文档导出、贴图上传、模型生成；
- 导入：Fabric 工程与 Forge 工程均能识别 modid、版本、贴图与 Java 注册名；
- 数据：画布坐标持久化、快照生成、注册表读写、摘要重建；
- 代码结构：真实 Forge 工程扫描 14 文件 / 15 类 / 38 方法，注册点按 `items` 归类；
- Agent：21 个工具全部注册到宿主，`agent.tools` 返回 21 工具 / 37 动作；
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
- 每次优化或修复 bug 后按 [VERSION-PLAN.md](VERSION-PLAN.md) 升 PATCH 版本，并同步全部文档；
- 本文档只描述**当前状态**，不记录历史；
- 需求变更时先改第 1 节对照表，再改代码。
