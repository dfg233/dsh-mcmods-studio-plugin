# 重构日志 01：拆分 lib/project.js

> **历史存档（2026-10-28 标注）**：本文记录 2026-10-24 的重构状态，文中版本号、工具数与动作数为当时结果，不随当前版本回改。当前版本见 [VERSION-PLAN.md](../VERSION-PLAN.md)，当前能力见 [STATUS.md](../STATUS.md)。

> 阶段：重构计划 阶段 1
> 日期：2026-10-24
> 状态：已完成并验证
> 影响范围：`lib/` 目录结构，对外接口零变化

## 1. 目的

`lib/project.js` 原本 1281 行、42 个导出，同时承担字段定义、路径计算、校验、项目 CRUD、
条目 CRUD、工程导入六类职责。任何一处改动都要在整份文件里穿行，且所有模块都依赖它，
导致依赖关系扁平、无法单独阅读。

本次按职责拆成 5 个文件，`project.js` 保留为转发层，**保持既有 import 路径不变**。

## 2. 安全措施（重构前）

| 措施 | 内容 |
| --- | --- |
| 完整备份 | `D:\program\_refactor-backup\pre-stage1-20261024-144257\`，含 `lib/`、`client.js`、`index.js`、`package.json`、`cordis.patch.yml`、`test/`、`docs/` |
| 校验清单 | 备份目录内 `MANIFEST.sha256`，19 个文件的 SHA256，可用于逐文件比对 |
| 行为基线 | 重构前 75 项测试全部通过，作为重构后的对照 |
| 导出基线 | 重构前 `lib/project.js` 导出 42 个符号，逐个记录 |

## 3. 变更清单

### 3.1 新增文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `lib/paths.js` | 75 | `.mcstudio/` 相关路径、modid 与物品 id 校验、路径归属判断 |
| `lib/schema.js` | 182 | 加载器、构想状态与优先级、物品类型与 19 个属性字段 |
| `lib/meta.js` | 217 | `project.json` 与 `studio.json` 读写、项目创建、项目状态判断 |
| `lib/entries.js` | 194 | 构想与物品的增删改查、字段补全与类型纠偏、`readProject` 聚合视图 |
| `lib/import.js` | 687 | 工程识别、资源扫描、身份解析、差异比对、条目同步、快照生成 |

### 3.2 改写文件

| 文件 | 变更 |
| --- | --- |
| `lib/project.js` | 1281 行 → **18 行**，改为纯转发层，`export *` 五个新模块 |

转发层内容：

```js
export * from './paths.js'
export * from './schema.js'
export * from './meta.js'
export * from './entries.js'
export * from './import.js'
```

## 4. 拆分边界

| 原函数 | 新归属 |
| --- | --- |
| `DATA_DIR`、`MC_VERSION`、`STUDIO_MARKER` | paths |
| `projectDataDir`、`projectMetaFile`、`itemsDir`、`featuresFile`、`docsDir`、`studioMarkerFile` | paths |
| `isValidModId`、`isValidItemId`、`requireProjectPath`、`assertInside` | paths |
| `LOADERS`、`FEATURE_STATUS`、`FEATURE_PRIORITY`、`ITEM_TYPES`、`ITEM_FIELDS`、`itemSchema`、`defaultProperties` | schema |
| `readStudioMarker`、`writeStudioMarker`、`ensureStudioMarker` | meta |
| `readProjectMeta`、`isStudioProject`、`isRegisteredProject`、`createProject`、`touchMeta`、`saveProjectMeta` | meta |
| `listFeatures`、`saveFeature`、`deleteFeature` | entries |
| `listItems`、`normalizeItem`、`saveItem`、`deleteItem`、`coerceProperties` | entries |
| `readProject` | entries（见 5.1） |
| `scanCandidates`、`readBuildText`、`detectDescriptor`、`matchToml` | import |
| `scanProjectAssets`、`scanRegistryNames` | import |
| `importProject`、`reimportProject`、`analyzeImport`、`diffEntries`、`syncEntries`、`resolveIdentity`、`writeSnapshot` | import |

## 5. 实施中遇到的问题

### 5.1 循环依赖：meta ↔ entries

**现象**：初次拆分后测试全部失败，报 `LOADERS is not defined`。

**原因**：`meta.js` 的 `readProject` 需要 `entries.js` 的 `listItems`；而 `entries.js`
的 `saveItem`、`deleteItem` 需要 `meta.js` 的 `touchMeta`、`readProjectMeta`，形成双向依赖。

**处理**：

1. 把 `readProject` 从 `meta.js` 移到 `entries.js`（它本就是元数据 + 两类条目的聚合视图，
   放在条目层更自然）；
2. `createProject` 原本以 `readProject(path)` 收尾，改为直接返回
   `{ path, meta, features: [], items: [] }` —— 新建项目的条目必然为空，
   这样 `meta.js` 不再需要反向依赖 `entries.js`。

**结果**：依赖方向变为单向 `paths → schema → meta → entries → import`。

### 5.2 迁移时遗漏导入（共 7 处）

拆分后各文件缺少原文件顶部的导入语句。逐个补全：

| 文件 | 补入 |
| --- | --- |
| `paths.js` | `isDirectory` |
| `meta.js` | `LOADERS` |
| `entries.js` | `ITEM_TYPES`、`FEATURE_STATUS`、`FEATURE_PRIORITY`、`isValidItemId` |
| `import.js` | `requireProjectPath`、`isStudioProject`、`dataDir`、`projectMetaFile` |

为此写了一个一次性检查脚本（临时文件，未入库），在剥离注释与字符串字面量后，
比对「代码里出现的符号」与「已导入 + 本文件声明的符号」，能稳定报出缺失项。
前两轮靠人工 grep 判断有遗漏，改用该脚本后一次补齐。

### 5.3 行数增加

`lib/` 合计 2543 → 2615 行（+72）。原因是每个新文件有文件头注释与 import 块，
属于预期开销，不是逻辑膨胀。

## 6. 验证

| 项目 | 结果 |
| --- | --- |
| 语法检查 | `node --check` 全部通过（11 个文件） |
| 单元测试 | **75 项全部通过**，7 个用例文件全绿 |
| 导出符号 | 42 个，与重构前逐个比对**完全一致** |
| 接口运行时 | 重装插件后 `boot` 返回正常（19 个字段、根目录正确） |

测试输出：

```text
════════════════════════════════════════════════════════════
  汇总：7 个用例文件，通过 7，失败 0
════════════════════════════════════════════════════════════
  全部通过
```

## 7. 未改动的内容

- 所有函数体：逐字搬迁，未修改任何实现逻辑；
- 对外接口：28 个 action 全部保持原样；
- `client.js`、`index.js`、`lib/api.js`、`lib/assets.js`、`lib/docs.js`、`lib/gradle.js`、`lib/registry.js`：本次未触碰；
- `package.json`：未改动。

## 8. 回滚方式

若需回退到重构前状态：

```bash
cd /d/program/dsh-mcmods-studio-plugin
rm -rf lib
cp -r "/d/program/_refactor-backup/pre-stage1-20261024-144257/lib" ./
npm test
```

校验备份完整性：

```bash
cd "/d/program/_refactor-backup/pre-stage1-20261024-144257"
sha256sum -c MANIFEST.sha256
```

## 9. 后续

阶段 1 完成后，`lib/` 的模块边界已经清晰。下一步按计划进行阶段 2（整理 `client.js`），
但需注意：`client.js` 是 `window.__ModuleLoader__.load` 的单文件模块，不能直接 ES import，
只能做文件内部分区与组件拆分，不改变加载契约。
