# 代码索引（函数与接口参考）

> 适用版本：模组工坊（`dsh-mcmods-studio-plugin`）v0.1.0
> 更新日期：2026-10-21
> 用途：修改插件代码前先查这里，按「文件 → 函数 → 参数 → 返回」定位，不必通读全部源码。
> 说明：文中的行号为编写时的位置，改动后会偏移，**优先按函数名搜索**。

## 0. 怎么用这份文档

| 你要做的事 | 查哪一节 |
| --- | --- |
| 加一个接口动作 | 3.2 动作清单 + 3.3 新增动作步骤 |
| 加一个物品属性字段 | 2.2 `ITEM_FIELDS` + 7 常见改动检索 |
| 加一个页面页签 | 4.5 `StudioPage` |
| 改侧栏入口 / 图标 | 4.6 座位注册点 |
| 改右侧栏内容 | 4.4 `SidebarStudioPanel` |
| 改导出的 Markdown | 2.4 `lib/docs.js` |
| 改数据文件结构 | 5 数据结构 |
| 排查「改了没生效」 | 8 验证与排查 |

## 1. 文件地图

| 文件 | 职责 | 约行数 |
| --- | --- | --- |
| `package.json` | bundle 清单：包名、`dsh.bundle.patch`、`dsh.client` 注入列表 | 42 |
| `cordis.patch.yml` | 向 Loader 插入一行 `id: mc-mod-studio` | 12 |
| `index.js` | Host 入口：HTTP 路由、请求体解析、卸载清理 | 103 |
| `lib/api.js` | 动作表：所有 `action` 的实现与分派 | 360 |
| `lib/registry.js` | 插件运行数据：注册表、路径展开、原子写入 | 191 |
| `lib/paths.js` | `.mcstudio/` 路径、id 校验、路径归属判断 | 75 |
| `lib/schema.js` | 加载器、构想状态与优先级、物品类型与 19 个字段 | 182 |
| `lib/meta.js` | `project.json` 与 `studio.json` 读写、项目创建与状态判断 | 217 |
| `lib/entries.js` | 构想与物品 CRUD、字段纠偏、`readProject` 聚合视图 | 194 |
| `lib/import.js` | 工程识别、资源扫描、身份解析、差异比对、条目同步、快照 | 687 |
| `lib/summary.js` | 维护 `.mcstudio/summary.json` 项目摘要，供 agent 一次读取 | 108 |
| `lib/validate.js` | 项目校验：id、数值范围、素材缺失、模型引用、语言键 | 175 |
| `lib/tools.js` | 17 个 agent 工具的定义与调用入口 | 400 |
| `data/schema.json` | 字段定义的对外副本（由 `scripts/gen-schema.mjs` 生成） | 7360 字节 |
| `lib/project.js` | **转发层**：`export *` 上述五个模块，保持既有 import 路径不变 | 18 |
| `lib/gradle.js` | 解析 `gradle.properties`，提取模组元数据与加载器判定 | 214 |
| `lib/assets.js` | 贴图与模型：路径解析、PNG 校验、上传、读取、默认模型 | 221 |
| `lib/docs.js` | Markdown 导出：五个文件的渲染 | 256 |
| `client.js` | 浏览器半：全部 UI（单文件） | ~1946 |
| `test/*.mjs` | 回归测试：75 项用例，`npm test` 运行 | 1542 |
| `docs/*.md` | 插件自身文档（本文件即索引） | — |

> `lib/project.js` 在 2026-10-24 的拆分中从 1281 行降为 18 行转发层，
> 详见 [refactor/01-split-project.md](refactor/01-split-project.md)。

## 2. 数据层（`lib/`）

> 2.2–2.6 原本都在 `lib/project.js` 里，2026-10-24 按职责拆分为五个模块。
> 函数名与签名未变，只是换了文件归属；`lib/project.js` 作为转发层继续导出全部符号，
> 既有 `import ... from './project.js'` 无需修改。

### 2.1 `lib/registry.js`

插件级数据（不属于某个项目），位于 `$DSH_HOME/mcmods-studio/registry.json`。

