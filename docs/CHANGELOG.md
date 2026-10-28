# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与语义化版本。

## [Unreleased]

### 计划中

- 批量导入贴图（多选拖放）。
- 素材文件内容级差异对比（重新导入时目前只比较条目与注册名）。
- 方块状态与多方块模型的可视化编辑。
- 设置页：页签栏最右侧齿轮入口，管理启动恢复、默认页签、物品默认视图、删除素材策略与 Agent 默认项目（规划中，见 [plans/SETTINGS-PLAN.md](plans/SETTINGS-PLAN.md)）。

## [0.1.3] - 2026-10-28

### 新增

- 新增物品类型「创造模式标签」（`creative_tab`）：导入时识别 `DeferredRegister<CreativeModeTab>`、`CreativeModeTab.builder`、`Registries.CREATIVE_MODE_TAB`，把同一 Java 文件里的 `register("id", ...)` 归为标签，不再混入物品。
- 摘要新增 `counts.creativeTabs` 与 `creativeTabs[]`，`counts.items` 不再把标签算作物品。
- 导入快照新增「创造模式标签」清单与计数。

### 修复

- 方块只有 `textures/block/<id>.png`、没有 blockstate / 方块模型时，「贴图与模型」页不显示缩略图；现在会回退到同名方块贴图，并支持按 `block` 类型上传 / 删除。
- `assets.list` 的 `missing` 不再把「有方块贴图但缺模型」的方块误判为「没有贴图」，同时排除创造模式标签。
- 旧版本把创造模式标签存成普通物品的项目，`merge` 重新导入会自动纠正为 `creative_tab`，不需要手工改数据。
- 素材页与侧栏不再把创造模式标签当作物品展示/计数；校验器跳过标签的贴图与模型检查。

### 变更

- `package.json` 版本由 `0.1.2` 升至 `0.1.3`。
- `assets.upload` / `assets.delete` 支持可选 `kind: 'item' | 'block'`，默认仍为 `item`。
- `data/schema.json` 物品类型由 7 个增至 8 个（新增「创造模式标签」）。

### 文档

- 更新 [DATA-FORMAT.md](DATA-FORMAT.md)、[INDEX.md](INDEX.md)、[STATUS.md](STATUS.md)、[plans/IMPORT-PLAN.md](plans/IMPORT-PLAN.md)、[plans/ITEMS-PLAN.md](plans/ITEMS-PLAN.md) 与测试计数。

## [0.1.2] - 2026-10-28

### 新增

- 导入前备份与失败回滚：新增 `lib/backup.js`，导入 / 重新导入前把 `.mcstudio/` 与 `docs/mcstudio-snapshot.md` 备份到 `$DSH_HOME/mcmods-studio/backups/`；任一步失败自动恢复，并在结果里返回 `imported.backup` 路径。备份目录不写进项目，避免下次备份递归复制。
- 导入预览证明：`project.analyzeImport` 返回 `proof`（扫描结果 + 身份信息 + 当前条目状态的 sha256）；`project.reimport` 接收 `proof`，预览后工程内容或条目变化会拒绝执行，提示重新分析。
- 持久化写入加固：`writeJson` / `writeText` 改为「临时文件 → fsync → rename → 目录 barrier」，临时文件名带随机 UUID，避免崩溃留下空文件或并发临时文件相撞。
- 页面错误边界：`StudioRoot` 捕获 `StudioPage` 的渲染异常，显示重试 / 刷新入口与错误详情，避免 DSH 因未捕获异常退休整个 main slot。
- 编辑器草稿：物品与构想编辑器把未保存输入存到 `localStorage`（键含项目路径与实体 id），重新打开自动恢复；关闭页面/刷新时提示，取消时确认放弃。

### 修复

- 导入 / 重新导入中途失败会留下半导入项目；现在失败自动回滚到操作前状态。
- 预览后工程新增/修改资源不会被发现，仍按旧预览执行；现在 proof 不一致直接拒绝。
- 两个窗口或「界面 + Agent」同时写同一文件时可能静默覆盖；写入现在带 fsync，降低崩溃后读到空文件/旧内容的概率（完整版本冲突校验留到后续补丁）。
- 页面渲染异常会导致整个「模组工坊」入口不可用；现在错误留在插件内部并提供重试。

### 变更

