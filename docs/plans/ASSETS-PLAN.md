# 素材管理模块计划

> 模块编号：07
> 适用插件版本：v0.1.3
> 代码位置：`lib/assets.js`、`client.js` 的 `AssetsTab`
> 状态：已实现
> 依据：[PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) 第 5 节
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 决定素材写入哪个目录（标准资源目录优先，否则回退）；
- 校验并保存上传的 PNG 贴图；
- 读取贴图为 data URL 供页面预览；
- 查看与编辑物品模型 JSON；
- 统计缺失素材（有物品但缺贴图或缺模型）。

**不负责**：

- 生成 Java 代码；
- 方块状态、语言文件的可视化编辑（当前只能手改文件）；
- 图片裁剪、缩放、动画配置。

## 2. 数据与文件

### 2.1 目录解析规则（`resolveAssetRoot`）

```text
工程存在 src/main/resources ?
  ├─ 是 → root = src/main/resources/assets/<modid>   （standard: true）
  └─ 否 → root = .mcstudio/assets/<modid>            （standard: false）
```

### 2.2 文件路径

| 资源 | 路径 |
| --- | --- |
| 物品贴图 | `<root>/textures/item/<id>.png` |
| 物品模型 | `<root>/models/item/<id>.json` |
| 方块贴图 | `<root>/textures/block/`（只读解析，按 blockstate → 模型 → parent 链） |
| 方块模型 | `<root>/models/block/`（只读解析） |
| 方块状态 | `<root>/blockstates/`（只读解析） |

> 上传支持 `item` 与 `block` 两个贴图目录；`blockstates`、`lang` 由导入模块读取。
> 方块贴图优先按 blockstate → 模型 → parent 链解析；没有 blockstate/模型时回退到同名 `textures/block/<id>.png`。

### 2.3 校验规则

| 规则 | 值 | 失败文案 |
| --- | --- | --- |
| 文件大小 | ≤ 2MB | 「贴图大小超过 2MB 限制」 |
| 格式 | PNG 魔数（`pngSize` 解析 IHDR） | 「文件不是有效的 PNG 图片」 |
| 形状 | 宽 == 高 | 「贴图必须为正方形，当前为 W×H」 |
| id | `^[a-z0-9_]{1,64}$` | 「物品 id 非法」 |
| 数据 | base64 非空 | 「贴图数据为空」 |

### 2.4 清单结构（`listAssets`）

```json
{
  "modid": "demomod",
  "standard": true,
  "root": "D:\\program\\demo\\src\\main\\resources\\assets\\demomod",
  "textures": [{ "id": "ruby", "width": 16, "height": 16, "bytes": 312, "relative": "assets/demomod/textures/item/ruby.png" }],
  "models": [{ "id": "ruby", "parent": "item/generated", "textures": { "layer0": "..." } }],
  "missing": ["ruby_sword"]
}
```

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 选择本地 PNG 文件 | `<input type=file>` 读取为 base64 | `assets.upload` | 保存并刷新清单 |
| 点某个贴图 | 查看大图 | 使用已缓存的 data URL | 预览放大 |
| 点「删除贴图」 | 确认 | `assets.delete` | 文件删除、清单刷新 |
| 点模型「查看 / 编辑」 | `assets.model.get` | 载入文本到编辑框 | 可编辑 |
| 点「保存模型」 | `assets.model.save` | 校验 JSON 后写盘 | 提示成功 |
| 点「生成默认模型」 | `assets.model.save` 空内容 | 后端 `buildDefaultModel` | 生成 `item/generated` |
| 点「刷新」 | `reloadAssets` | `assets.list` | 清单更新 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 打开素材页 | `assets.list` | 扫描 `textures/item` 与 `models/item` | 生成清单与缺失列表 |
| 物品页渲染 | `assets.readMany` | 批量读 data URL | 缩略图 |
| 保存新物品 | `items.save` | 后端 `ensureModel` | 缺失模型自动补 |
| 导入工程 | `scanProjectAssets` | 只读扫描（模块 04） | 不写文件 |

### 3.3 异常事件

| 场景 | 处理 | 用户看到 |
| --- | --- | --- |
| 上传非 PNG | 魔数校验失败 | 「文件不是有效的 PNG 图片」 |
| 上传非正方形 | 宽高比对 | 「贴图必须为正方形，当前为 32×16」 |
| 超过 2MB | 长度检查 | 「贴图大小超过 2MB 限制」 |
| 模型 JSON 非法 | `saveModel` 解析失败 | 报错，不覆盖原文件 |
| 贴图不存在 | `readTextureDataUrl` 返回 `null` | 占位显示 |