| 函数 | 用途 | 参数 | 返回 / 说明 |
| --- | --- | --- | --- |
| `DEFAULT_ROOT` | 默认扫描根目录 | — | 常量 `'D:\\program'` |
| `dataDir()` | 插件数据目录 | — | `$DSH_HOME/mcmods-studio`；`DSH_HOME` 缺省用 `~/.dsh` |
| `registryPath()` | 注册表文件路径 | — | `dataDir()/registry.json` |
| `expandPath(input)` | 展开 `~`、转绝对路径 | `input: string` | 绝对路径字符串；空输入返回 `''` |
| `isInside(parent, child)` | 判断子路径是否在父目录内 | 两个路径 | `boolean`，用于防目录穿越 |
| `readJson(file, fallback)` | 读取 JSON | `file, fallback` | 解析失败返回 `fallback`，不抛错 |
| `writeJson(file, value)` | 原子写 JSON | `file, value` | 先写临时文件再改名，避免半截文件 |
| `writeText(file, text)` | 原子写文本 | `file, text` | 同上 |
| `isDirectory(p)` / `isFile(p)` | 类型判断 | 路径 | `boolean`，不抛错 |
| `readRegistry()` | 读注册表并补默认值 | — | `{schemaVersion, root, projects[]}` |
| `saveRegistry(registry)` | 写回注册表 | `registry` | 写入并规范字段 |
| `touchProject(path, patch)` | 登记或更新项目 | `path, patch={name,modid}` | 已存在则更新 `updatedAt`，否则追加 |
| `forgetProject(path)` | 从注册表移除 | `path` | 不删除磁盘文件 |
| `setRegistryRoot(root)` | 修改扫描根目录 | `root` | 返回更新后的 registry |

### 2.2 项目数据模型（拆分后的五个文件）

项目级数据模型。**新增字段或类型时主要改 `schema.js`。**

| 文件 | 内容 |
| --- | --- |
| `paths.js` | `DATA_DIR`、`MC_VERSION`、`STUDIO_MARKER`、路径函数、id 校验、`requireProjectPath`、`assertInside` |
| `schema.js` | `LOADERS`、`FEATURE_STATUS`、`FEATURE_PRIORITY`、`ITEM_TYPES`、`ITEM_FIELDS`、`itemSchema`、`defaultProperties` |
| `meta.js` | `readStudioMarker`、`writeStudioMarker`、`ensureStudioMarker`、`readProjectMeta`、`isStudioProject`、`isRegisteredProject`、`createProject`、`touchMeta`、`saveProjectMeta` |
| `entries.js` | `listFeatures`、`saveFeature`、`deleteFeature`、`listItems`、`normalizeItem`、`saveItem`、`deleteItem`、`readProject` |
| `import.js` | `scanCandidates`、`detectDescriptor`、`scanProjectAssets`、`scanRegistryNames`、`importProject`、`reimportProject`、`analyzeImport`、`writeSnapshot` |

> 依赖方向：`paths → schema → meta → entries → import`，单向无环。
> `readProject` 放在 entries 而非 meta，是为了避免 meta ↔ entries 循环依赖。

以下为全部导出（42 项），均可从 `lib/project.js` 继续导入；「文件」列指出实际所在模块。

