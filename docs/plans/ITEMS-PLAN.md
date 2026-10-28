# 物品管理模块计划

> 模块编号：06
> 适用插件版本：v0.1.2
> 代码位置：`lib/schema.js` 的 `ITEM_FIELDS`/`ITEM_TYPES`/`itemSchema`/`defaultProperties`；`lib/entries.js` 的 `listItems`/`normalizeItem`/`saveItem`/`deleteItem`；`lib/paths.js` 的 `itemsDir`；`client.js` 的 `ItemsTab`、`ItemEditor`、`renderField`、`defaultSlot`
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 以「物品」为单位记录模组内容（含方块，方块是一种物品类型）；
- 提供 19 个属性字段的编辑能力，按五组分类；
- 两种浏览方式：表格列表与自由排布的画布；
- 搜索、删除、画布坐标持久化。

**不负责**：

- 生成 Java 注册代码（规划于模块 11）；
- 贴图与模型的实际文件（模块 07）；
- 配方、战利品表等数据文件。

## 2. 数据与文件

### 2.1 存储文件

路径：`<项目>/.mcstudio/items/<id>.json`，一个物品一个文件。

```json
{
  "id": "ruby",
  "displayName": "红宝石",
  "type": "material",
  "description": "",
  "properties": { "maxStackSize": 64, "rarity": "common", "...": "共 19 项" },
  "canvas": { "x": 344, "y": 152 },
  "createdAt": "2026-10-22T12:00:00.000Z",
  "updatedAt": "2026-10-22T12:00:00.000Z"
}
```

### 2.2 字段定义（`ITEM_FIELDS`，19 项五组）

| 分组 | 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| 基础属性 | `maxStackSize` | number | 64 | 1–64，工具/盔甲通常 1 |
| | `rarity` | select | common | 稀有度 |
| | `creativeTab` | text | 空 | 创造模式分类 |
| | `renderType` | select | generated | 渲染模型类型 |
| | `glint` | boolean | false | 附魔光效 |
| 数值属性 | `maxDamage` | number | 0 | 0 表示无耐久 |
| | `enchantability` | number | 0 | 附魔能力 |
| | `repairMaterial` | text | 空 | 修复材料 |
| | `burnTime` | number | 0 | 燃烧时间（tick） |
| 行为属性 | `toolTier` | select | none | 工具等级 |
| | `miningLevel` | number | 0 | 采集等级 |
| | `attackDamage` | number | 0 | 攻击伤害 |
| | `attackSpeed` | number | 0 | 攻击速度 |
| | `armor` | number | 0 | 护甲值 |
| | `foodNutrition` | number | 0 | 食物恢复值 |
| | `foodSaturation` | number | 0 | 食物饱和度 |
| 标签属性 | `itemTags` | tags | [] | 物品标签 |
| | `blockTags` | tags | [] | 方块标签 |
| 兼容性 | `loaderNotes` | textarea | 空 | 加载器差异备注 |

### 2.3 类型枚举（`ITEM_TYPES`，7 种）

`item` 普通物品、`block` 方块、`tool` 工具、`weapon` 武器、`armor` 盔甲、`food` 食物、`material` 材料。

### 2.4 画布常量

| 常量 | 值 | 用途 |
| --- | --- | --- |
| `CANVAS_COLUMNS` | 4 | 初始排布列数 |
| `CANVAS_CELL_W` | 172 | 单元格宽 |
| `CANVAS_CELL_H` | 152 | 单元格高 |

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 输入搜索词 | `setQuery` | 前端按 id / 显示名过滤 | 列表与画布同步过滤 |
| 点「列表 / 画布」 | `setView` | 切换渲染方式 | 视图切换，数据不变 |
| 列表行点「编辑」 | `setEditing(item)` + `setStudioState({itemId})` | 打开编辑器 | 右侧栏同步显示该物品 |
| 画布卡片单击 | 同上（拖拽后不触发） | `movedRef` 判断 | 打开编辑器 |
| 画布卡片拖拽 | `onPointerDown` → window 监听 move/up | 实时更新坐标 | 松手后 `items.save` 持久化 |
| 编辑器点「保存」 | `items.save` | 返回条目 → 替换列表项 | 列表刷新 |
| 点「删除」 | `window.confirm` | `items.delete` | 从列表移除 |
| 点「新建物品」 | 打开空编辑器 | 默认属性 | 新条目 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 打开项目 | `readProject` | 读 `items/*.json` | 列表填充 |
| 进入物品页 | `assets.readMany` | 批量取贴图 data URL | 缩略图显示 |
| 首次渲染画布 | `setPositions` | 有 `canvas` 用保存值，否则 `defaultSlot(index)` | 初始 4 列网格 |
| 保存新物品 | `items.save` | 后端默认 `ensureModel` | 自动补 `models/item/<id>.json` |
| 拖动结束 | `persistPosition` | `items.save` 带 `canvas` | 坐标写盘 |

