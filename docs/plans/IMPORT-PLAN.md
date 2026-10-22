# 工程导入模块计划

> 模块编号：04
> 代码位置：`lib/gradle.js`；`lib/project.js` 的 `resolveIdentity`、`diffEntries`、`syncEntries`、`importProject`、`reimportProject`、`analyzeImport`、`detectDescriptor`、`scanProjectAssets`、`scanRegistryNames`、`writeSnapshot`；`client.js` 的 `ImportProjectModal`、`ImportConfirmModal`、`ProjectDetailModal`
> 状态：已实现
> 依据：[PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md)
> 最后更新：2026-10-22

## 1. 模块职责

**负责**：

- 读 `gradle.properties` 补全工程的 modid、名称、版本、作者、许可证、包名、MC 与加载器版本；
- 三处取值（导入表单 / `gradle.properties` / 工程描述文件）冲突时报错，要求人工介入；
- 判定工程是否已导入（在项目列表 / 曾被移除 / 全新）；
- 按**标准固定路径**扫描资源与注册名，转成工坊条目（方块 / 物品）；
- 生成项目快照、写入 `.mcstudio/` 数据与工坊标记；
- 支持重新导入：保留用户数据，只补新增条目。

**不负责**：

- 修改工程的 Java、gradle、资源文件（只读）；
- 解析编译后的 `.jar`；
- 处理与 modid 不同的其他命名空间资源（只记录，不导入）。

## 1.1 导入流程（五步）

| 步骤 | 动作 | 失败处理 |
| --- | --- | --- |
| 1 | 选择导入目录 | 目录不存在 → 报错 |
| 2 | 读 `gradle.properties` 补全信息 | 缺 modid / minecraft_version / 加载器版本 → 抛异常；三处冲突 → 抛异常 |
| 3 | 判定是否已在工坊 | 在项目列表 → 抛「该目录已经是工坊项目，可直接打开」；曾被移除 → 走添加流程；全新 → 正常导入 |
| 4 | 扫描资源并创建条目 | 已有条目默认保留，只补新增 |
| 5 | 写入元数据、标记、快照 | — |

## 2. 数据与文件

### 2.1 读取的文件（只读）

| 用途 | 路径 |
| --- | --- |
| 加载器与元数据 | `src/main/resources/fabric.mod.json` |
| 同上 | `src/main/resources/META-INF/mods.toml` |
| 同上 | `src/main/resources/META-INF/neoforge.mods.toml` |
| 加载器兜底 | `build.gradle` / `build.gradle.kts` / `gradle.properties` / `settings.gradle` |
| Java 注册名 | `src/main/java/**/*.java` |

### 2.2 扫描的资源（11 类）

| 类别 | 路径（相对 `src/main/resources`） |
| --- | --- |
| 物品贴图 | `assets/<modid>/textures/item/*.png` |
| 方块贴图 | `assets/<modid>/textures/block/*.png` |
| 物品模型 | `assets/<modid>/models/item/*.json` |
| 方块模型 | `assets/<modid>/models/block/*.json` |
| 方块状态 | `assets/<modid>/blockstates/*.json` |
| 语言文件 | `assets/<modid>/lang/*.json` |
| 配方 | `data/<modid>/recipes/*.json` |
| 战利品表 | `data/<modid>/loot_tables/blocks/*.json` |
| 标签 | `data/<modid>/tags/items|blocks/*.json` |
| 进度 | `data/<modid>/advancements/*.json` |
| 命名空间 | `assets/*`、`data/*` 的子目录名 |

### 2.3 写入的文件

| 文件 | 内容 |
| --- | --- |
| `.mcstudio/project.json` | 从描述文件提取的元数据 |
| `.mcstudio/studio.json` | `source: 'import'` |
| `.mcstudio/features.json` | 不存在时创建空列表 |
| `.mcstudio/items/<id>.json` | 每个扫到的资源 id 一条 |
| `docs/mcstudio-snapshot.md` | 资源清单快照 |

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 扫描列表点「导入」 | 打开 `ImportProjectModal` | 带入候选的 path/name/modid | 弹窗预填 |
| 点「浏览…」 | `pickFolder()` | 系统选择器 | 回填工程目录 |
| 点「导入」 | 提交 | `project.import` | 导入完成后 `refreshBoot` → `open` → 切到项目页 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| `project.import` | 目录已是工坊项目 | `readProjectMeta` 非空 | 抛「该目录已经是工坊项目，可直接打开」 |
| 同上 | 找不到描述文件 | `detectDescriptor` 返回 `null` | 抛「未能识别工程类型」 |
| 同上 | modid 不合法 | 正则校验失败 | 抛「无法确定合法的 modid，请在导入时手动填写」 |
| 同上 | 扫描完成 | 按分类创建条目 | 已有同名条目跳过 |
| 同上 | 全部完成 | `writeSnapshot` | 生成快照 |

