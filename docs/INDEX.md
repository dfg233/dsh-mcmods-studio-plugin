# 代码索引

> 适用版本：v0.4.0
> 状态：as-built（v0.4.0 已实现）；新主线见 [PLAN.md](PLAN.md)，未实现设计见 [design/](design/README.md)，小版本修复计划见 [fix/](fix/README.md)。
> 更新日期：2026-11-01
> 用途：修改插件代码前先查这里，按「文件 → 函数 → 参数 → 返回」定位，不必通读源码。
> 说明：行号为编写时的位置，改动后会偏移，**优先按名称搜索**。发版与升版本规则见 [VERSION-PLAN.md](VERSION-PLAN.md)。

## 0. 怎么用这份文档

| 你要做的事 | 查哪一节 |
| --- | --- |
| 加一个接口动作 | 3.2 动作表 + 3.3 新增步骤 |
| 加一个 agent 工具 | 4 agent 工具表 |
| 加物品属性字段 | 2.3 `schema.js` |
| 加一个页面页签 | 5.4 `StudioPage` |
| 改侧栏入口 | 5.6 座位注册 |
| 改导入识别规则 | 2.7 `import.js` |
| 改数据文件结构 | 6 数据结构 |
| 发版 / 升版本 | [VERSION-PLAN.md](VERSION-PLAN.md) 第 3–4 节 |
| 排查「改了没生效」 | 8 验证与排查 |

## 1. 文件地图

| 文件 | 职责 | 行数 |
| --- | --- | --- |
| `package.json` | bundle 清单：版本、包名、`dsh.bundle.patch`、`dsh.client` | 46 |
| `cordis.patch.yml` | 向 Loader 插入 `id: mc-mod-studio` | 12 |
| `index.js` | Host 入口：HTTP 路由、原生工具注册、卸载清理 | 121 |
| `client.js` | 浏览器半：全部 UI（单文件模块） | 3546 |
| `lib/api.js` | 74 个动作的声明式路由表与分派 | 873 |
| `lib/paths.js` | `.mcstudio/` 路径、id 校验、路径归属 | 75 |
| `lib/schema.js` | 加载器、构想状态、物品类型（含创造模式标签）、19 个字段 | 185 |
| `lib/meta.js` | `project.json` 与 `studio.json` 读写、项目创建 | 217 |
| `lib/entries.js` | 构想与物品 CRUD、字段纠偏、`readProject` | 227 |
| `lib/import.js` | 工程识别、资源扫描、身份解析、差异、快照、导入 proof、标签分类 | 838 |
| `lib/workbench.js` | 系统卡与任务包读写、字段归一与引用校验 | 223 |
| `lib/content.js` | 语言/配方/模型/标签资源预览、写入、历史记录与回滚 | 558 |
| `lib/history.js` | 内容历史的存储、归档、上限、按项目写锁与查询 | 305 |
| `lib/lang.js` | 语言文件读写、总览、保存事务与语言键生命周期 | 320 |
| `lib/gradle.js` | `gradle.properties` 解析、占位符处理 | 205 |
| `lib/assets.js` | 贴图与模型：路径、PNG 校验、上传、读取、方块面解析 | 536 |
| `lib/docs.js` | 五份 Markdown 的渲染 | 256 |
| `lib/registry.js` | 插件注册表、路径展开、持久原子写入 | 243 |
| `lib/backup.js` | 导入前项目备份、失败回滚、备份路径 | 109 |
| `lib/summary.js` | `.mcstudio/summary.json` 的构建（含创造模式标签计数） | 114 |
| `lib/validate.js` | 9 类项目校验 | 171 |
| `lib/tools.js` | 33 个 agent 工具的定义与调用 | 930 |
| `lib/api-index.js` | API 索引：classpath 发现、javap 解析、缓存与查询 | 629 |
| `lib/templates.js` | 模板清单、参数校验、渲染、预览与应用 | 297 |
| `lib/context.js` | 任务上下文打包与预算裁剪 | 198 |
| `lib/checks.js` | 任务级检查器（allowed/guard/structure-diff 等） | 301 |
| `lib/tasks.js` | 任务执行：start / apply / verify / rollback | 283 |
| `lib/scaffold.js` | Gradle 脚手架：参数推断、版本矩阵、预览/应用/回滚 | 257 |
| `lib/version-matrix.js` | 1.20.1 × loader 的版本能力表 | 63 |
| `lib/markers.js` | 标记区块解析、替换、追加与错误检测 | 159 |
| `lib/codegen.js` | 代码生成：模板渲染 + 标记替换 + diff + 回滚 | 152 |
| `lib/structure.js` | Java 源码结构解析、按哈希增量、注解读写 | 794 |
| `lib/tool-bridge.js` | 把工具注册为 DSH 原生工具 | 87 |
| `lib/project.js` | **转发层**：`export *` 五个模块 | 18 |
| `data/schema.json` | 字段定义的对外副本（生成物） | 7.3 KB |
| `scripts/gen-schema.mjs` | 从 `schema.js` 生成上述 JSON | 40 |
| `test/*.mjs` | 回归测试：29 个文件、305 项 | 6674 |
| `docs/*.md` | 插件文档（本文件即索引） | — |

> `lib/project.js` 是 2026-10-24 拆分后保留的转发层，`api.js`、`assets.js`、`docs.js`、
> `tools.js` 仍从它导入，因此不能删除。详见 [refactor/01-split-project.md](refactor/01-split-project.md)。

## 2. 数据层（`lib/`）

### 2.1 `lib/registry.js`（15 个导出）

插件级数据，位于 `$DSH_HOME/mcmods-studio/registry.json`。

| 函数 | 用途 | 返回 |
| --- | --- | --- |
| `DEFAULT_ROOT` | 默认扫描根目录 | `'D:\\program'` |
| `dataDir()` | 插件数据目录 | `$DSH_HOME/mcmods-studio` |
| `registryPath()` | 注册表路径 | `dataDir()/registry.json` |
| `expandPath(input)` | 展开 `~`、转绝对路径 | 路径字符串；空输入返回 `''` |
| `isInside(parent, child)` | 子路径是否在父目录内 | `boolean` |
| `readJson(file, fallback)` | 读 JSON | 文件缺失或**内容损坏**都返回 fallback |
| `writeJson(file, value)` | 持久原子写 JSON | 临时文件 + fsync + rename + 目录 barrier |
| `writeText(file, text)` | 持久原子写文本 | 同上 |
| `isDirectory(p)` / `isFile(p)` | 类型判断 | `boolean`，不抛错 |
| `readRegistry()` | 读注册表并补默认值 | `{schemaVersion, root, projects[]}` |
| `saveRegistry(registry)` | 写回注册表 | 写入后的对象 |
| `touchProject(path, patch)` | 登记或更新时间 | 已存在则更新 `updatedAt` |
| `forgetProject(path)` | 移除登记（不删文件） | — |
| `setRegistryRoot(root)` | 修改扫描根目录 | 更新后的 registry |

### 2.2 `lib/paths.js`（13 个导出）

| 导出 | 说明 |
| --- | --- |
| `DATA_DIR = '.mcstudio'` | 项目内数据目录名 |
| `MC_VERSION = '1.20.1'` | 当前适配版本 |
| `STUDIO_MARKER = 'studio.json'` | 工坊标记文件名 |
| `projectDataDir(path)` | `.mcstudio` 绝对路径 |
| `projectMetaFile(path)` | `project.json` 路径 |
| `itemsDir(path)` | `items/` 路径 |
| `featuresFile(path)` | `features.json` 路径 |
| `docsDir(path)` | `docs/` 路径 |
| `studioMarkerFile(path)` | 标记文件路径 |
| `isValidModId(id)` | 小写字母数字下划线，2–64 |
| `isValidItemId(id)` | 小写字母数字下划线，1–64 |
| `requireProjectPath(input)` | 解析并校验目录存在，否则抛错 |
| `assertInside(root, target)` | 路径归属校验（当前无调用点，保留为扩展点） |

