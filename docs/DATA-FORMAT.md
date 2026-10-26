# 数据格式

插件在项目根下使用 `.mcstudio/` 保存设计数据。所有文件均为 UTF-8 JSON，
缩进 2 空格，字段顺序稳定，便于 git diff。

## 1. 目录结构

```text
<项目>/
├── .mcstudio/
│   ├── studio.json           # 工坊标记：存在即表示已被本插件接管
│   ├── project.json          # 项目元数据
│   ├── features.json         # 构想清单
│   ├── summary.json          # 派生摘要（供 agent 一次读取，可安全删除）
│   └── items/
│       ├── ruby.json         # 每个物品一份
│       └── ruby_sword.json
├── docs/                     # 导出文档（插件生成，可提交）
│   ├── README.md
│   ├── FEATURES.md
│   ├── ITEMS.md
│   ├── ASSETS.md
│   ├── ITEMS/
│   │   └── ruby.md
│   └── mcstudio-snapshot.md  # 导入已有工程时生成
└── src/main/resources/assets/<modid>/
    ├── textures/item/<id>.png
    └── models/item/<id>.json
```

> 若项目还不是 gradle 工程（没有 `src/main/resources`），素材会存放在
> `<项目>/.mcstudio/assets/<modid>/` 下。

## 1.1 studio.json（工坊标记）

扫描时通过这个文件判断「是否已导入」，不依赖插件注册表，因此项目文件夹可以
复制、移动或换机器后仍被识别。

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

| 字段 | 说明 |
| --- | --- |
| `projectId` | 首次接管时生成，之后保持不变，用于跨路径识别同一项目 |
| `importedAt` | 首次导入时间，后续不会覆盖 |
| `source` | `create` / `import` / `add` / `open` / `migrate` |
| `path` | 最近一次写入时的绝对路径（仅参考，不用于判断） |
| `mcVersion` | 写入时的目标版本 |

兼容规则：只有 `project.json`、没有 `studio.json` 的老项目，扫描时仍视为「已导入」
（标记为旧数据），首次打开或重新添加时会自动补写标记。

## 2. project.json

```json
{
  "schemaVersion": 1,
  "name": "演示模组",
  "modid": "demomod",
  "version": "0.1.0",
  "description": "示例项目",
  "loader": "neoforge",
  "minecraft": "1.20.1",
  "authors": "张三, 李四",
  "license": "MIT",
  "group": "com.example.demo",
  "minecraftRange": "[1.20.1,1.21)",
  "loaderVersion": "NeoForge 47.1.79",
  "loaderRange": "47.1.79",
  "source": "gradle.properties",
  "createdAt": "2026-10-20T12:00:00.000Z",
  "updatedAt": "2026-10-20T12:30:00.000Z"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 数据格式版本，当前为 1 |
| `modid` | string | 小写字母/数字/下划线，2–64 位 |
| `loader` | `forge` \| `neoforge` \| `fabric` | 目标加载器 |
| `minecraft` | string | 固定 `1.20.1` |
| `authors` | string | 作者，来自 `mod_authors` |
| `license` | string | 许可证，来自 `mod_license` |
| `group` | string | 包名，来自 `mod_group_id` / `maven_group` |
| `minecraftRange` | string | MC 版本范围，来自 `minecraft_version_range` |
| `loaderVersion` | string | 可读的加载器版本，如 `NeoForge 47.1.79` |
| `loaderRange` | string | 加载器版本号原文，如 `47.1.79` |
| `source` | string | 元数据来源：`gradle.properties` 或 `descriptor` |

> 新建项目时只有前八个字段；`authors`、`license`、`group`、版本范围等由导入时从
> `gradle.properties` 读取，缺失则留空。界面默认只展示 modid、Minecraft、加载器，
> 其余字段在「详情 → 更多信息」中查看。

## 2.1 gradle.properties 的解析规则

导入时优先读工程根下的 `gradle.properties`，键名兼容三种加载器：

| 元数据 | 识别键（按顺序取第一个非空） |
| --- | --- |
| modid | `mod_id`、`modid`、`archives_base_name` |
| 名称 | `mod_name` |
| 版本 | `mod_version`、`version` |
| 包名 | `mod_group_id`、`maven_group`、`group` |
| 许可证 | `mod_license`、`license` |
| 作者 | `mod_authors`、`authors` |
| MC 版本 | `minecraft_version`（精确）或 `minecraft_version_range`（范围） |
| NeoForge | `neo_version` |
| Forge | `forge_version` |
| Fabric | `loader_version`、`fabric_loader_version`、`fabric_version` |

解析支持注释（`#`、`!`）、反斜杠续行、`\uXXXX` 与 `\t\n\r\\` 转义、行尾空白裁剪。