### 3.3 加载器判定事件（关键分支）

```text
有 fabric.mod.json ?
  ├─ 是 → loader = fabric，读 id/name/version/description
  └─ 否 → 读构建脚本文本（build.gradle / .kts / gradle.properties / settings.gradle）
          │  含 net.neoforged | neoforged*gralde | neo_version ?
          │
          有 META-INF/neoforge.mods.toml ?
            ├─ 是 → loader = neoforge
            └─ 否 → 有 META-INF/mods.toml ?
                     ├─ 是 → 构建脚本像 NeoForge ? neoforge : forge
                     └─ 否 → 仅构建脚本可判定 ? forge/neoforge/fabric : 返回 null
```

> 1.20.1 的 Forge 与 NeoForge **共用 `mods.toml`**，只能靠构建脚本区分。

## 4. 运行过程

### 4.0 前端两步确认

```text
ImportProjectModal（第一步：填目录与可选覆盖值）
   │  点「下一步：确认导入」
   ▼
call('project.analyzeImport', { path, modid?, name?, version? })
   │  返回 kind / identity / identityError / diff
   ▼
ImportConfirmModal（展示将新增、已存在、类型冲突、无资源条目）
   │  点「开始导入」
   ▼
call('project.import', { path, name?, modid?, version? })
```

### 4.1 首次导入

```text
client: call('project.import', {path, name?, modid?, version?})
   │
   ▼
api: project.import
   │  ① expandPath(path)
   │  ② importProject({...})
   ▼
project.js importProject
   │  ③ requireProjectPath —— 目录必须存在
   │  ④ resolveIdentity —— 读 gradle.properties + detectDescriptor，合并三处取值
   │      · 冲突 → 抛「项目信息存在冲突」
   │      · 缺 modid / minecraft / 加载器版本 → 抛「缺少必要信息」
   │  ⑤ isRegisteredProject —— 在项目列表则抛「该目录已经是工坊项目」
   │      · 有工坊数据但未登记（曾被移除）→ 继续
   │  ⑥ 组装 meta（含 authors/license/group/版本范围/source）
   │  ⑦ mkdir .mcstudio/items，writeJson project.json
   │  ⑧ syncEntries(mode:'merge')
   │      · scanProjectAssets + scanRegistryNames
   │      · diffEntries 算出 新增 / 保留 / 类型冲突 / 无资源
   │      · 新增条目写 items/<id>.json；已有条目不动
   │  ⑨ features.json 缺失则创建
   │  ⑩ writeStudioMarker(source: 首次 'import' / 重新 'reimport')
   │  ⑪ writeSnapshot —— docs/mcstudio-snapshot.md
   │  ⑫ 返回 { ...readProject(), imported:{assets,registryNames,created,updated,kept,...} }
   ▼
api: touchProject(path,{name,modid})   ← 写入注册表（含「曾被移除」的情形）
   │
   ▼
client: refreshBoot() → open(path) → setTab('project')
```

### 4.2 重新导入

```text
点列表行「重新导入」
   │
   ▼
ImportConfirmModal（同分析接口）
   │  用户可勾选「按扫描结果改写类型冲突项」
   ▼
call('project.reimport', { path, mode: 'merge' | 'overwrite' })
   │
   ▼
reimportProject
   │  ① requireProjectPath + readProjectMeta（必须已是工坊项目）
   │  ② resolveIdentity 刷新元数据（冲突仍会抛错）
   │  ③ 合并写回 project.json（保留 createdAt）
   │  ④ syncEntries(mode)
   │      · merge：只新增；overwrite：另把类型冲突项改成扫描结果
   │  ⑤ writeStudioMarker(source:'reimport')
   │  ⑥ writeSnapshot
   ▼
前端提示：新增 N 个、改写 M 个、保留 K 个
```

### 4.3 条目创建规则