## 4. 运行过程

### 4.1 上传贴图

```text
用户选择文件
   │  FileReader 读为 base64（去掉 data: 前缀）
   ▼
client: call('assets.upload', { path, id, base64 })
   │
   ▼
api: assets.upload → requireStudio(path)
   │
   ▼
assets.js uploadTexture
   │  ① isValidItemId(id)
   │  ② base64 非空
   │  ③ Buffer.from(base64)
   │  ④ 长度 ≤ MAX_TEXTURE_BYTES（2MB）
   │  ⑤ pngSize(buffer) —— 解析 IHDR
   │  ⑥ 宽 == 高
   │  ⑦ readProjectMeta 取 modid
   │  ⑧ textureFile() 计算路径（按 resolveAssetRoot）
   │  ⑨ mkdir -p 后写文件
   │  ⑩ 返回 {id,width,height,bytes,path}
   ▼
client: reloadAssets() → assets.list → 刷新清单与预览
```

### 4.2 缺失统计

```text
listAssets
   │  ① 读 textures/item/*.png → textureIds
   │  ② 读 models/item/*.json  → modelIds
   │  ③ 读 .mcstudio/items/*.json → itemIds
   │  ④ missing = itemIds 中「无贴图 或 无模型」的 id
   ▼
返回 { textures, models, missing }
```

### 4.3 默认模型生成

`buildDefaultModel(modid, item)`：

```json
{
  "parent": "item/generated",
  "textures": { "layer0": "<modid>:item/<id>" }
}
```

`ensureModel` 在模型文件不存在时调用它写入。

## 5. 接口

| action | payload | 返回 |
| --- | --- | --- |
| `assets.list` | `{path}` | `{modid,standard,root,textures[],models[],missing[]}` |
| `assets.upload` | `{path,id,base64,kind?}` | `{id,kind,width,height,bytes,path}` |
| `assets.read` | `{path,id}` | `{dataUrl}` |
| `assets.readMany` | `{path,ids[]}` | `{images:{id:dataUrl\|null}}` |
| `assets.delete` | `{path,id,kind?}` | `{ok:true}` |
| `assets.model.get` | `{path,id}` | `{text}` |
| `assets.model.save` | `{path,id,model}` | `{text}` |
| `assets.root` | `{path}` | `{root,standard}` |

## 6. 前端组件

| 组件 | props | 内部状态 | 职责 |
| --- | --- | --- | --- |
| `AssetsTab` | `{project,assets,reloadAssets,setError}` | 选中贴图、模型编辑文本、上传中 | 上传、预览、模型编辑、缺失提示 |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 工程无 `src/main/resources` | 自动回退 `.mcstudio/assets/<modid>`，`standard:false` |
| modid 为空 | `resolveAssetRoot` 使用空 modid，路径异常；实际由项目元数据保证非空 |
| 贴图尺寸非 16×16 | 允许（只要求正方形），界面提示常见尺寸 |
| 同名贴图重复上传 | 覆盖 |
| 模型引用不存在的贴图 | 不校验，原样保存 |
| 删除贴图后模型仍引用 | 不自动清理 |
| 大图预览 | 直接使用 data URL，无压缩 |

## 8. 现状与缺口

**已实现**：目录回退策略、PNG 三重校验、上传/删除/读取、批量预览、模型查看与编辑、默认模型生成、缺失统计、方块贴图按 blockstate → 模型 → parent 链 → 面解析，以及无 blockstate/模型时回退同名方块贴图。

**已知缺口**：

- 模型编辑只支持 `models/item`；`blockstates`、`lang`、`sounds` 只能读取，不能编辑；方块贴图已支持上传/删除；
- 无批量上传、拖拽上传；
- 无图片裁剪/缩放/背景透明化；
- 无动画 `.mcmeta` 编辑；
- 无「模型引用检查」（模型里写的贴图是否真实存在）；
- 无贴图与物品 id 的自动匹配（需手工对应）；
- 上传的贴图不校验是否为 16 的倍数。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理（modid 决定路径） |
| 下游 | 08 文档导出（`ASSETS.md` 使用 `listAssets`） |
| 协同 | 04 工程导入（导入时按同一路径规则读取）、06 物品管理（按 id 对应） |
| 依据 | [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) 第 5 节 |