### 占位符处理

模板工程的描述文件里常写 `${mod_version}`、`$mod_version`、`${file.jarVersion}`
这类 Gradle 占位符，真正的值要到构建期才替换。处理规则：

1. 识别 `${name}`、`$name` 两种形式；
2. 用 `gradle.properties` 中同名键解析（支持 `project.` / `gradle.` 前缀，值本身是占位符时递归解析一层）；
3. **解析成功** → 用解析结果参与比对；
4. **解析不出来**（如 `${file.jarVersion}`、或键不存在）→ 视为「未提供」，不参与冲突比对；
5. 因此占位符不会造成误报，而真实的值不一致仍会报冲突。

**冲突处理**：同一字段在「导入表单 / gradle.properties / 工程描述文件」中出现不同**真实值**时，
导入直接失败并列出全部取值与来源，要求人工修正。

**必需字段**：`modid`、`minecraft_version`（或范围）、加载器版本三者全缺时同样失败。
其余字段缺失只留空，不阻断导入。

## 3. features.json

```json
{
  "schemaVersion": 1,
  "features": [
    {
      "id": "f_1790000000000",
      "name": "红宝石线",
      "description": "红宝石及其工具、盔甲",
      "status": "planning",
      "priority": "high",
      "version": "0.1.0",
      "items": ["ruby", "ruby_sword"],
      "notes": "",
      "createdAt": "2026-10-20T12:00:00.000Z",
      "updatedAt": "2026-10-20T12:00:00.000Z"
    }
  ]
}
```

- `status`：`idea` / `planning` / `implementing` / `done`
- `priority`：`high` / `medium` / `low`

## 4. items/<id>.json