| 导出 | 所在文件 | 用途 | 说明 |
| --- | --- | --- | --- |
| `DATA_DIR = '.mcstudio'` | paths | 项目内数据目录名 | 改动会影响所有路径函数 |
| `MC_VERSION = '1.20.1'` | paths | 当前适配的 MC 版本 | 未来改为项目字段 `mcVersion` |
| `LOADERS[]` | schema | 加载器定义 | `{id,label,note}`，当前 forge / neoforge / fabric |
| `FEATURE_STATUS[]` | schema | 功能状态 | idea / planning / implementing / done |
| `FEATURE_PRIORITY[]` | schema | 优先级 | high / medium / low |
| `ITEM_TYPES[]` | schema | 物品类型 | item / block / tool / weapon / armor / food / material |
| `ITEM_FIELDS[]` | schema | 19 个属性字段定义 | `{key,label,type,group,default,min,max,unit,hint,options?}` |
| `itemSchema()` | schema | 给前端的字段定义 | 返回 `{mcVersion, loaders, fields, types, statuses, priorities}` |
| `defaultProperties()` | schema | 生成默认属性对象 | 由 `ITEM_FIELDS` 推导 |
| `projectDataDir(path)` | paths | `.mcstudio` 绝对路径 | — |
| `STUDIO_MARKER = 'studio.json'` | paths | 工坊标记文件名 | 存在即表示项目已被接管 |
| `studioMarkerFile(path)` | paths | 标记文件路径 | `<项目>/.mcstudio/studio.json` |
| `readStudioMarker(path)` | meta | 读标记 | 返回对象或 `null`（不存在/损坏） |
| `writeStudioMarker(path, patch)` | meta | 写标记 | 首次生成 `projectId`/`importedAt`，之后不覆盖 |
| `ensureStudioMarker(path, source)` | 缺失时补写 | 老项目迁移用，返回标记对象 |
| `projectMetaFile(path)` | `project.json` 路径 | — |
| `itemsDir(path)` | `items/` 路径 | — |
| `featuresFile(path)` | `features.json` 路径 | — |
| `docsDir(path)` | `docs/` 路径 | — |
| `isValidModId(id)` | modid 校验 | 小写字母数字下划线，2–64 |
| `isValidItemId(id)` | 物品 id 校验 | 小写字母数字下划线，1–64 |
| `requireProjectPath(input)` | 解析并校验项目目录 | 必须存在且为目录，否则抛错 |
| `readProjectMeta(path)` | 读项目元数据 | 返回 meta 或 `null` |
| `isStudioProject(path)` | 是否为工坊项目 | 以 `project.json` 是否存在判断 |
| `readProject(path)` | 读完整项目 | `{path, meta, features, items}` |
| `createProject(input)` | 新建项目 | 入参 `{path,name,modid,version,description,loader}`；要求目录为空或不存在；只建 `.mcstudio/` 与 `docs/` |
| `listFeatures(path)` | 构想清单 | 数组，按更新时间倒序 |
| `saveFeature(path, feature)` | 新增或更新功能 | 无 `id` 时生成；返回保存后的条目 |
| `deleteFeature(path, id)` | 删除功能 | 返回剩余数组 |
| `listItems(path)` | 物品列表 | 读 `items/*.json` |
| `normalizeItem(raw, fallbackId)` | 物品字段补全与纠偏 | 补 id/displayName/type/properties/canvas 等 |
| `saveItem(path, item)` | 保存物品 | 校验 id、类型纠偏、写 `items/<id>.json`、touch meta |
| `deleteItem(path, id)` | 删除物品 | 同时尽可能清理贴图与模型 |
| `touchMeta(path)` | 更新 `updatedAt` | 内部使用 |
| `saveProjectMeta(path, patch)` | 合并写入元数据 | 返回新 meta |
| `scanCandidates(root)` | 扫描候选工程 | 返回数组，元素含 `{path,name,modid,loader,version,isStudio,imported,importedAt,projectId,legacy}` |
| `importProject(input)` | 导入已有工程 | 入参 `{path,modid?,name?,version?}`；按标准路径扫描资源与 Java 注册名，方块/物品自动分类；返回项目数据与 `imported:{assets,registryNames,created,snapshot}` |
| `writeSnapshot(path, info)` | 写导入快照 | 生成 `docs/mcstudio-snapshot.md`，按资源类型分节 |
| `assertInside(root, target)` | 路径归属校验 | 越界抛错 |

其余符号按前缀可定位文件：路径与校验类在 `paths.js`，字段与枚举在 `schema.js`，
项目元数据与标记在 `meta.js`，两类条目与 `readProject` 在 `entries.js`，
`scan*` / `import*` / `analyze*` / `reimport*` / `writeSnapshot` 在 `import.js`。

内部函数（不导出，改导入逻辑时看这里，全部位于 `import.js`）：

| 函数 | 作用 |
| --- | --- |
| `detectDescriptor(path, props)` | 识别 `fabric.mod.json` / `mods.toml` / `neoforge.mods.toml` / gradle；描述文件里的占位符先用 `props` 解析，解析不出按未提供处理 |
| `readBuildText(path)` | 合并读取 `build.gradle`、`build.gradle.kts`、`gradle.properties`、`settings.gradle` |
| `resolveIdentity(path, input)` | 合并「表单 / gradle.properties / 描述文件」三处信息；只比对真实值，冲突或缺必需项时抛异常 |
| `diffEntries(assets, registryNames, existingItems)` | 计算新增 / 保留 / 类型冲突 / 无资源条目四类差异 |
| `syncEntries(path, modid, {mode})` | 按差异把条目写入 `items/`；`mode` 为 `merge` 或 `overwrite` |
| `scanProjectAssets(path, modid)` | 扫描 `assets/<modid>` 与 `data/<modid>` 下各类资源，返回 `{textures,blockTextures,models,blockModels,blockstates,langs,recipes,lootTables,tags,advancements,namespaces}` |
| `scanRegistryNames(path)` | 遍历 `src/main/java` 提取 `register("id")` 注册名 |