| 判定 | 类型 | 描述字段写入 |
| --- | --- | --- |
| 有 blockstate / 方块模型 / 方块贴图 | `block` | 「贴图已存在；模型已存在」或对应「缺…」 |
| 其余（物品贴图 / 物品模型 / 注册名） | `item` | 同上 |
| 语言文件名（`zh_cn`、`en_us`） | **不创建条目** | — |
| 其他命名空间的资源 | **不创建条目** | 只在快照中记录 |

### 4.4 快照文档结构

1. 标题与生成时间；
2. 「基本信息」表（目录、modid、名称、版本、加载器、目标版本，以及可选的 MC 版本范围、加载器版本、作者、许可证、包名、信息来源）；
3. 「资源扫描」总表（类型 / 路径 / 数量）；
4. 各类型清单小节（物品贴图、方块贴图、模型、方块状态、语言、配方、战利品表、标签、进度、注册名）；
5. 「检测到的命名空间」（标注本项目 / 其他）。

## 5. 接口

| action | payload | 返回 |
| --- | --- | --- |
| `project.analyzeImport` | `{path, modid?, name?, version?}` | `{kind, registered, hasStudioData, marker, identity, identityError, conflicts, missing, meta, scan, diff}` |
| `project.import` | `{path, modid?, name?, version?, force?}` | `{path, meta, features, items, imported:{assets, registryNames, created, updated, kept, typeConflicts, missing, blocks, mode, snapshot}}` |
| `project.reimport` | `{path, mode?}` | 同上 |

`kind` 取值：`registered`（在项目列表）/ `orphan`（有工坊数据但不在列表）/ `new`（全新目录）。

错误文案：

| 场景 | 文案 |
| --- | --- |
| 目录不存在 | `项目目录不存在：xxx` |
| 已在项目列表 | `该目录已经是工坊项目，可直接打开` |
| 三处取值冲突 | `项目信息存在冲突，请修正后重试 —— modid：a（gradle.properties） ≠ b（工程描述文件）…` |
| 缺必需字段 | `gradle.properties 与工程描述文件都缺少必要信息：modid、加载器版本…。请在导入表单中手动填写 modid，或补全 gradle.properties。` |
| modid 非法 | `无法确定合法的 modid，请在导入时手动填写` |

## 6. 前端组件

| 组件 | props | 内部状态 | 职责 |
| --- | --- | --- | --- |
| `ImportProjectModal` | `{candidate, onClose, onImported, setError}` | `draft/confirming` | 第一步：工程目录与可选覆盖值；点「下一步」进入确认 |
| `ImportConfirmModal` | `{path, seed, title, confirmText, onClose, onConfirm}` | `analysis/error/busy/overwrite/loading` | 第二步：展示身份、判定结果与差异，确认后执行 |
| `ProjectDetailModal` | `{item, onClose, setError}` | `expanded/loading/meta/error` | 项目详情；默认只显示 modid、MC 版本、加载器，其余折叠 |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 资源目录不存在 | 对应类别返回空数组，不报错 |
| 资源目录无读取权限 | `readdir` 捕获后按空处理 |
| Java 文件 > 512KB | 跳过，不解析 |
| Java 目录层级 > 12 层 | 停止递归 |
| `register(` 写法变体 | 同时匹配 `register("id",` 与 `register("id")` |
| 同一 id 同时有物品与方块特征 | 优先判为方块 |
| 条目已存在 | 跳过，不覆盖用户改过的数据 |
| 重复导入 | 第二次直接报「已经是工坊项目」 |
| 快照重复生成 | 覆盖同名文件 |

## 8. 现状与缺口

**已实现**：加载器识别（含 1.20.1 NeoForge 共用 `mods.toml` 的处理）、11 类资源扫描、方块/物品分类、语言文件排除、命名空间记录、注册名提取、快照生成、标记写入。

**已知缺口**：

- 不解析 `.jar`；
- 不扫描 `src/client/resources`（Fabric 分源集）；
- 不解析 `models/block` 与 `blockstates` 之间的引用关系，只按文件名建条目；
- 注册名提取是正则匹配，无法覆盖 `DeferredRegister` 之外的复杂写法（如变量传入）；
- 不导入 `data/<modid>/worldgen`、`damage_type`、`enchantments` 等新目录；
- 不识别 `pack.mcmeta`；
- 导入后不提供「差异对比」（重新扫描时新增/删除的资源）。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理（元数据与标记写入）、03 扫描发现（导入入口） |
| 下游 | 06 物品管理（条目落到 `items/`）、07 素材管理（资源路径规则）、08 文档导出（快照之外的文档） |
| 依据 | [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) |