### 2.3 `lib/schema.js`（7 个导出）

**新增字段或类型时改这里。**

| 导出 | 说明 |
| --- | --- |
| `LOADERS[]` | `{id,label,note}`，forge / neoforge / fabric |
| `FEATURE_STATUS[]` | idea / planning / implementing / done，带 `tone` |
| `FEATURE_PRIORITY[]` | high / medium / low |
| `ITEM_TYPES[]` | item / block / tool / weapon / armor / food / material / creative_tab |
| `ITEM_FIELDS[]` | 19 个字段：`{key,label,type,group,default,min,max,unit,hint,options?}` |
| `itemSchema()` | 聚合返回给前端 |
| `defaultProperties()` | 由字段定义生成默认属性对象 |

> 改动后需运行 `npm run gen:schema` 刷新 `data/schema.json`，
> `test/10-schema-sync.mjs` 会校验两者一致。

### 2.4 `lib/meta.js`（9 个导出）

| 函数 | 用途 |
| --- | --- |
| `readStudioMarker(path)` | 读标记，返回对象或 `null` |
| `writeStudioMarker(path, patch)` | 写标记，首次生成 `projectId`/`importedAt` |
| `ensureStudioMarker(path, source)` | 缺失时补写（老项目迁移） |
| `readProjectMeta(path)` | 读元数据，非工坊项目返回 `null` |
| `isStudioProject(path)` | 目录内是否有 `project.json` |
| `isRegisteredProject(path)` | 是否在**注册表**（项目列表）中 |
| `createProject(input)` | 新建项目，返回 `{path, meta, features:[], items:[]}` |
| `touchMeta(path)` | 更新 `updatedAt` |
| `saveProjectMeta(path, patch)` | 合并写入元数据 |

> `isStudioProject` 看目录，`isRegisteredProject` 看注册表——导入时用后者判定
> 「已登记 / 曾移除 / 全新」，两者不可混用。

### 2.5 `lib/entries.js`（8 个导出）

| 函数 | 用途 |
| --- | --- |
| `listFeatures(path)` | 构想列表，按 `updatedAt` 倒序 |
| `saveFeature(path, feature)` | 新增或更新构想 |
| `deleteFeature(path, id)` | 删除，返回剩余数组 |
| `listItems(path)` | 物品列表 |
| `normalizeItem(raw, fallbackId)` | 字段补全与类型纠偏 |
| `saveItem(path, item)` | 保存，校验 id、纠偏属性、touch meta |
| `deleteItem(path, id)` | 删除条目并尽力清理贴图与模型 |
| `readProject(path)` | 聚合视图 `{path, meta, features, items}` |

> `readProject` 放在这里而非 `meta.js`，因为它同时需要元数据与两类条目，
> 否则会形成 `meta ↔ entries` 循环依赖。

### 2.6 `lib/gradle.js`（8 个导出）

| 函数 | 用途 |
| --- | --- |
| `parseProperties(text)` | 解析 Java properties（注释、续行、转义） |
| `extractGradleMeta(props)` | 提取模组元数据，带 `missing` 清单 |
| `detectLoaderFromGradle(meta, props)` | 由版本字段判定加载器 |
| `readGradleProperties(path)` | 读并解析工程根下的 `gradle.properties` |
| `isPlaceholder(value)` | 是否 `${name}` / `$name` 形式 |
| `placeholderKey(value)` | 取出占位符内的变量名 |
| `resolvePlaceholder(value, props)` | 用 properties 解析占位符 |
| `realValue(value, props)` | 规范成「真实值或空」 |

### 2.7 `lib/import.js`（5 个导出）

| 函数 | 用途 | 返回 |
| --- | --- | --- |
| `scanCandidates(root)` | 扫描一级子目录 | 候选数组，含 `imported` / `legacy` |
| `importProject(input)` | 首次导入 | 项目数据 + `imported{assets,registryNames,creativeTabs,created,notices,snapshot,backup}` |
| `reimportProject(input)` | 重新导入，`mode` 为 `merge` / `overwrite`，`proof` 校验过期预览 | 同上 |
| `analyzeImport(input)` | 只分析不写盘 | `{kind, identity, diff, notices, creativeTabs, proof}` |
| `writeSnapshot(path, info)` | 写导入快照 | 相对路径 |

内部函数（不导出）：

| 函数 | 作用 |
| --- | --- |
| `readBuildText(path)` | 合并读取构建脚本与 `gradle.properties` |
| `detectDescriptor(path, props)` | 识别描述文件；占位符用 `props` 解析 |
| `matchToml(text, key)` | 从 TOML 取字符串值 |
| `scanProjectAssets(path, modid)` | 扫描 11 类资源 |
| `scanRegistryNames(path)` | 遍历 Java 提取 `register("id")` |
| `resolveIdentity(path, input)` | 合并三处信息，冲突或缺必需项时抛错 |
| `diffEntries(assets, names, items)` | 算新增 / 保留 / 类型冲突 / 无资源 |
| `syncEntries(path, modid, {mode})` | 按差异写入条目 |
| `importProof(analysis)` | 把扫描结果与项目状态压成 sha256，供 `reimport` 校验 |

### 2.8 `lib/assets.js`（13 个导出）

| 函数 | 用途 |
| --- | --- |
| `resolveAssetRoot(path, modid)` | `{root, standard}`；有 `src/main/resources` 用标准路径 |
| `textureFile(path, modid, id, kind)` | 贴图绝对路径；`kind` 为 `item`（默认）或 `block` |
| `modelFile` | 物品模型绝对路径 |
| `pngSize(buffer)` | 解析 PNG 宽高，非 PNG 返回 `null` |
| `listAssets(path)` | 见下方「返回结构」 |
| `uploadTexture(path, id, base64, kind?)` | 校验并保存；`kind` 为 `item` / `block`，返回 `{id,kind,width,height,bytes,path}` |
| `readTextureDataUrl(path, id, kind)` | data URL 或 `null`；找不到时回退另一种 `kind` |
| `deleteTexture(path, id, kind?)` | 删除贴图；`kind` 为 `item` / `block` |
| `readModel` / `saveModel` | 模型 JSON 读写，保存前校验 |
| `buildDefaultModel(modid, item)` | 生成 `item/generated` 模型 |
| `ensureModel(path, item)` | 缺失时补默认模型 |

`listAssets` 返回：

| 字段 | 含义 |
| --- | --- |
| `textures[]` | `{id, kind, path, relative, width, height, bytes, modifiedAt}`；item 与 block 合并 |
| `models[]` | 物品模型 `{id, kind, path, parent, textures}` |
| `blockModels[]` | 方块模型，结构同上 |
| `blocks[]` | 见下方「方块解析结果」 |
| `missing[]` | 缺贴图或模型的条目 id |
| `blockCount` | 解析出的方块数 |

方块解析结果 `blocks[]` 的每一项：

