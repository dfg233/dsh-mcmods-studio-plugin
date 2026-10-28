# 文档导出模块计划

> 模块编号：08
> 适用插件版本：v0.1.3
> 代码位置：`lib/docs.js`、`lib/api.js` 的 `docs.export`
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 把 `.mcstudio/` 里的数据渲染成可读、可提交的 Markdown；
- 一次导出五个文件到项目 `docs/`；
- 保证导出幂等（重复导出结果一致，覆盖同名文件）。

**不负责**：

- 修改 `.mcstudio/` 源数据（只读）；
- 生成 HTML / PDF；
- 导出构建产物或代码。

## 2. 数据与文件

### 2.1 输出文件

| 文件 | 渲染函数 | 内容 |
| --- | --- | --- |
| `docs/FEATURES.md` | `renderFeatures` | 构想，按状态分组 |
| `docs/ITEMS.md` | `renderItemsIndex` | 物品总览表（id、名称、类型、堆叠、耐久） |
| `docs/ITEMS/<id>.md` | `renderItem` | 单件物品全部 19 项属性 |
| `docs/ASSETS.md` | `renderAssets` | 贴图与模型清单 + 缺失提示 |
| `docs/README.md` | `renderDocsIndex` | 文档索引与统计 |

### 2.2 输入数据

| 来源 | 函数 |
| --- | --- |
| 项目元数据 | `readProjectMeta` |
| 构想清单 | `listFeatures` |
| 物品列表 | `listItems` |
| 素材清单 | `listAssets` |
| 字段定义 | `ITEM_FIELDS`、`ITEM_TYPES`、`FEATURE_STATUS`、`FEATURE_PRIORITY`、`LOADERS` |

> 所有内容来自 `.mcstudio/`，不含用户手写内容，可安全提交进 git。

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 点「导出文档」 | `docs.export` | 逐文件渲染并写盘 | 返回文件列表 |
| 再次点击 | 同上 | 覆盖同名文件 | 内容随数据更新 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 导出开始 | `docsDir(path)` | 不存在则 `mkdir -p` | 目录就绪 |
| 写单个文件 | `writeText` | 原子写 | 失败不影响其他文件（顺序执行，遇错中断） |
| 物品循环 | `listItems` | 每个物品一个 md | `docs/ITEMS/<id>.md` |
| 完成 | 收集 `written[]` | 返回相对路径数组 | 前端提示数量 |

### 3.3 异常事件

| 场景 | 处理 | 用户看到 |
| --- | --- | --- |
| 未打开项目 | `requireStudio` 抛错 | 错误条 |
| 目录无写权限 | `writeText` 抛错 | 错误信息 |
| 物品 id 含非法字符 | 已在保存时拦截，导出不再校验 | — |

## 4. 运行过程

```text
用户点「导出文档」
   │
   ▼
client: call('docs.export', { path })
   │
   ▼
api: docs.export → requireStudio(path) → exportProjectDocs(path)
   │
   ▼
docs.js exportProjectDocs
   │  ① readProjectMeta → meta
   │  ② listFeatures → features
   │  ③ listItems → items
   │  ④ listAssets → assets
   │  ⑤ mkdir docs/ 与 docs/ITEMS/
   │  ⑥ write('FEATURES.md',  renderFeatures(meta, features))
   │  ⑦ write('ITEMS.md',     renderItemsIndex(meta, items))
   │  ⑧ write('ASSETS.md',    renderAssets(meta, assets))
   │  ⑨ write('README.md',    renderDocsIndex(meta, 统计))
   │  ⑩ for item of items: write(`ITEMS/${item.id}.md`, renderItem(meta, item))
   │  ⑪ 返回 { files: ['docs/FEATURES.md', ...] }
   ▼
client: 显示「已导出 N 个文件」
```

### 4.1 各渲染函数要点

| 函数 | 结构 |
| --- | --- |
| `renderFeatures` | 标题 + 统计 + 按 `FEATURE_STATUS` 分组的二级标题与条目列表（含优先级、版本、说明、备注） |
| `renderItemsIndex` | 标题 + 表格（ID / 名称 / 类型 / 最大堆叠 / 耐久），类型用中文标签 |
| `renderItem` | 标题（`名称（id）`）+ 基本信息表 + 五组属性表 + 画布坐标 + 描述 |
| `renderAssets` | 标题 + 素材根目录与是否标准路径 + 贴图表 + 模型表 + 缺失清单 |
| `renderDocsIndex` | 标题 + 项目信息 + 各文档链接 + 功能/物品数量统计 |

### 4.2 幂等性

- 文件名固定，不追加时间戳；
- 内容只依赖 `.mcstudio/` 数据，不含「导出时间」以外的易变字段；
- 重复导出覆盖同名文件，git diff 只反映真实数据变化。

## 5. 接口

| action | payload | 返回 |
| --- | --- | --- |
| `docs.export` | `{path}` | `{files: string[]}` |

`files` 元素形如 `docs/ITEMS/ruby.md`，前端用于提示与后续跳转。

## 6. 前端组件

导出入口位于 `ProjectTab`（项目页），按钮文案「导出文档」，调用后把文件数量显示在提示区。

无独立组件；文档内容在页面上的展示走 `GuideTab` 的 `Markdown` 渲染器（仅用于构建教程）。

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 物品数为 0 | `ITEMS.md` 只有表头与「暂无物品」 |
| 功能数为 0 | `FEATURES.md` 只输出统计 |
| 素材全部缺失 | `ASSETS.md` 缺失清单列出全部 id |
| `docs/` 已存在 | 直接写入，不删除其他文件 |
| 用户手改过导出文件 | 下次导出会被覆盖（文档中已注明） |
| 物品 id 含路径分隔符 | 保存阶段已禁止，导出不会产生子目录 |

## 8. 现状与缺口

**已实现**：五个文件、按状态分组、单物品详情、素材缺失提示、索引页、幂等覆盖。

**已知缺口**：

- 不导出 `blockstates`、`recipes`、`loot_tables` 等资源（导入时扫到了，但没有对应文档）；
- 不导出画布布局图（只有坐标文字）；
- 不支持自定义模板；
- 不生成 `mcstudio-snapshot.md`（该文件只在导入时生成）；
- 无「导出前预览」；
- 删除物品后不清理 `docs/ITEMS/<id>.md`。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理（meta）、05 构想、06 物品管理、07 素材管理 |
| 下游 | 无（终端输出） |
| 依据 | [DATA-FORMAT.md](../DATA-FORMAT.md) 的导出文件说明 |