导入相关导出：

| 函数 | 用途 |
| --- | --- |
| `isRegisteredProject(path)` | 是否在项目列表（注册表）中；与 `isStudioProject`（看目录内 `project.json`）区分 |
| `importProject(input)` | 首次导入；`input.force` 可跳过「已登记」检查 |
| `reimportProject(input)` | 重新导入；`input.mode` 为 `merge`（默认）或 `overwrite` |
| `analyzeImport(input)` | 只分析不写盘，返回 `{kind, identity, identityError, diff, meta}` |

### 2.3 `lib/gradle.js`

| 函数 | 用途 | 返回 |
| --- | --- | --- |
| `parseProperties(text)` | 解析 Java properties 文本（注释、续行、`\uXXXX` 与 `\t\n\r\\` 转义） | 键值对象 |
| `extractGradleMeta(props)` | 按别名表提取模组元数据 | `{modid,name,version,group,license,authors,minecraft,minecraftRange,neoVersion,forgeVersion,loaderVersion,loader,missing}` |
| `detectLoaderFromGradle(meta, props)` | 依据版本字段判定加载器 | `forge` / `neoforge` / `fabric` / `''` |
| `readGradleProperties(path)` | 读取并解析工程根下的 `gradle.properties` | `{exists, file, props, meta}` |
| `loaderVersionText(meta)` | 生成可读的加载器版本文本 | 如 `NeoForge 47.1.79` |
| `isPlaceholder(value)` | 是否为 `${name}` / `$name` 形式的 Gradle 占位符 | `boolean` |
| `placeholderKey(value)` | 取出占位符内的变量名 | `string`，非占位符返回 `''` |
| `resolvePlaceholder(value, props)` | 用 gradle.properties 解析占位符 | 解析值或 `''`；`file.` 前缀直接返回 `''` |
| `realValue(value, props)` | 把值规范成「真实值或空」 | 占位符解析结果，解析失败为 `''` |

### 2.4 `lib/assets.js`

| 函数 | 用途 | 参数 | 返回 |
| --- | --- | --- | --- |
| `resolveAssetRoot(projectPath, modid)` | 决定素材根目录 | 项目路径、modid | `{root, standard}`；有 `src/main/resources` 用标准路径，否则 `.mcstudio/assets/<modid>` |
| `textureFile(projectPath, modid, id)` | 贴图文件路径 | — | `.../textures/item/<id>.png` |
| `modelFile(projectPath, modid, id)` | 模型文件路径 | — | `.../models/item/<id>.json` |
| `pngSize(buffer)` | 解析 PNG 宽高 | Buffer | `{width,height}` 或 `null`（非 PNG） |
| `listAssets(projectPath)` | 素材清单 | — | `{modid, standard, root, textures[], models[], missing[]}` |
| `uploadTexture(projectPath, id, base64)` | 保存上传贴图 | base64（不含前缀） | `{id,width,height,bytes,path}`；校验 PNG、正方形、≤2MB |
| `readTextureDataUrl(projectPath, id)` | 读取为 data URL | — | `string \| null` |
| `deleteTexture(projectPath, id)` | 删除贴图 | — | `true` |
| `readModel(projectPath, id)` | 读模型文本 | — | JSON 文本（不存在返回默认模型） |
| `saveModel(projectPath, id, model)` | 保存模型 | 文本或对象 | 校验后的文本 |
| `buildDefaultModel(modid, item)` | 生成默认 `item/generated` 模型 | — | 对象 |
| `ensureModel(projectPath, item)` | 缺失时补默认模型 | — | 写入结果 |

### 2.5 `lib/docs.js`

| 函数 | 用途 | 参数 | 返回 |
| --- | --- | --- | --- |
| `exportProjectDocs(projectPath)` | 导出全部 Markdown | 项目路径 | `{files: string[]}`，元素形如 `docs/ITEMS/ruby.md` |