| 字段 | 含义 |
| --- | --- |
| `id` | 方块 id（与物品条目同名） |
| `hasBlockstate` | 是否存在 `blockstates/<id>.json` |
| `uniform` | 六面是否用同一张贴图 |
| `models[]` | `{name, parent, faces, elementsFrom}`；`elementsFrom` 标明 `elements` 来自哪一层 |
| `faces[]` | `{face, label, texture, kind, textureId}`；`label` 为中文面名 |
| `textures[]` | 去重后的贴图引用，形如 `block/stone_top` |
| `primary` | 主贴图引用，供缩略图；无则空串 |
| `primaryKind` / `primaryId` | 拆开的主贴图 `kind` 与文件名 |

**方块解析流程**（`describeBlock` 内部）：读 blockstate → 收集 `variants` 与
`multipart` 引用的模型 → 沿 `parent` 链自下而上合并 `textures` → 展开 `#var`
引用（最多 8 层防循环）→ 按 `elements[].faces` 得出每个面用哪张图 →
六面相同则标记 `uniform`。无 blockstate 时回退到同名 `models/block/<id>.json`；
`elements` 定义在父模型里时沿链找到第一个带 `elements` 的那层。

### 2.9 `lib/docs.js`（1 个导出）

| 函数 | 用途 |
| --- | --- |
| `exportProjectDocs(path)` | 导出五份 Markdown，返回 `{files[]}` |

内部渲染函数：`renderFeatures`、`renderItemsIndex`、`renderItem`、`renderAssets`、`renderDocsIndex`。

### 2.10 `lib/summary.js`（3 个导出）

| 函数 | 用途 |
| --- | --- |
| `SUMMARY_FILE = 'summary.json'` | 文件名 |
| `summaryFile(path)` | 绝对路径 |
| `rebuildSummary(path)` | 重建并写盘，返回摘要对象 |

摘要只含最小字段：`meta`、`counts`、`ideas[]`、`items[]`（id/名称/类型/有无素材）、
`missing`、`code`（代码结构摘要，取自 structure.json，见 2.11）。

### 2.11 `lib/structure.js`（12 个导出）

代码结构文档：回答「哪段代码实现什么」「功能由哪些代码实现」。

| 函数 | 用途 |
| --- | --- |
| `STRUCTURE_FILE = 'structure.json'` | 文件名 |
| `PARSER_VERSION = 2` | 解析器版本；变化时旧缓存整份失效，与文件哈希无关 |
| `structureFile(path)` | 绝对路径 |
| `maskSource(text)` | 把注释与字符串替换成空格，长度不变，行号仍对得上 |
| `extractJavadocs(text)` | 提取注释，返回「声明行号 → 文本」 |
| `parseJava(text)` | 解析出包、导入、类、字段、方法、注册调用，每项带行号 |
| `refreshStructure(path, {force})` | 扫描并**增量**更新；未变文件整条复用（含注解） |
| `readStructure(path)` | 读取，缺失返回 `null` |
| `setAnnotation(path, input)` | 写 agent 语义注解，只改指定文件 |
| `findRegistration(structure, id)` | 按注册 id 反查文件与行号 |
| `compactStructure(structure)` | 精简视图：只留位置与签名，省 token |
| `validateAnnotationKeys(file, members)` | 校验注解键是否真实存在 |

**增量规则**（按文件哈希）：

| 情况 | 处理 |
| --- | --- |
| `parserVersion` 与当前实现不符 | 忽略旧条目，整份重扫（即使文件哈希未变）；旧注解保留并标 `stale` |
| 哈希未变 | 整条复用，保留已有 `annotation` |
| 哈希改变 | 重新扫描，旧注解搬运过来但标记 `stale: true` |
| 新增文件 | 全量扫描 |
| 文件删除 | 从文档移除，记入 `incremental.removed` |

**解析的边界**：按行做浅解析，不构建 AST。目标定位是「找得到」而不是
编译级准确：跨行声明的复杂泛型、匿名内部类里的方法可能漏掉。已支持
「单行声明、初始化表达式换行」的常见字段写法（`DeferredRegister<Item> ITEMS =`
换行到下一行），也能识别带类型形参的泛型方法（`<T extends Block>`）；
字段只从类体顶层收集，方法体的局部变量与 `return` 不会误记。通过自定义
辅助方法间接注册（如 `registerBlocks("id", ...)`）目前仍识别不到，因为
注册调用里没有字符串字面量 id。

**不调用模型**：扫描是确定性的，同一份源码两次扫描结果一致。

### 2.12 `lib/validate.js`（1 个导出）

| 函数 | 用途 |
| --- | --- |
| `validateProject(path)` | 返回 `{ok, errors[], warnings[], checkedAt}` |

检查项：`item.id`、`item.property`（数值范围）、`model.reference`、`asset.texture`、
`asset.model`、`asset.blockstate`、`lang.missing`、`asset.orphan`、`item.type`。

### 2.13 `lib/tools.js`（3 个导出）

| 导出 | 用途 |
| --- | --- |
| `TOOLS` | 33 个工具定义的数组 |
| `listTools()` | 精简清单（name / description / input） |
| `callTool(name, args)` | 按名调用，未知工具抛错 |

工具清单见第 4 节。

### 2.14 `lib/tool-bridge.js`（2 个导出）

| 函数 | 用途 |
| --- | --- |
| `registerTools(ctx)` | 注册为 DSH 工具，返回 disposer 数组；无 `tools` 服务时抛错 |
| `toolNames()` | 返回 `mcmods_*` 名称列表 |

### 2.15 `lib/project.js`（5 个导出，转发层）

```js
export * from './paths.js'
export * from './schema.js'
export * from './meta.js'
export * from './entries.js'
export * from './import.js'
```

### 2.16 `lib/backup.js`（3 个导出）

导入 / 重新导入前的项目备份与失败回滚。备份位于 `$DSH_HOME/mcmods-studio/backups/<项目名>-<路径摘要>/<时间>-<原因>/`，包含 `mcstudio/` 与可选的 `docs/mcstudio-snapshot.md`。

| 函数 | 用途 | 返回 |
| --- | --- | --- |
| `createProjectBackup(projectPath, reason)` | 复制 `.mcstudio/` 与快照；无工坊数据返回 `null` | 备份目录 |
| `restoreProjectBackup(projectPath, backupDir)` | 用备份覆盖当前数据；备份里没有快照时移除本次新建的快照 | `undefined` |
| `runWithProjectBackup(projectPath, fn, reason)` | 备份后执行 `fn`，失败自动回滚并把原始错误抛出 | `{result, backupDir}` |

### 2.17 `lib/workbench.js`（9 个导出）

系统卡与任务包存放在 `.mcstudio/systems.json`、`.mcstudio/tasks.json`；想法继续使用 `features.json`。

| 函数 | 用途 |
| --- | --- |
| `listSystems(path)` / `saveSystem(path, system)` / `deleteSystem(path, id)` | 系统卡 CRUD；`saveSystem` 归一字段并校验 id |
| `listTasks(path)` / `saveTask(path, task)` / `deleteTask(path, id)` | 任务包 CRUD；校验所属系统、允许路径、检查对象 |
| `readPlan(path)` | 一次返回 `{ideas, systems, tasks}` |
| `SYSTEM_STATUS` / `TASK_STATUS` | 状态枚举 |

### 2.18 `lib/content.js`（6 个导出）

| 函数 | 用途 |
| --- | --- |
| `readContent(path,id)` | 回填语言、配方、模型；返回文件相对路径 |
| `previewContent(path,id,content)` | 计算将写入的文件，不落盘 |
| `applyContent(path,id,content)` | 备份后写入语言/配方/模型/标签，追加历史；失败自动回滚资源 |
| `restoreContent(path,backupDir)` | 用备份清单恢复资源；校验备份与目标路径 |
| `rollbackContentHistory(path,entryId,{mode})` | 回到某步历史；逆序恢复并标记状态 |
| `backupContentFiles(path,files)` | 备份一组资源文件，返回备份目录；语言写入复用同一 manifest 格式 |