- `package.json` 版本由 `0.1.1` 升至 `0.1.2`。
- `project.reimport` 的 payload 增加可选 `proof`；不传时保持旧行为，界面始终传 proof。
- 测试新增 `test/16-reliability.mjs`，覆盖持久写入、备份回滚、备份成功保留、proof 失效与重新导入。

### 文档

- 新增 [REFERENCE-CUIGENGJI.md](REFERENCE-CUIGENGJI.md) 的「本轮采纳」状态，明确哪些借鉴点已落地、哪些留到后续。
- 同步更新 [DATA-FORMAT.md](DATA-FORMAT.md)、[INDEX.md](INDEX.md)、[plans/IMPORT-PLAN.md](plans/IMPORT-PLAN.md) 的备份、proof 与测试计数。

## [0.1.1] - 2026-10-28

### 新增

- 代码结构文档：新增 `lib/structure.js`，用确定性浅解析提取 Java 包、导入、类、字段、方法、注册点与行号，写入 `.mcstudio/structure.json`；按文件哈希增量刷新，未变文件整条复用，变了的文件旧注解标记 `stale`。
- Agent 语义注解：支持按文件写「这段代码实现什么功能」，`members` 键为类名或「类名#方法名」，只覆盖指定文件。
- 对外能力：新增 `structure.refresh`、`structure.get`、`structure.find`、`structure.annotate` 4 个 HTTP 动作，以及 `mcmods_structure_refresh/get/find/annotate` 4 个原生工具。
- 导入集成：`project.import` / `project.reimport` 完成后自动生成初版结构文档，失败不影响导入主流程。
- 摘要集成：`summary.json` 新增 `code` 字段，只放注册点与计数，明细留在 `structure.json`。
- 版本规划：新增 [VERSION-PLAN.md](VERSION-PLAN.md)，规定每次优化或修复 bug 后 PATCH 版本 +1（如 `0.1.0` → `0.1.1`），并明确发版流程与全部文档的同步清单。

### 修复

- 跨行字段声明（`public static final DeferredRegister<Item> ITEMS =` 换行到下一行）无法被解析，导致该注册表下的全部注册点被归为 `other`；现在会收集续行并在分号处落库。
- 泛型方法声明（`private static <T extends Block> RegistryObject<T> ...`）未被识别为方法，导致方法体的局部变量与 `return` 语句被误记成类字段；现在先剥离类型形参再匹配，并且字段识别只发生在类体顶层。
- `DeferredRegister<BlockEntity>` 曾被宽泛的 `<Block` 规则抢先归类为 `blocks`；调整匹配顺序，先判断 `Item` / `BlockItem` / `BlockEntity` / `Fluid`，再判断 `Block`。
- 注册 id 中含 `/`（例如 `material/cardboard`）时未被识别为注册点，现已纳入匹配范围。
- 通过工具调用 `structure_refresh` / `structure_annotate` 时不会刷新 `summary.json`；现在与 HTTP 动作的 `summary: true` 行为一致。
- 结构文档没有解析器版本，升级插件后文件哈希未变时会继续复用旧解析结果；现在写入 `parserVersion`，与当前实现不符时整份重扫，并保留旧注解（标记失效）。

### 变更

- `package.json` 版本由 `0.1.0` 升至 `0.1.1`；插件版本、项目 `mcVersion`、数据 `schemaVersion` 三者保持独立。
- `structure.annotate` 动作补充 `summary: true`，写入注解后同步摘要中的 `mode` 与 `annotated` 计数。

### 文档

- 全量校准所有文档的版本、日期、工具数（21）、动作数（37）、测试数（159）与模块状态。
- 修复 5 份重构记录指向不存在的 `VERSION-PLAN.md` 的死链。
- 校准 FEATURES-PLAN（关联物品字段已存在）、ASSETS-PLAN（方块面解析已实现）、IMPORT-PLAN（notices 与结构文档）、PROJECT-PLAN（lastProject）、SHELL-PLAN（新增弹窗）、PLATFORM-PLAN（动作表漏项）、AGENT-PLAN（工具前缀与数量）等过时描述。

## [0.1.0] - 2026-10-26

### 新增