内部渲染函数（改文档排版时找它们）：`renderFeatures`、`renderItemsIndex`、`renderItem`（单件）、`renderAssets`、`renderDocsIndex`。

## 3. 接口层

### 3.1 HTTP 约定

- 路由：`POST /mcmods-studio/api`（`index.js` 中 `webServer.register` 注册，`kind: 'exact'`）；
- 请求体：`{"action": "items.save", "payload": {...}}`，上限 8MB；
- 成功：`{"ok": true, "data": ...}`；失败：`{"ok": false, "error": "中文错误信息"}`；
- 非 POST 返回 405；未知 action 抛 `未知动作：xxx`；
- 浏览器侧统一用 `client.js` 的 `call(action, payload)`，它负责取 `data` 或抛 `Error`。

### 3.2 动作清单

| action | payload | 返回 data | 说明 |
| --- | --- | --- | --- |
| `boot` | — | `{registry:{root,projects[]}, schema, defaultRoot, mcVersion, guide}` | 首屏：注册表 + 字段定义 + 教程；项目项带 `missing/isStudio` |
| `projects.scan` | `{root?}` | `{root, candidates[]}` | 扫描候选工程，不改注册表 |
| `projects.add` | `{path}` | `{path, meta}` | 必须是工坊项目，否则提示先导入 |
| `projects.remove` | `{path}` | `{path}` | 只移除登记，不删文件 |
| `registry.setRoot` | `{root}` | `{root}` | 改扫描根目录 |
| `project.create` | `{path,name,modid,version,description,loader}` | 项目数据 | 可位于任意目录；目录须为空或不存在 |
| `project.open` | `{path}` | `{path, meta, features, items}` | 打开并刷新 `updatedAt` |
| `project.import` | `{path,modid?,name?,version?,force?}` | 项目数据 + `imported` | 先读 `gradle.properties` 补全信息；冲突或缺必需项抛错；`force` 跳过已登记检查 |
| `project.analyzeImport` | `{path,modid?,name?,version?}` | `{kind, registered, identity, identityError, diff, meta}` | 只分析不写盘；`kind` 为 `new`/`orphan`/`registered` |
| `project.reimport` | `{path, mode?}` | 项目数据 + `imported` | `mode` 为 `merge`（默认，保留已有）或 `overwrite`（改写类型冲突） |
| `project.saveMeta` | `{path, patch}` | `meta` | 合并字段 |
| `features.list` | `{path}` | `{features}` | — |
| `features.save` | `{path, feature}` | `{feature}` | 无 id 即新增 |
| `features.delete` | `{path, id}` | `{features}` | 返回剩余列表 |
| `items.list` | `{path}` | `{items}` | — |
| `items.save` | `{path, item, ensureModel?}` | `{item}` | 默认自动补模型；`ensureModel:false` 关闭 |
| `items.delete` | `{path, id}` | `{ok:true}` | — |
| `assets.list` | `{path}` | `{modid,standard,root,textures,models,missing}` | — |
| `assets.upload` | `{path, id, base64}` | `{id,width,height,bytes,path}` | PNG/正方形/≤2MB |
| `assets.read` | `{path, id}` | `{dataUrl}` | 不存在时 `dataUrl:null` |
| `assets.readMany` | `{path, ids[]}` | `{images:{id:dataUrl}}` | 缺失项为 `null` |
| `assets.delete` | `{path, id}` | `{ok:true}` | — |
| `assets.model.get` | `{path, id}` | `{text}` | 缺失返回默认模型 |
| `assets.model.save` | `{path, id, model}` | `{text}` | 保存前校验 JSON |
| `assets.root` | `{path}` | `{root, standard}` | 素材根目录 |
| `docs.export` | `{path}` | `{files[]}` | 写 `<项目>/docs/` |
| `guide` | — | `{text}` | 内置构建教程 Markdown |
| `agent.summary` | `{path}` | 摘要对象 | 刷新并返回 `.mcstudio/summary.json` |
| `agent.validate` | `{path}` | `{ok, errors[], warnings[]}` | 项目校验，输出分级问题 |
| `agent.tools` | — | `{tools[], actions[]}` | 列出 17 个 agent 工具与 32 个动作 |
| `agent.call` | `{tool, args}` | 工具结果 | 用工具名调用，agent 只需记一个入口 |
| `debug.clientGraph` | — | `{available, keys, hits}` | 诊断：客户端模块图里的本插件条目 |