支持 `shaped` / `shapeless` / `furnace` 三种配方；语言写入 `assets/<modid>/lang/*.json`；模型写入 `models/item/<id>.json`；标签写入 `data/<ns>/tags/items|blocks/<tag>.json`。

`applyContent` 返回 `{files[], backupDir, historyEntry{id,sequence,at,title,status}}`；没有实际变更时返回 `{files: [], backupDir: null}` 且不写历史。
`lines` / `rawLines` 同时接受数组与多行字符串，`pattern` 只丢弃完全空白的行、不 trim。

### 2.19 `lib/history.js`（12 个导出）

内容历史：`.mcstudio/content-history.json`，只存元数据，备份仍在插件数据目录。

| 导出 | 用途 |
| --- | --- |
| `HISTORY_FILE` / `historyFile(path)` | 文件名与绝对路径 |
| `HISTORY_SCHEMA_VERSION` / `HISTORY_STATUS` | 结构版本与状态枚举（active / rolledBack / archived / failed） |
| `DEFAULT_HISTORY_OPTIONS` | `rollbackMode: toStep`、`keepBackups: true`、`scope: currentItem`、`maxEntries: 50` |
| `readHistoryStore(path)` | 读取；文件缺失或损坏时返回空历史，损坏时带 `warning` |
| `writeHistoryStore(path,store)` | 原子写回 |
| `withHistoryLock(path,fn)` | 按项目串行化历史读改写，返回 `fn` 的结果 |
| `appendHistoryEntry(path,input,options?)` | 追加一步：先把旧 `rolledBack` 归档，再按上限归档最旧记录 |
| `appendHistoryEntryUnlocked(path,input,options?)` | 调用方已持锁时追加一步；语言写入等复合事务内部使用 |
| `toPublicHistoryEntry(entry)` | 对外视图，不含 `backupDir`；带 `scope` |
| `listHistoryEntries(path,{itemId,scope,includeArchived})` | 列表：默认不含归档，按序号倒序，标记 `latest`，回显默认配置与告警 |

`entry.scope` 为 `item`（默认，旧记录按此处理）或 `project`（语言文件等跨物品写入）；`listHistoryEntries` 支持按 `scope` 过滤。

状态流转：`active` →（回滚撤销）→ `rolledBack` →（下一次成功写入）→ `archived`；备份缺失或恢复失败的步骤标记 `failed`。

### 2.20 `lib/lang.js`（10 个导出）

语言文件：`assets/<modid>/lang/zh_cn.json`、`en_us.json`；写入复用 `content` 的备份与 `history` 的历史。

| 导出 | 用途 |
| --- | --- |
| `LANG_LOCALES` | `['zh_cn', 'en_us']` |
| `langKeyForItem(modid,item)` | 物品 `item.<modid>.<id>` / 方块 `block.<modid>.<id>` |
| `langFiles(path)` | 语言文件路径与标准/回退标记 |
| `readLanguage(path)` | 读取两个文件；损坏时返回空对象与 `warning` |
| `listLanguages(path)` | 聚合物品语言键、未知键、缺失统计；`zh` 缺失时用英文回填并标记 `zhFromEn` |
| `previewLanguage(path,changes)` | 计算将写入的文件与增删改统计 |
| `applyLanguage(path,changes,{allowCreate,scope,itemId,title})` | 备份 → 写文件 → 记历史；失败回滚 |
| `ensureItemLanguage(path,item)` | 创建物品时连带创建语言键 |
| `removeItemLanguage(path,item)` | 删除物品时连带删除语言键 |
| `ensureAllLanguage(path)` | 为旧项目补建缺失语言键 |

写入规则：语言页只允许改已存在的键；`allowCreate` 仅用于生命周期与补建；空串表示删除键。

### 2.21 M2 模块（api-index / templates / context / checks / tasks）

| 文件 | 导出 | 用途 |
| --- | --- | --- |
| `lib/api-index.js` | `apiStatus`、`refreshApiIndex`、`apiSearch`、`apiGet`、`apiContext`、`parseJavapOutput`、`listZipEntries`、`filterClassName`、`apiCacheDir` | classpath 发现、javap 解析、分片缓存 |
| `lib/templates.js` | `listTemplates`、`getTemplate`、`renderTemplate`、`applyTemplate` | 模板清单、渲染、备份/回滚 |
| `lib/context.js` | `packContext` | 任务上下文打包与预算裁剪 |
| `lib/checks.js` | `runChecks`、`CHECKS`、`writeStructureSnapshot`、`matchesPath` | 任务级检查 |
| `lib/tasks.js` | `startTask`、`applyTask`、`verifyTask`、`rollbackTask` | 任务执行状态机 |

存储：API 缓存 `$DSH_HOME/mcmods-studio/cache/api/`，结构快照 `cache/structure/`，模板 `templates/`。

## 3. 接口层

### 3.1 HTTP 约定

- 路由：`POST /mcmods-studio/api`（8MB 上限）；
- 请求：`{"action": "items.save", "payload": {...}}`；
- 成功：`{"ok": true, "data": ...}`；失败：`{"ok": false, "error": "中文信息"}`；
- 非 POST 返回 405；未知 action 抛 `未知动作：xxx`。

### 3.2 动作表（68 个）

**路由声明**：`lib/api.js` 的 `routes` 对象，每个动作声明 `scope` 与 `run`，
可选 `summary: true` 在执行后刷新摘要。

| scope | 含义 |
| --- | --- |
| `none` | 不需要路径校验 |
| `project` | 目录必须存在 |
| `studio` | 必须是工坊项目 |

#### 项目与注册表

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `boot` | — | `{registry, schema, defaultRoot, mcVersion, guide}` | none |
| `projects.scan` | `{root?}` | `{root, candidates[]}` | none |
| `projects.add` | `{path}` | `{path, meta}` | project |
| `projects.remove` | `{path}` | `{path}` | none |
| `projects.remember` | `{path}` | `{lastProject}` | none |
| `registry.setRoot` | `{root}` | `{root}` | none |
| `project.create` | `{path,name,modid,version,description,loader}` | 项目数据 | none |
| `project.open` | `{path}` | `{path, meta, features, items}` | project |
| `project.import` | `{path,modid?,name?,version?,force?}` | 项目数据 + `imported` | none |
| `project.analyzeImport` | `{path,...}` | `{kind, identity, diff, notices, creativeTabs, proof}` | none |
| `project.reimport` | `{path, mode?, proof?}` | 项目数据 + `imported` | none |
| `project.saveMeta` | `{path, patch}` | `meta` | studio |

#### 构想与物品

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `features.list` | `{path}` | `{features}` | studio |
| `features.save` | `{path, feature}` | `{feature}` | studio |
| `features.delete` | `{path, id}` | `{features}` | studio |
| `items.list` | `{path}` | `{items}` | studio |
| `items.save` | `{path, item, ensureModel?}` | `{item}` | studio |
| `items.delete` | `{path, id}` | `{ok:true}` | studio |

#### 计划

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `workbench.plan` | `{path}` | `{ideas, systems, tasks}` | studio |
| `systems.list` | `{path}` | `{systems}` | studio |
| `systems.save` | `{path, system}` | `{system}` | studio |
| `systems.delete` | `{path, id}` | `{systems}` | studio |
| `tasks.list` | `{path}` | `{tasks}` | studio |
| `tasks.save` | `{path, task}` | `{task}` | studio |
| `tasks.delete` | `{path, id}` | `{tasks}` | studio |