```json
{
  "schemaVersion": 1,
  "id": "ruby",
  "displayName": "红宝石",
  "type": "material",
  "properties": {
    "maxStackSize": 64,
    "rarity": "uncommon",
    "creativeTab": "demomod.items",
    "renderType": "generated",
    "glint": false,
    "maxDamage": 0,
    "enchantability": 0,
    "repairMaterial": "",
    "burnTime": 0,
    "toolTier": "none",
    "miningLevel": 0,
    "attackDamage": 0,
    "attackSpeed": 0,
    "armor": 0,
    "foodNutrition": 0,
    "foodSaturation": 0,
    "itemTags": ["c:gems"],
    "blockTags": [],
    "loaderNotes": ""
  },
  "tags": [],
  "description": "测试用红宝石",
  "notes": "",
  "canvas": { "x": 0, "y": 0 },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 属性字段

| 分组 | 字段 | 类型 | 默认值 |
| --- | --- | --- | --- |
| 基础属性 | `maxStackSize` | number 1–64 | 64 |
| 基础属性 | `rarity` | common / uncommon / rare / epic | common |
| 基础属性 | `creativeTab` | string | 空 |
| 基础属性 | `renderType` | generated / handheld / block / custom | generated |
| 基础属性 | `glint` | boolean | false |
| 数值属性 | `maxDamage` | number | 0 |
| 数值属性 | `enchantability` | number | 0 |
| 数值属性 | `repairMaterial` | string | 空 |
| 数值属性 | `burnTime` | number（tick） | 0 |
| 行为属性 | `toolTier` | none / wood / stone / iron / gold / diamond / netherite | none |
| 行为属性 | `miningLevel` | number 0–5 | 0 |
| 行为属性 | `attackDamage` | number | 0 |
| 行为属性 | `attackSpeed` | number | 0 |
| 行为属性 | `armor` | number | 0 |
| 行为属性 | `foodNutrition` | number | 0 |
| 行为属性 | `foodSaturation` | number | 0 |
| 标签属性 | `itemTags` | string[] | [] |
| 标签属性 | `blockTags` | string[] | [] |
| 兼容性 | `loaderNotes` | string | 空 |

> 字段定义的唯一来源是 `lib/schema.js` 的 `ITEM_FIELDS`（对外副本为 `data/schema.json`）；
> 页面表单、校验与文档导出都从该数组生成。

## 5. 素材

| 文件 | 规则 |
| --- | --- |
| `textures/item/<id>.png` | 必须是 PNG、正方形、≤ 2MB；MC 常规为 16×16 |
| `models/item/<id>.json` | 合法 JSON；默认 `parent: minecraft:item/generated` |
| `textures` 引用 | `layer0: "<modid>:item/<id>"` |

## 6. 快照文档

导入已有工程时生成 `docs/mcstudio-snapshot.md`，包含：

- 工程基本信息（路径、modid、名称、版本、加载器）；
- 资产扫描结果（贴图数、模型数、注册名数、新建条目数）；
- 贴图 / 模型 / 注册名清单。

快照是一次性的只读记录；后续设计变更以 `.mcstudio/` 与重新导出的文档为准。

## 7. summary.json（派生摘要）

供 agent 一次读取掌握项目全貌，避免逐个解析 `project.json`、`features.json`、`items/*.json`。

```json
{
  "schemaVersion": 1,
  "meta": {
    "name": "示例模组", "modid": "examplemod", "version": "0.1.0",
    "loader": "neoforge", "minecraft": "1.20.1", "loaderVersion": "NeoForge 47.1.79"
  },
  "counts": { "ideas": 8, "ideasDone": 3, "items": 12, "blocks": 5, "totalEntries": 17 },
  "ideas": [{ "id": "f_1", "name": "宝石挖掘", "status": "planning", "priority": "high" }],
  "items": [{ "id": "ruby", "name": "红宝石", "type": "material", "texture": true, "model": true }],
  "missing": { "ids": ["ruby_sword"], "count": 1 },
  "updatedAt": "2026-10-25T09:00:00.000Z"
}
```

**性质**：派生数据，不是事实来源。

- 可以随时删除，下次访问时会重建；
- 任何标注 `summary: true` 的写操作后自动刷新；
- 手工修改不影响插件判断，因为真实数据在 `project.json` / `items/` 里；
- `items[]` 只含最小字段，**不含 19 项属性**——要读属性用 `items/<id>.json` 或 `item_get` 工具。

体积参考：12 个物品 + 8 条构想约 1.2 KB，逐文件读取约 8 KB。

## 7.1 registry.json（插件注册表）

位于 `$DSH_HOME/mcmods-studio/registry.json`，跨项目共享，记录扫描根目录与已登记项目。

```json
{
  "schemaVersion": 1,
  "root": "D:/minecraft-mods",
  "lastProject": "D:/minecraft-mods/examplemod",
  "projects": [
    {
      "path": "D:/minecraft-mods/examplemod",
      "name": "示例模组", "modid": "examplemod",
      "createdAt": "2026-10-20T08:00:00.000Z",
      "updatedAt": "2026-10-25T09:00:00.000Z"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 数据格式版本，当前为 1 |
| `root` | string | 扫描默认根目录 |
| `lastProject` | string | 上次打开的项目路径，供下次进入插件时恢复；空串表示没有 |
| `projects[]` | array | 已登记项目，按登记顺序 |

**`lastProject` 的容错规则**：

- 写入前校验路径仍在 `projects` 中，不在则忽略（防止写入未登记路径）；
- 读取时若路径已不在列表里，按空处理，界面回退到第一个可用项目；
- 移除项目（`projects.remove`）时，若移除的正是它，一并清空；
- 旧注册表没有该字段时自动按空读取，无需迁移。

## 8. notices（导入判定提示）

`project.import`、`project.reimport` 的 `imported.notices` 与 `project.analyzeImport` 的
`notices` 字段，记录导入过程中系统做的判断。

```json
[
  { "level": "info", "code": "source.descriptor",      "message": "未找到 gradle.properties，元数据取自工程描述文件" },
  { "level": "info", "code": "loader.gradle",          "message": "加载器由 gradle.properties 判定为 neoforge" },
  { "level": "info", "code": "descriptor.placeholder", "message": "描述文件中的占位符已用 gradle.properties 解析：${mod_version} → 2.1.0" }
]
```

| code | 触发条件 |
| --- | --- |
| `source.descriptor` | 没有 `gradle.properties`，元数据来自描述文件 |
| `loader.gradle` | 加载器由 `gradle.properties` 判定 |
| `loader.descriptor` | 加载器取自工程描述文件 |
| `descriptor.placeholder` | 描述文件含 Gradle 占位符并被解析 |

**边界**：身份解析失败（缺 modid / MC 版本 / 加载器版本）时不产生 notices——
此时结论尚无意义，直接抛错说明缺什么。

notices 只是提示，不写入 `.mcstudio/`，不影响后续操作。