### 3.3 新增一个动作的步骤

1. 在 `lib/api.js` 的 `actions` 对象里加 `async 'your.action'(payload) {...}`；
2. 用 `requireStudio(payload?.path)` 校验项目，或 `requireProjectPath` 只校验目录；
3. 需要业务逻辑就加到 `lib/project.js` / `assets.js` / `docs.js` 并导出，`api.js` 只做编排；
4. 在 `client.js` 用 `await call('your.action', {...})` 调用；
5. 若动作要写文件，路径必须经 `assertInside` 或项目路径函数拼接，禁止直接拼用户输入。

## 4. 客户端（`client.js`）

### 4.1 运行模型

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

- `API = '/mcmods-studio/api'`：接口地址，改路径时同步 `index.js`；
- `KEY = 'mc-mod-studio'`：主面板 key，也是侧栏 id 与右侧栏 tab id；
- `call(action, payload)`：`fetch` 封装，成功返回 `data`，失败抛 `Error(error)`。

### 4.2 主题常量

| 常量 | 内容 | 用法 |
| --- | --- | --- |
| `C` | `bg/layer/layer2/border/border2/text/muted/brand/danger/success/warn` | 取 DSH 主题变量，自动适配明暗 |
| `S` | 页面骨架样式：`page/header/title/subtitle/tabs/tab/body/card/sectionTitle/row/btn/input/label/hint/badge/empty/table/th/td/overlay/modal*` | `style={S.card}`、`style={S.btn('ghost')}` |

新增界面时优先复用 `S`，不要在组件里硬编码颜色。

### 4.3 通用组件（约 131–360 行）

| 组件 | 用途 | 主要 props |
| --- | --- | --- |
| `Icon` | 插件图标（立方体 + 锤子） | `{size, active}` |
| `Modal` | 弹窗容器 | `{title,onClose,footer,children}` |
| `Field` | 表单行（标签 + 必填 + 提示） | `{label,required,hint,children}` |
| `TextInput` / `NumberInput` / `Textarea` | 文本 / 数字 / 多行 | `{value,onChange,placeholder,...}` |
| `Select` | 下拉选择 | `{value,onChange,options[]}` |
| `Toggle` | 布尔开关 | `{value,onChange}` |
| `TagsInput` | 标签数组编辑 | `{value,onChange,placeholder}` |
| `Tabs` | 页签条 | `{tabs,value,onChange}` |
| `Markdown` | 轻量 Markdown 渲染（标题/列表/代码块/表格） | `{text}` |
| `renderInline` | 行内 `code`/`**粗体**` 渲染 | `(text)` |
| `PathField` | 路径输入框 + 「浏览…」按钮（调系统目录选择器） | `{label,value,onChange,required,hint,placeholder}` |
| `pickFolder()` | 调 `ctx.get('uiWorkspace').pickDirectory()`，取消或不可用时返回 `null` | 无参，`Promise<string\|null>` |

### 4.4 页面组件

| 组件 | 行号 | 职责 | 关键 props / 状态 |
| --- | --- | --- | --- |
| `useStudioData` | 382 | 首屏数据 hook：boot、项目、素材 | 返回 `{boot,project,assets,error,busy,refreshBoot,open,setProject,setAssets,setError}` |
| `ProjectTab` | 423 | 项目列表、新建、扫描、导入、移除 | `{boot,project,refreshBoot,open,onCreate,onImport,onCloseProject}` |
| `FeaturesTab` | 568 | 构想页 | `{project,setProject,schema,setError}` |
| `FeatureEditor` | 634 | 功能编辑弹窗 | `{value,onSave,onCancel}` |
| `ItemsTab` | 685 | 物品列表 / 画布 | `{project,setProject,assets,schema,setError,reloadAssets}` |
| `ItemEditor` | 928 | 物品属性弹窗（按分组渲染字段） | `{value,schema,onSave,onCancel}` |
| `renderField` | 1025 | 按字段类型渲染控件 | `(field, value, onChange)` |
| `AssetsTab` | 1046 | 贴图上传、预览、模型编辑 | `{project,assets,reloadAssets,setError}` |
| `GuideTab` | 1205 | 构建教程 | `{guide}` |
| `StudioPage` | 1317 | 页面框架与页签 | 内部状态 `tab/createOpen/importTarget/reimportTarget` |
| `CreateProjectModal` | 约 1490 | 新建项目弹窗 | `{defaultRoot,onClose,onCreated}` |
| `ImportProjectModal` | 约 1540 | 导入工程弹窗（第一步：填表） | `{candidate,onClose,onImported}` |
| `ProjectDetailModal` | 约 1603 | 项目详情（默认只显示 modid/MC/加载器，其余折叠） | `{item,onClose,setError}` |
| `ImportConfirmModal` | 约 1671 | 导入/重新导入前的差异确认 | `{path,seed,title,confirmText,onClose,onConfirm}` |
| `SidebarStudioPanel` | 约 1790 | 右侧栏：项目概览 + 选中物品 | 无 props，读 `studioState` |
| `InfoRow` | 约 1810 | 「标签—值」行 | `{label,value}` |