#### 代码结构

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `structure.refresh` | `{path, force?}` | `{mode, totals, incremental, registrations, index}` | studio |
| `structure.get` | `{path, compact?}` | `{structure}` | studio |
| `structure.find` | `{path, id}` | `{id, hits[]}` | studio |
| `structure.annotate` | `{path, file, summary?, members?}` | `{file, annotation, totals}` | studio |

#### 内容资源

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `content.get` | `{path, id}` | `{itemId,type,lang,tags,recipe,model,files}` | studio |
| `content.preview` | `{path, id, content, item?}` | `{itemId,files[],changes,backupHint}` | studio |
| `content.apply` | `{path, id, content}` | `{files[],backupDir,historyEntry}` | studio |
| `content.rollback` | `{path, backupDir}` | `{ok:true}` | studio |
| `content.history.list` | `{path, itemId?, includeArchived?}` | `{entries[],total,counts,itemId,includeArchived,options,warning}` | studio |
| `content.history.rollback` | `{path, entryId, mode?}` | `{entry,rolledBack[],files,mode}` | studio |
| `lang.list` | `{path}` | `{modid,standard,root,files,entries,others,stats,warning?}` | studio |
| `lang.preview` | `{path, changes}` | `{files[],changes}` | studio |
| `lang.save` | `{path, changes}` | `{files[],backupDir,historyEntry}` | studio |
| `lang.ensure` | `{path}` | `{created,files,backupDir,historyEntry}` | studio |

#### API、模板、上下文与任务

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `api.status` | `{path}` | `{available,stale,source,stats,generatedAt,build}` | studio |
| `api.refresh` | `{path, mode?}` | `{available,source,javap,stats,classpathHash}` | studio |
| `api.search` | `{path, query?, package?, kind?, limit?}` | `{available,results[],count}` | studio |
| `api.get` | `{path, class, includeInherited?}` | `{found,name,class}` | studio |
| `api.context` | `{path, classRefs?, taskId?, budget?}` | `{available,classes[],truncated,bytes}` | studio |
| `template.list` | — | `{templates[]}` | none |
| `template.get` | `{id}` | `{...manifest, files[]}` | none |
| `template.render` | `{path, id, params}` | `{id,name,params,files[],conflicts[]}` | studio |
| `template.apply` | `{path, id, params}` | `{id,files[],conflicts[],backupDir}` | studio |
| `context.pack` | `{path, taskId, budget?}` | 上下文包 | studio |
| `task.start` | `{path, id}` | `{task, context}` | studio |
| `task.apply` | `{path, id, files[], requestId?}` | `{task, files[], backupDir}` | studio |
| `task.verify` | `{path, id, compile?}` | `{task, checks[], failed}` | studio |
| `task.rollback` | `{path, id}` | `{task, restored}` | studio |
| `scaffold.preview` | `{path, description?, loader?, minecraft?, modid?, ...}` | `{params, files[], conflicts[]}` | studio |
| `scaffold.apply` | `{path, params, requestId}` | `{params, files[], conflicts[], created[], backupDir, buildVerified}` | studio |
| `codegen.preview` | `{path, templateRefs?, fragments?}` | `{files[], conflicts[]}` | studio |
| `codegen.apply` | `{path, templateRefs?, fragments?}` | `{files[], conflicts[], created[], backupDir}` | studio |
| `task.codegen.preview` | `{path, id, templateRefs?, fragments?}` | `{files[], conflicts[], violations[], guarded[]}` | studio |
| `task.codegen.apply` | `{path, id, templateRefs?, fragments?, requestId?}` | `{task, files[], created[], backupDir}` | studio |

#### 素材与文档

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `assets.list` | `{path}` | `{modid,standard,root,textures,models,blockModels,blocks,missing}` | studio |
| `assets.upload` | `{path,id,base64,kind?}` | `{id,kind,width,height,bytes,path}` | studio |
| `assets.read` | `{path,id,kind?}` | `{dataUrl}` | studio |
| `assets.readMany` | `{path,ids[]}` | `{images}` | studio |
| `assets.delete` | `{path,id,kind?}` | `{ok:true}` | studio |
| `assets.model.get` | `{path,id}` | `{text}` | studio |
| `assets.model.save` | `{path,id,model}` | `{text}` | studio |
| `assets.root` | `{path}` | `{root,standard}` | studio |
| `docs.export` | `{path}` | `{files[]}` | studio |
| `guide` | — | `{text}` | none |

#### Agent 与诊断

| action | payload | 返回 | scope |
| --- | --- | --- | --- |
| `agent.summary` | `{path}` | 摘要对象 | studio |
| `agent.validate` | `{path}` | `{ok, errors[], warnings[]}` | studio |
| `agent.tools` | — | `{tools[], actions[]}` | none |
| `agent.call` | `{tool, args}` | 工具结果 | none |
| `debug.clientGraph` | — | `{available, keys, hits}` | none |

### 3.3 新增一个动作

1. 在 `lib/api.js` 的 `routes` 里加一条：`'your.action': { scope, run }`；
2. `run` 直接调 `lib/` 下的业务函数，不重写逻辑；
3. 需要写后刷新摘要就加 `summary: true`；
4. 前端用 `call('your.action', {...})`；
5. 若也想暴露给 agent，在 `lib/tools.js` 的 `TOOLS` 加一项。

## 4. Agent 工具（33 个）

原生工具名带 `mcmods_` 前缀，与 `TOOLS.name` 一一对应。

| 工具 | 用途 | 关键参数 |
| --- | --- | --- |
| `project_summary` | 项目全貌 | `{project?}` |
| `project_list` | 列出已登记项目 | — |
| `project_remove` | 从注册表移除登记（不删目录） | `{path}` |
| `project_create` | 新建项目 | `{path,name,modid,loader}` |
| `project_import` | 导入已有工程 | `{path,modid?}` |
| `project_analyze` | 分析导入影响 | `{path}` |
| `project_scan` | 扫描候选工程 | `{root?}` |
| `scaffold` | Gradle 脚手架：preview / apply | `{action,project,description?,loader?,modid?,verifyBuild?}` |
| `codegen` | 代码生成：preview / apply | `{action,project?,templateRefs?,fragments?}` |
| `item_list` | 物品紧凑列表 | `{project?,type?,query?}` |
| `item_get` | 单物品完整属性 | `{project?,id}` |
| `item_save` | 保存物品 | `{project?,item}` |
| `item_delete` | 删除物品 | `{project?,id}` |
| `idea_list` | 构想紧凑列表 | `{project?,status?}` |
| `idea_save` | 保存构想 | `{project?,idea}` |
| `idea_delete` | 删除构想 | `{project?,id}` |
| `asset_list` | 贴图与模型清单 | `{project?}` |
| `project_validate` | 校验项目 | `{project?}` |
| `doc_export` | 导出文档 | `{project?}` |
| `schema_get` | 字段定义 | `{compact?}` |
| `structure_refresh` | 扫描或增量刷新代码结构 | `{project?,force?}` |
| `structure_get` | 读结构文档 | `{project?,compact?}` |
| `structure_find` | 按 id 查注册位置 | `{id,project?}` |
| `structure_annotate` | 写语义注解 | `{file,summary?,members?,project?}` |
| `api` | API 索引：status / refresh / search / get / context | `{action,project?,mode?,query?,className?,classRefs?,taskId?,budget?}` |
| `template` | 模板：list / get / render / apply | `{action,project?,id?,params?}` |
| `context` | 任务上下文包 | `{project?,taskId,budget?}` |
| `task` | 任务：start / apply / verify / rollback / codegen.preview / codegen.apply | `{action,id,project?,files?,templateRefs?,fragments?,requestId?,compile?}` |
| `content` | 内容资源：get / preview / apply / history.list / history.rollback | `{action,project?,id?,content?,entryId?,mode?,itemId?}` |
| `lang` | 语言文件：list / preview / save / ensure | `{action,project?,changes?}` |
| `asset` | 素材：list / upload / delete / model.get / model.save | `{action,project?,id?,kind?,base64?,model?}` |
| `project_admin` | 重新导入 / 添加 / 保存元数据 / 设置根目录 | `{action,project?,mode?,proof?,patch?,root?}` |
| `workbench` | 读取/更新系统卡与任务包（含删除） | `{action,project?,system?,task?}` |

