# 数据格式

插件在项目根下使用 `.mcstudio/` 保存设计数据。所有文件均为 UTF-8 JSON，
缩进 2 空格，字段顺序稳定，便于 git diff。

## 1. 目录结构

```text
<项目>/
├── .mcstudio/
│   ├── project.json          # 项目元数据
│   ├── features.json         # 功能列表
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

> 字段定义的唯一来源是 `lib/project.js` 的 `ITEM_FIELDS`；
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