`StudioPage` 的页签定义（加页签改这里）：

```js
const tabs = [
  { id: 'project', label: '项目' },
  { id: 'features', label: '构想' },
  { id: 'items', label: '物品' },
  { id: 'assets', label: '贴图与模型' },
  { id: 'guide', label: '构建教程' },
]
```

### 4.5 跨面板共享状态（约 362–380 行）

| 函数 | 用途 |
| --- | --- |
| `getStudioState()` | 读 `{projectPath, itemId}` |
| `setStudioState(patch)` | 合并写入并通知所有订阅者 |
| `subscribeStudioState(fn)` | 订阅变更，返回取消函数 |

写入点：`useStudioData.open()` 成功后设 `projectPath`；`ItemsTab` 列表「编辑」与画布卡片点击时设 `itemId`；`StudioPage` 关闭项目时清空。

### 4.6 座位注册点（文件末尾 `apply(ctx)`）

| 槽位 | 注册参数 | 渲染组件 | 作用 |
| --- | --- | --- | --- |
| `main` | `{name:'main', key:KEY}` | `StudioPage` | 主面板页面 |
| `sidebar.panellist` | `{name:'sidebar.panellist', id:KEY, order:2, label:'模组工坊'}` | `Icon` | 左侧图标区入口 |
| `sidebarRightTabs.register` | `{id:KEY, kind:KEY, title, guide:[{order:30,title,description,icon}]}` | — | 注册右侧栏 tab 类型与「开始」页卡片 |
| `sidebar.right.pane.tab` | `{name:'sidebar.right.pane.tab', key:KEY}` | `SidebarStudioPanel` | 右侧栏标签内容 |

右侧栏注册被包在 `ctx.inject(['sidebarRightTabs'], (sub) => {...})` 中，返回清理函数数组；新增/删除时保持同样的 disposer 结构，避免热重载残留。

## 5. 数据结构

### 5.0 `<项目>/.mcstudio/studio.json`（工坊标记）

扫描时据此判断「是否已导入」，不依赖注册表。

```json
{
  "schemaVersion": 1,
  "projectId": "p_mvicghvb_pmnuu7",
  "importedAt": "2026-10-21T16:46:18.743Z",
  "importedBy": "dsh-mcmods-studio-plugin",
  "source": "create",
  "path": "D:\\program\\demo",
  "mcVersion": "1.20.1"
}
```

### 5.1 `<项目>/.mcstudio/project.json`

```json
{
  "schemaVersion": 1,
  "name": "示例模组",
  "modid": "examplemod",
  "version": "0.1.0",
  "description": "",
  "loader": "neoforge",
  "minecraft": "1.20.1",
  "createdAt": "ISO 时间",
  "updatedAt": "ISO 时间"
}
```

### 5.2 `<项目>/.mcstudio/features.json`

功能条目数组，条目字段：`id`、`name`、`description`、`status`（idea/planning/implementing/done）、`priority`（high/medium/low）、`version`、`notes`、`createdAt`、`updatedAt`。

### 5.3 `<项目>/.mcstudio/items/<id>.json`

```json
{
  "id": "ruby",
  "displayName": "红宝石",
  "type": "material",
  "description": "",
  "properties": { "maxStackSize": 64, "rarity": "common", "...": "共 19 项" },
  "canvas": { "x": 0, "y": 0 },
  "createdAt": "ISO 时间",
  "updatedAt": "ISO 时间"
}
```