所有工具在未传 `project` 时使用注册表中第一个可用项目。

## 5. 客户端（`client.js`）

### 5.1 运行模型

```js
window.__ModuleLoader__.load({
  id: 'dsh-mcmods-studio-plugin',   // 必须与 package.json name 一致
  factory(require) {
    const React = require('react')
    const h = React.createElement
    ...
    return { inject: ['slots'], apply(ctx) { ... } }
  },
})
```

单文件模块，不能拆成多个 ES 模块，靠 `// ──` 分节注释定位。

### 5.2 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `API` | `/mcmods-studio/api` | 接口地址 |
| `KEY` | `mc-mod-studio` | 主面板 key / 侧栏 id / 右侧栏 tab id |
| `CANVAS_COLUMNS` | 4 | 画布列数 |
| `CANVAS_CELL_W` / `CANVAS_CELL_H` | 172 / 152 | 单元格尺寸 |
| `C` | 颜色主题 | `bg/layer/layer2/border/border2/text/muted/brand/danger/success/warn` |
| `S` | 样式集合 | `page/header/title/tabs/body/card/row/btn/input/badge/empty/table/modal*` |

### 5.3 通用组件

| 组件 | props |
| --- | --- |
| `Icon` | `{size, active}` |
| `Modal` | `{title, onClose, footer, children}` |
| `Field` | `{label, required, hint, children}` |
| `TextInput` / `NumberInput` / `Textarea` | `{value, onChange, placeholder}` |
| `Select` | `{value, onChange, options[]}` |
| `Toggle` | `{value, onChange}` |
| `TagsInput` | `{value, onChange, placeholder}` |
| `Tabs` | `{tabs, value, onChange}` |
| `Markdown` / `renderInline` | `{text}` / `(text)` |
| `PathField` | `{label, value, onChange, required, hint, placeholder}` |
| `InfoRow` | `{label, value}` |
| `useDraftState`（hook） | 返回 `{value,setValue,dirty,restored,clear}`；localStorage 草稿、beforeunload |

### 5.4 页面组件

| 组件 | 职责 | 关键 props |
| --- | --- | --- |
| `ProjectTab` | 项目列表、扫描区、行内操作 | `{boot,project,refreshBoot,open,onCreate,onImport,onReimport,onCloseProject,setError}` |
| `FeaturesTab` | 构想列表 | `{project,setProject,schema,setError}` |
| `FeatureEditor` | 构想编辑弹窗（带草稿恢复） | `{feature,schema,project,onSave,onCancel}` |
| `PlanTab` | 计划页：系统卡、任务卡 | `{project,setError}` |
| `SystemEditor` / `TaskEditor` | 系统/任务编辑弹窗 | `{system/task,onSave,onCancel}` |
| `ItemsTab` | 列表 / 画布、搜索、校验提示条、历史记录入口 | `{project,setProject,assets,schema,setError,reloadAssets}` |
| `ItemEditor` | 5 页签编辑（基础含语言 / 属性 / 配方 / 标签 / 模型与备注），带草稿恢复；贴图按 `imageFor` 映射 | `{schema,item,project,imageFor,onTextureUploaded,setError,onSave,onCancel}` |
| `LangTab` | 语言文件总览、缺失筛选、行内编辑、批量保存、补建缺失键 | `{project,setError}` |
| `HistoryModal` | 内容历史列表、范围/归档筛选、回到某一步 | `{project,itemId,onClose,onRolledBack,setError}` |
| `AssetsTab` | 上传、预览、模型编辑 | `{project,assets,reloadAssets,setError}` |
| `GuideTab` | 构建教程 | `{guide}` |
| `StudioRoot` | 错误边界 + `StudioPage` | — |
| `StudioPage` | 页面框架与页签 | — |
| `SidebarStudioPanel` | 右侧栏项目概览 | 读 `studioState` |
| `ProjectDetailModal` | 项目详情 | `{item,onClose,setError}` |
| `ImportConfirmModal` | 导入差异确认 | `{path,seed,title,confirmText,onClose,onConfirm}` |
| `CreateProjectModal` | 新建项目 | `{defaultRoot,onClose,onCreated,setError}` |
| `ImportProjectModal` | 导入第一步 | `{candidate,onClose,onImported,setError}` |

`StudioPage` 的页签：

```js
const tabs = [
  { id: 'project', label: '项目' },
  { id: 'features', label: '构想' },
  { id: 'plan', label: '计划' },
  { id: 'items', label: '物品' },
  { id: 'lang', label: '语言' },
  { id: 'assets', label: '贴图与模型' },
  { id: 'guide', label: '构建教程' },
]
```

### 5.5 跨面板共享状态

| 函数 | 用途 |
| --- | --- |
| `getStudioState()` | 读 `{projectPath, itemId}` |
| `setStudioState(patch)` | 合并写入并通知订阅者 |
| `subscribeStudioState(fn)` | 订阅，返回取消函数 |

写入点：`open()` 成功后设 `projectPath`；物品列表「编辑」与画布点击设 `itemId`；
关闭项目时清空。

### 5.6 座位注册（`apply(ctx)`）

| 槽位 | 注册参数 | 组件 |
| --- | --- | --- |
| `main` | `{name:'main', key:KEY}` | `StudioPage` |
| `sidebar.panellist` | `{name, id:KEY, order:2, label:'模组工坊'}` | `Icon` |
| `sidebarRightTabs.register` | `{id:KEY, kind:KEY, title, guide:[{order:30,...}]}` | — |
| `sidebar.right.pane.tab` | `{name, key:KEY}` | `SidebarStudioPanel` |

### 5.7 测试钩子

设置 `window.__MCMODS_TEST__` 时，模块额外返回 `components` / `helpers` / `constants`，
供 `test/12-render.mjs` 渲染组件。未设置时该字段为 `undefined`。

`helpers` 含 `call`、`pickFolder`、`getStudioState`、`setStudioState`、`defaultSlot`、
`contentPayload`（编辑器状态 → 接口 payload）、`parsePatternText`、`recipeStateFrom`。

## 6. 数据结构

### 6.1 `<项目>/.mcstudio/project.json`