- 插件骨架：Host 半注册 `/mcmods-studio/api` HTTP 路由，Client 半注册 `sidebar.panellist` 入口与 `main` 页面。
- 侧栏入口：`sidebar.panellist` 图标区（与「插件市场」「费用统计」「上下文洞察」同一区域，`order: 2`），显示「模组工坊」图标与文字，点击打开主面板。
- 右侧栏标签页：`sidebarRightTabs` 注册 `mc-mod-studio` 类型与 `sidebar.right.pane.tab` 内容，显示当前项目概览（名称、modid、加载器、版本、物品与功能统计）以及主面板中选中物品的属性详情；同时在右侧栏「开始」页提供「模组工坊」引导卡片。
- 项目页：项目列表、新建项目、扫描根目录候选工程、导入已有工程（读取 `fabric.mod.json` / `mods.toml` / 构建脚本），并生成 `docs/mcstudio-snapshot.md` 快照。
- 构想页：构想条目增删改，状态（构思 / 规划中 / 实现中 / 已完成）与优先级。
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
- 项目结构文档：新增 [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md)，依据 Forge 1.20.1、NeoForge 与 Fabric 官方文档及 NeoForge 源码分支，说明代码、素材、数据、元数据与构建文件的固定位置。
- 导入精确化：按文档固定路径扫描 `textures/item|block`、`models/item|block`、`blockstates`、`lang`、`recipes`、`loot_tables/blocks`、`tags`、`advancements` 与 Java 注册名；方块与物品自动分类；语言文件名不再误判为条目；其他命名空间只记录不导入。
- 加载器识别修正：1.20.1 的 Forge 与 NeoForge 共用 `mods.toml`，改为结合 `build.gradle` / `gradle.properties` 中的 `net.neoforged` / `neo_version` 判定 NeoForge。
- 导入快照扩充：`docs/mcstudio-snapshot.md` 改为按资源类型分节的表格与清单，并列出检测到的命名空间。
- gradle.properties 解析：新增 `lib/gradle.js`，支持注释、续行、`\uXXXX` 与 `\t\n\r\\` 转义，兼容 Forge / NeoForge / Fabric 三套键名，提取 modid、名称、版本、作者、许可证、包名、MC 与加载器版本范围。
- 导入流程重写：`gradle.properties` 优先补全信息 → 三处取值冲突或缺必需项时抛异常要求人工介入 → 按注册表与工坊标记做「已登记 / 曾移除 / 全新」三分支判定 → 扫描创建条目 → 完成。
- 导入确认与重新导入：新增 `project.analyzeImport`（只分析不写盘）与 `project.reimport`（`merge` 保留已有、`overwrite` 改写类型冲突）；前端导入改为两步，项目列表每行新增「重新导入」按钮。
- 项目详情：列表每行新增「详情」按钮，默认只展示 modid、Minecraft 版本、加载器，作者/许可证/包名/版本范围收在「更多信息」。
- 元数据扩展：`project.json` 新增 `authors`、`license`、`group`、`minecraftRange`、`loaderVersion`、`loaderRange`、`source` 字段，快照文档同步展示。
- 修复占位符误判：描述文件里写成 `${mod_version}`、`$mod_version`、`${file.jarVersion}` 等 Gradle 占位符时，先用 `gradle.properties` 解析；解析成功用真实值比对，解析不出按「未提供」处理，不再误报冲突；`${file.jarVersion}` 这类构建期才存在的变量直接忽略。
- 重命名「功能列表」为「构想」：标签页、页内标题、新增/编辑/删除文案、空态提示、右侧栏统计项统一改为「构想」；导出的 `FEATURES.md` 标题与统计、`docs/README.md` 索引、新建项目的 README 说明同步调整。内部标识（`features`、`features.json`、`FeaturesTab`）保持不变，兼容既有项目数据。
- 明确插件宗旨：在 [PLAN.md](PLAN.md) 新增第 0 节，定义「人机共用的模组开发工作台」定位、三条设计纲领（事实只有一份 / 上下文优先于生成 / 给人看的给人看）与判断标准；同步调整设计目的、版本路线（v0.2 提前为 Agent 接入）与技术路线。
- 新增 [plans/AGENT-PLAN.md](plans/AGENT-PLAN.md)：基于实测（`boot` 返回 7418 字节、schema 占 3765 字节、28 个动作仅面向浏览器）提出九项建议与四阶段优先级，含与既有 v0.2 计划的关系与路线选择。

### 说明

- 目标版本固定为 Minecraft 1.20.1；加载器支持 Forge、NeoForge、Fabric。
- v0.1.0 不生成 gradle 工程，构建由用户在 IDEA 中完成；v0.2 做 Agent 接入，代码工作区与代码生成列入 v0.3（见 [PLAN.md](PLAN.md)）。