### 5.4 `$DSH_HOME/mcmods-studio/registry.json`

```json
{
  "schemaVersion": 1,
  "root": "D:\\program",
  "projects": [{ "path": "D:\\program\\demo", "name": "示例", "modid": "demo", "updatedAt": "ISO 时间" }]
}
```

## 6. 导出文档

`exportProjectDocs` 生成：

| 文件 | 渲染函数 | 内容 |
| --- | --- | --- |
| `docs/FEATURES.md` | `renderFeatures` | 构想按状态分组 |
| `docs/ITEMS.md` | `renderItemsIndex` | 物品总览表 |
| `docs/ITEMS/<id>.md` | `renderItem` | 单件物品全部属性 |
| `docs/ASSETS.md` | `renderAssets` | 贴图与模型清单 + 缺失 |
| `docs/README.md` | `renderDocsIndex` | 文档索引 |

## 7. 常见改动检索

| 想改什么 | 改哪里 | 连带检查 |
| --- | --- | --- |
| 加物品属性字段 | `lib/project.js` 的 `ITEM_FIELDS` | 前端自动渲染、导出自动带上；检查 `defaultProperties` 与文档表格宽度 |
| 加物品类型 | `ITEM_TYPES` | 类型下拉、筛选、代码模板 |
| 加功能状态 | `FEATURE_STATUS`（含 `tone`） | 徽章颜色、导出分组 |
| 加加载器 | `LOADERS` | 导入识别、构建教程、代码模板目录 |
| 加接口动作 | `lib/api.js` 的 `actions` | 前端 `call()`、错误文案、README 动作表 |
| 加页面页签 | `client.js` 的 `StudioPage` | `Tabs` 渲染分支 |
| 改侧栏顺序/图标 | `apply(ctx)` 的 `order`、`Icon` | 侧栏截图核对 |
| 改右侧栏显示内容 | `SidebarStudioPanel` | `studioState` 写入点 |
| 改素材路径规则 | `lib/assets.js` 的 `resolveAssetRoot` | 导入扫描、缺失统计 |
| 改导出排版 | `lib/docs.js` 的 `render*` | 导出后打开文件核对 |
| 改默认扫描根目录 | `lib/registry.js` 的 `DEFAULT_ROOT` | 已存注册表不会自动改 |
| 改数据目录名 | `DATA_DIR` | 老项目需迁移脚本 |
| 换 MC 版本 | `MC_VERSION`（未来 `mcVersion`） | 字段能力表、代码模板、构建教程 |
| 改「已导入」判定 | `lib/project.js` 的 `readStudioMarker` / `scanCandidates` | 前端 `isImported()`、老项目兼容 |
| 改目录选择行为 | `pickFolder()` / `PathField` | `uiWorkspace.pickDirectory()` 返回 `null` 时要有手动输入兜底 |

## 8. 验证与排查

```bash
# 语法检查（改完必跑）
node --check index.js && node --check client.js && for f in lib/*.js; do node --check "$f"; done

# 接口自检
curl -s -X POST http://127.0.0.1:50839/mcmods-studio/api \
  -H "Content-Type: application/json" \
  -d '{"action":"boot","payload":{}}'
```

- 座位是否注册：用 `cordis_inspect_query` 查 `sidebar.panellist`、`sidebar.right.pane.tab`、`main`；
- 客户端模块是否被登记：`debug.clientGraph`；
- 改了 `client.js`：刷新页面即可（Host 会重算 bundle 版本）；
- 改了 `index.js` / `lib/`：需要 `remove_bundle` + `install_bundle` 重装插件；
- 页面没变化：先看浏览器控制台首条红色报错，再确认是否刷新。

## 9. 依赖关系

```
index.js
  └─ lib/api.js
       ├─ lib/registry.js   （路径、注册表、原子写）
       ├─ lib/project.js    （项目/功能/物品 + 扫描导入）
       │    └─ lib/registry.js
       ├─ lib/assets.js     （贴图与模型）
       │    └─ lib/project.js
       └─ lib/docs.js       （Markdown 导出）
            ├─ lib/project.js
            └─ lib/assets.js

client.js
  └─ POST /mcmods-studio/api → index.js → lib/api.js → dispatch(action)
```

修改下层函数时，注意上层是否依赖其返回结构（尤其 `readProject`、`listAssets`、`itemSchema`）。