```json
{
  "schemaVersion": 1,
  "name": "示例模组",
  "modid": "examplemod",
  "version": "0.1.0",
  "description": "",
  "loader": "neoforge",
  "minecraft": "1.20.1",
  "authors": "",
  "license": "",
  "group": "",
  "minecraftRange": "",
  "loaderVersion": "NeoForge 47.1.79",
  "loaderRange": "47.1.79",
  "source": "gradle.properties",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### 6.2 `studio.json`（工坊标记）

```json
{
  "schemaVersion": 1,
  "projectId": "p_xxx",
  "importedAt": "ISO",
  "importedBy": "dsh-mcmods-studio-plugin",
  "source": "create | import | add | open | reimport",
  "path": "D:\\...",
  "mcVersion": "1.20.1"
}
```

### 6.3 `features.json`

`{schemaVersion, features: [{id,name,description,status,priority,version,notes,createdAt,updatedAt}]}`

### 6.4 `items/<id>.json`

`{id, displayName, type, description, properties{19 项}, canvas{x,y}, createdAt, updatedAt}`

### 6.5 `summary.json`（派生）

`{schemaVersion, meta, counts{ideas,ideasDone,items,blocks,creativeTabs,totalEntries}, ideas[], items[], creativeTabs[], missing{ids,count}, code{...}|null, updatedAt}`

`code` 只含 `mode / files / classes / methods / annotated / stale / registrations`；
没有结构文档时为 `null`。

### 6.6 `structure.json`（派生）

代码结构文档，回答「哪段代码实现什么」「功能由哪些代码实现」。
与 `summary.json` 的分工：summary 描述设计层（构想、物品、素材），
structure 描述实现层（Java 文件、类、方法、注册点）。

顶层：

| 字段 | 含义 |
| --- | --- |
| `schemaVersion` | 格式版本，当前 1 |
| `parserVersion` | 解析器版本；与当前实现不符时缓存整份失效并重扫 |
| `mode` | `scan`（仅结构）或 `annotated`（含 agent 注解） |
| `totals` | `{files, classes, methods, annotated, stale}` |
| `incremental` | 上次刷新的 `{reused, rescanned, removed[]}` |
| `index.registrations` | 按类别分组的注册点，见下 |
| `index.packages` | 包名 → 文件路径数组 |
| `files[]` | 每个 Java 文件一条，见下 |

`index.registrations` 按 `items` / `blocks` / `blockEntities` / `fluids` / `other` 分组，
每项 `{id, file, line, class, field}`。无法从字段类型判断注册表类别的（如创造模式标签）
归入 `other`；通过自定义辅助方法间接注册的条目不产生记录。

`files[]` 每一项：

| 字段 | 含义 |
| --- | --- |
| `path` | 相对工程根的路径，如 `src/main/java/com/example/ModItems.java` |
| `hash` | 内容哈希（sha1 前 16 位），增量判断依据 |
| `package` / `imports[]` | 包名与导入列表 |
| `classes[]` | `{name, kind, line, endLine, modifiers[], extends, implements[], javadoc, fields[], methods[], registrations[]}` |
| `annotation` | agent 写的注解，见下；未写时为 `null` |

`classes[].methods[]` 每项含 `{name, kind, line, endLine, returns, params[], signature, javadoc, annotations[]}`。

`annotation` 结构：

```json
{
  "hash": "3f2a1b...",
  "summary": "物品注册表，集中登记全部物品",
  "members": { "ModItems": "物品注册表", "ModItems#register": "注册全部物品" },
  "stale": false,
  "annotatedAt": "2026-10-27T12:00:00.000Z"
}
```

`members` 的键为「类名」或「类名#方法名」。`stale` 为真表示文件已改动、
注解待重新确认——旧文本仍保留供参考，但不计入 `totals.annotated`。

### 6.7 `$DSH_HOME/mcmods-studio/registry.json`

`{schemaVersion, root, lastProject, projects:[{path,name,modid,createdAt,updatedAt}]}`

`lastProject` 记录上次打开的项目路径，供下次进入插件时恢复。写入前校验该路径
仍在 `projects` 中，否则按空处理；旧注册表没有该字段时自动按空读取。

### 6.8 `content-history.json`（内容历史）

项目内新增的历史元数据，只记「改过哪几步、每步写过哪些文件、备份在哪」，不复制资源内容。

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "h_1790000000000_ab12",
      "sequence": 1,
      "at": "2026-10-31T00:00:00.000Z",
      "itemId": "ruby_sword",
      "title": "红宝石剑：语言/配方/模型",
      "files": [
        { "kind": "lang", "path": "src/main/resources/assets/mymod/lang/zh_cn.json" },
        { "kind": "recipe", "path": "src/main/resources/data/mymod/recipes/ruby_sword.json" }
      ],
      "backupDir": "<插件数据目录内的备份绝对路径>",
      "status": "active",
      "scope": "item"
    }
  ]
}
```

| 字段 | 含义 |
| --- | --- |
| `id` | 历史步 id，稳定唯一 |
| `sequence` | 递增序号，回滚范围按它比较 |
| `at` | 写入时间（ISO） |
| `itemId` | 关联物品；项目级步骤为空串 |
| `title` | 人类可读摘要，由物品名与改动类别生成 |
| `files` | 该步写入的文件（`kind` 为 lang / recipe / model / tag） |
| `backupDir` | 该步写入前的备份目录，位于 `$DSH_HOME/mcmods-studio/backups/<项目>/` |
| `status` | `active` / `rolledBack` / `archived` / `failed` |
| `scope` | `item`（默认，旧记录按此处理）或 `project`（语言文件等跨物品写入） |

状态流转：新步骤 `active`；被回滚的步骤 `rolledBack`（记录与备份保留）；下一次成功写入时
`rolledBack` 归档为 `archived`；备份缺失或恢复失败的步骤标 `failed`。归档记录默认不在
列表展示，`includeArchived: true` 可见。非归档记录上限 50 条，超出时把最旧记录归档，不物理删除。

`scope`：语言页保存与补建记 `project`（`itemId` 为空）；创建 / 删除物品连带的语言写入记 `item`。
历史弹窗「当前物品」只显示 `item` 且 `itemId` 匹配的步骤，「全部」显示所有步骤并标注「项目级」。

### 6.9 语言文件

`assets/<modid>/lang/zh_cn.json`、`en_us.json`；没有标准资源目录时回退到
`.mcstudio/assets/<modid>/lang/`。

| 项 | 规则 |
| --- | --- |
| 键 | 物品 `item.<modid>.<id>`；方块 `block.<modid>.<id>` |
| 创建物品 | 连带创建两个 locale 的键；`en` 取 `displayName`，`zh` 缺失时用英文回填 |
| 删除物品 | 连带删除两个 locale 的键 |
| 语言页保存 | 只改已存在的键；空串删除该键；未知键（其他模组 / 旧物品）只读 |
| 旧项目 | 「补建缺失键」为缺少键的物品创建键，等价于创建时的连带创建 |
| 写入保护 | 写前备份（与 `content.apply` 同格式）、写后记历史；失败回滚；文件损坏时只读并拒绝保存 |

## 7. 常见改动检索