### 3.3 异常事件

| 场景 | 处理 | 用户看到 |
| --- | --- | --- |
| 未打开项目 | 提前返回 | 「请先在「项目」中打开一个项目。」 |
| id 非法 | 后端抛错 | 「物品 id 只能包含小写字母、数字和下划线，长度 1-64」 |
| 保存失败 | `setError` | 顶部错误条 |
| 贴图读取失败 | `images[id] = null` | 显示「—」占位 |

## 4. 运行过程

### 4.1 保存物品

```text
ItemEditor 点「保存」
   │  onSave(draft)
   ▼
ItemsTab.save
   │  call('items.save', { path, item: draft })
   ▼
api: items.save
   │  ① requireStudio(path)
   │  ② saveItem(path, item)
   │  ③ ensureModel(path, item)（payload.ensureModel !== false）
   ▼
project.js saveItem
   │  ④ id 转小写 + 正则校验
   │  ⑤ mkdir items/
   │  ⑥ 读旧文件，取 createdAt
   │  ⑦ normalizeItem 补全字段
   │  ⑧ coerceProperties 类型纠偏（数字转 number、tags 转数组）
   │  ⑨ writeJson items/<id>.json
   │  ⑩ touchMeta
   │  ⑪ 返回条目
   ▼
client: 用返回条目替换列表中的同 id 项，关闭弹窗
```

### 4.2 画布拖拽

```text
pointerdown（卡片）
   │  记录 {id, startX, startY, baseX, baseY}，movedRef = false
   ▼
pointermove（window）
   │  位移 > 3px → movedRef = true
   │  setPositions(prev => ({...prev, [id]: {x: baseX+dx, y: baseY+dy}}))
   ▼
pointerup（window）
   │  取 positionsRef.current[id]
   │  persistPosition(id, position) → items.save 带 canvas
   │  setDrag(null)
   ▼
点击事件（若 movedRef 为真则忽略，避免拖拽误触编辑）
```

### 4.3 初始排布算法

`defaultSlot(index)`：

```text
col = index % CANVAS_COLUMNS
row = floor(index / CANVAS_COLUMNS)
x = col * CANVAS_CELL_W
y = row * CANVAS_CELL_H
```

已有 `canvas` 且非 `(0,0)` 时沿用保存值。

## 5. 接口

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `items.list` | `{path}` | `{items}` | — |
| `items.save` | `{path, item, ensureModel?}` | `{item}` | 默认自动补模型 |
| `items.delete` | `{path, id}` | `{ok:true}` | 同时尝试清理贴图与模型 |

## 6. 前端组件

| 组件 | props | 内部状态 | 职责 |
| --- | --- | --- | --- |
| `ItemsTab` | `{project, setProject, assets, schema, setError, reloadAssets}` | `view/query/editing/images/positions/drag` | 双视图、搜索、拖拽 |
| `ItemEditor` | `{value, schema, onSave, onCancel}` | 表单草稿 | 19 字段分组编辑 |
| `renderField` | `(field, value, onChange)` | — | 按 `type` 分发到 Text/Number/Select/Toggle/Tags/Textarea |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 物品 id 含大写或空格 | 保存前转小写；正则不通过则报错 |
| `properties` 缺字段 | `normalizeItem` 用 `defaultProperties()` 补齐 |
| 数字字段收到字符串 | `coerceProperties` 转数字，非法值回落默认 |
| 画布坐标为负 | 拖拽时 `Math.max(0, …)` 夹紧 |
| 两个物品同坐标 | 允许重叠（后渲染的在上层） |
| 删除物品 | 同时尝试删除贴图与模型文件（失败忽略） |
| 画布容器高度 | 由最大 `y + 176` 决定，最小 420 |

## 8. 现状与缺口

**已实现**：19 字段五组编辑、7 种类型、列表/画布双视图、搜索、拖拽持久化、自动补模型、批量贴图预览。

**已知缺口**：

- 无排序（按文件名）；
- 无按类型/标签筛选；
- 无批量编辑与复制；
- 无字段级校验提示（如 `maxStackSize` 超范围只依赖后端夹紧）；
- 画布无缩放、对齐、框选、多选；
- 画布位置未做碰撞避让；
- 删除物品不清理 `docs/ITEMS/<id>.md` 的历史导出文件；
- 物品与功能、配方之间无关联。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理、04 工程导入（批量建条目） |
| 下游 | 07 素材管理（贴图/模型按 id 对应）、08 文档导出（`ITEMS.md`、`ITEMS/<id>.md`）、11 代码工作区（注册代码生成的数据来源） |
| 展示 | 10 界面外壳（右侧栏显示选中物品属性） |