| 想改什么 | 改哪里 | 连带检查 |
| --- | --- | --- |
| 加物品属性字段 | `lib/schema.js` 的 `ITEM_FIELDS` | `npm run gen:schema`；字段会自动出现在编辑器与导出文档 |
| 加物品类型 | `lib/schema.js` 的 `ITEM_TYPES` | 类型下拉、导入分类 |
| 加构想状态 | `lib/schema.js` 的 `FEATURE_STATUS` | 徽章颜色、导出分组 |
| 加加载器 | `lib/schema.js` 的 `LOADERS` | 导入识别、构建教程、代码模板 |
| 加接口动作 | `lib/api.js` 的 `routes` | 前端 `call()`、INDEX 动作表 |
| 加 agent 工具 | `lib/tools.js` 的 `TOOLS` | 工具自动注册，无需改 `tool-bridge.js` |
| 加页面页签 | `client.js` 的 `StudioPage` | `Tabs` 渲染分支 |
| 加系统卡/任务包字段 | `lib/workbench.js` | `DATA-FORMAT` 3.1/3.2、`test/17` |
| 加设置页 / 改默认行为 | 规划见 [plans/SETTINGS-PLAN.md](plans/SETTINGS-PLAN.md)；实现后改 `lib/settings.js`、`SettingsTab` | 启动恢复、默认页签、删除素材、Agent 默认项目 |
| 改内容历史 / 回滚语义 | `lib/history.js`、`lib/content.js` 的 `applyContent` / `rollbackContentHistory` | `test/18-content.mjs`；状态流转与上限归档 |
| 改语言写入 / 语言键生命周期 | `lib/lang.js`、`lib/api.js` 的 `items.save` / `items.delete` | `test/19-lang.mjs`；`scope` 与备份格式 |
| 改编辑器分页 | `client.js` 的 `ItemEditor` 与 `PAGES` | `test/12-render.mjs`；保存 payload 不变 |
| 改多行输入解析 | `client.js` 的 `contentPayload` / `parsePatternText`、`lib/content.js` 的 `lines` / `rawLines` | `test/12-render.mjs`、`test/18-content.mjs` |
| 改数据可靠性 / 原子写 / 导入回滚 | 参考 [REFERENCE-CUIGENGJI.md](REFERENCE-CUIGENGJI.md) 第 1、2、11 节 | `lib/registry.js` 的 `writeJson`、`lib/import.js` |
| 改侧栏顺序 | `apply(ctx)` 的 `order` | 侧栏截图核对 |
| 改右侧栏内容 | `SidebarStudioPanel` | `studioState` 写入点 |
| 改导入识别 | `lib/import.js` 的 `detectDescriptor` | 占位符处理、加载器判定、notices |
| 改素材路径 | `lib/assets.js` 的 `resolveAssetRoot` | 导入扫描、缺失统计 |
| 改 Java 解析规则 | `lib/structure.js` 的 `parseJava` 与 `TYPE_RE` 等正则 | 结构文档用例 15 |
| 改增量策略 | `lib/structure.js` 的 `refreshStructure` | 哈希复用、stale 标记 |
| 改注解结构 | `lib/structure.js` 的 `setAnnotation` | `compactStructure` 的取值、INDEX 6.6 |
| 改导出排版 | `lib/docs.js` 的 `render*` | 导出后打开文件核对 |
| 改校验规则 | `lib/validate.js` | 物品页提示条、agent 校验工具 |
| 改默认根目录 | `lib/registry.js` 的 `DEFAULT_ROOT` | 已存注册表不会自动改 |

## 8. 验证与排查

```bash
# 语法
for f in index.js client.js lib/*.js; do node --check "$f"; done

# 全部测试（29 个文件、305 项）
npm test

# 只跑某一组
node test/03-import.mjs
```

- 座位是否注册：`cordis_inspect_query` 查 `sidebar.panellist`、`sidebar.right.pane.tab`、`main`；
- 客户端模块是否被登记：`debug.clientGraph`；
- 原生工具是否注册：`cordis_inspect_query` 的 `Tool.listTools`，搜 `mcmods_`；
- 改了 `client.js`：刷新页面；
- 改了 `index.js` / `lib/`：`remove_bundle` + `install_bundle` 重装。

## 9. 依赖关系

```
index.js
  ├─ lib/api.js（路由表）
  │    ├─ paths → schema → meta → entries → import
  │    ├─ gradle（被 import 使用）
  │    ├─ assets
  │    ├─ docs
  │    ├─ content（依赖 history；恢复资源与记录历史）
  │    │    └─ history（只依赖 registry + paths，不反向依赖 content）
  │    ├─ lang（依赖 content 的备份工具 + history；语言读写与生命周期）
  │    ├─ summary（依赖 meta + entries + assets + structure）
  │    ├─ structure（依赖 paths + meta + registry）
  │    └─ validate（依赖 schema + paths + meta + entries + assets）
  └─ lib/tool-bridge.js
       └─ lib/tools.js（依赖 entries / meta / summary / validate / docs / import / structure）

client.js
  └─ POST /mcmods-studio/api → index.js → dispatch(action)
```

修改下层函数时注意上层对返回结构的依赖，尤其 `readProject`、`listAssets`、`itemSchema`。

`import.js` 依赖 `structure.js`（导入后生成结构文档），但 `structure.js` 不依赖
`import.js`，没有循环。`summary.js` 依赖 `structure.js` 读取代码摘要，同样单向。

## 10. 测试索引

| 文件 | 覆盖 | 用例 |
| --- | --- | --- |
| `01-registry.mjs` | 注册表、路径、损坏回退 | 8 |
| `02-project.mjs` | 新建、打开、元数据、标记 | 11 |
| `03-import.mjs` | gradle 解析、三分支、占位符 | 13 |
| `04-entries.mjs` | 构想与物品 CRUD、纠偏、想法字段 | 11 |
| `05-assets.mjs` | PNG 校验、模型、路径回退 | 13 |
| `06-docs.mjs` | 五份导出、幂等 | 8 |
| `07-scan.mjs` | 扫描、判定、差异、重新导入、标签分类 | 13 |
| `08-client-load.mjs` | 客户端加载、座位注册 | 8 |
| `09-agent.mjs` | 工具、摘要、校验、注册表清理 | 21 |
| `10-schema-sync.mjs` | schema 一致性 | 2 |
| `11-tool-bridge.mjs` | 原生工具定义与 notices | 8 |
| `12-render.mjs` | 渲染结构、方块贴图回退、计划页、想法字段、历史弹窗、多行输入、贴图映射、编辑器分页、语言页、上下文与生成预览 | 30 |
| `17-workbench.mjs` | 系统卡/任务包 CRUD、字段归一、计划读取 | 5 |
| `18-content.mjs` | 语言/配方/模型/标签预览、应用、回滚、标准路径、多行解析、内容历史与归档 | 17 |
| `19-lang.mjs` | 语言列表、保存、空串删除、备份与历史、损坏拒绝、路径、创建/删除生命周期、补建 | 10 |
| `20-agent-tools.mjs` | content / lang / asset / project_admin / api 工具与 workbench 删除 | 9 |
| `21-api-index.mjs` | javap 解析、过滤、zip 目录、缓存查询、继承合并、预算、搜索排序 | 8 |
| `22-templates.mjs` | 模板清单、渲染、参数校验、冲突、JSON 合并、应用、apply 后 skip | 10 |
| `23-context.mjs` | 上下文组成、codeRefs、预算裁剪、工具 | 7 |
| `24-checks.mjs` | allowed/guard/structure-diff/resource/registration/lang | 8 |
| `25-tasks.mjs` | start / apply / 幂等 / verify / rollback / 工具 / codegen | 15 |
| `26-scaffold.mjs` | 版本矩阵、参数推断、预览、写入、幂等、project.create 脚手架 | 9 |
| `27-markers.mjs` | 标记解析、替换、追加、幂等、重复/嵌套/未闭合 | 8 |
| `28-codegen.mjs` | 整文件/标记生成、diff、幂等、非法标记、工具 | 8 |
| `29-codegen-templates.mjs` | 第二批模板渲染与标记写入 | 8 |
| `13-block-assets.mjs` | 方块面贴图解析 | 7 |
| `14-persist.mjs` | 项目切换持久化 | 10 |
| `15-structure.mjs` | 代码结构文档 | 15 |
| `16-reliability.mjs` | 持久写入、备份回滚、首次导入清理、导入 proof | 5 |
| `helpers.mjs` | 工作区、断言、PNG 生成 | — |
| `render-harness.mjs` | 渲染装置 | — |
