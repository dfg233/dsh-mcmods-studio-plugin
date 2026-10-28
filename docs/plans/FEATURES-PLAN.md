# 构想模块计划

> 模块编号：05
> 适用插件版本：v0.1.2
> 代码位置：`lib/entries.js` 的 `listFeatures`/`saveFeature`/`deleteFeature`；`lib/paths.js` 的 `featuresFile`；`lib/schema.js` 的 `FEATURE_STATUS`/`FEATURE_PRIORITY`；`client.js` 的 `FeaturesTab`、`FeatureEditor`；`lib/docs.js` 的 `renderFeatures`
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 记录模组要做的玩法功能（不是章节、不是任务清单）；
- 每条功能有状态与优先级，可增删改；
- 按状态分组导出到 `docs/FEATURES.md`。

**不负责**：

- 功能与素材之间的引用关系（物品已通过 `items` 字段关联，素材尚未关联）；
- 功能排期、工时、甘特图；
- 多人协作与评论。

## 2. 数据与文件

### 2.1 存储文件

路径：`<项目>/.mcstudio/features.json`

```json
{
  "schemaVersion": 1,
  "features": [
    {
      "id": "f_1729600000000",
      "name": "宝石挖掘",
      "description": "用镐挖掘获得红宝石",
      "status": "planning",
      "priority": "high",
      "version": "0.1.0",
      "notes": "",
      "createdAt": "2026-10-22T12:00:00.000Z",
      "updatedAt": "2026-10-22T12:00:00.000Z"
    }
  ]
}
```

### 2.2 枚举定义（`lib/schema.js`）

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `FEATURE_STATUS` | `idea` 构思 / `planning` 规划中 / `implementing` 实现中 / `done` 已完成 | 带 `tone` 决定徽章颜色 |
| `FEATURE_PRIORITY` | `high` 高 / `medium` 中 / `low` 低 | 导出时用于排序提示 |

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 点「新增功能」 | `setEditing({空条目})` | 打开 `FeatureEditor` | 弹窗出现 |
| 点某行「编辑」 | `setEditing(feature)` | 打开弹窗并预填 | 可修改 |
| 弹窗点「保存」 | `features.save` | 返回条目 → 合并进 `project.features` | 列表更新、弹窗关闭 |
| 点「删除」 | `window.confirm` 确认 | `features.delete` | 返回剩余数组 → 覆盖列表 |
| 弹窗点「取消」 | `setEditing(null)` | 丢弃草稿 | 无写入 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 保存时无 `id` | 生成 `f_<时间戳>` | 追加到列表 | 新条目在末尾 |
| 保存时已有 `id` | 替换同 id 条目 | 更新 `updatedAt` | 不产生重复 |
| 打开项目 | `readProject` | 读 `features.json` | 无文件时返回空数组 |
| 导出文档 | `renderFeatures` | 按状态分组渲染 | `docs/FEATURES.md` |

### 3.3 异常事件

| 场景 | 处理 | 用户看到 |
| --- | --- | --- |
| 未打开项目 | `FeaturesTab` 提前返回 | 「请先在「项目」中打开一个项目。」 |
| 保存失败 | `setError` | 顶部错误条 |
| 删除时取消确认 | 直接返回 | 无变化 |

## 4. 运行过程

### 4.1 新增功能

```text
点「新增功能」
   │  setEditing({ name:'', description:'', status:'idea', priority:'medium', version:'', notes:'' })
   ▼
FeatureEditor 渲染表单（名称、说明、状态下拉、优先级下拉、版本、备注）
   │
   ▼  用户点「保存」
client: call('features.save', {path, feature})
   │
   ▼
api: features.save
   │  ① requireStudio(path)
   │  ② saveFeature(path, feature)
   ▼
project.js saveFeature
   │  ③ listFeatures 读现有数组
   │  ④ 无 id → 生成 f_<Date.now()>
   │  ⑤ 组装条目，写入 createdAt/updatedAt
   │  ⑥ 按 id 替换或追加
   │  ⑦ writeJson features.json
   │  ⑧ touchMeta 更新项目时间
   │  ⑨ 返回新条目
   ▼
client: 用返回值替换/追加到 project.features，关闭弹窗
```

### 4.2 删除功能

1. 前端 `window.confirm('删除这条功能记录？')`；
2. 确认后 `features.delete`；
3. 后端按 id 过滤并写回；
4. 返回剩余数组，前端整体覆盖 `project.features`。

### 4.3 导出

`docs.export` → `renderFeatures(meta, features)`：

1. 按 `FEATURE_STATUS` 顺序分组（构思 → 规划中 → 实现中 → 已完成）；
2. 每组输出二级标题与列表；
3. 每条带优先级标记与说明。

## 5. 接口

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `features.list` | `{path}` | `{features}` | 单独取列表 |
| `features.save` | `{path, feature}` | `{feature}` | 无 id 即新增 |
| `features.delete` | `{path, id}` | `{features}` | 返回剩余列表 |

## 6. 前端组件

| 组件 | props | 内部状态 | 职责 |
| --- | --- | --- | --- |
| `FeaturesTab` | `{project, setProject, schema, setError}` | `editing` | 列表、新增、编辑、删除 |
| `FeatureEditor` | `{value, onSave, onCancel}` | 表单草稿 | 六字段编辑 |

字段控件：名称与版本用 `TextInput`，说明与备注用 `Textarea`，状态与优先级用 `Select`（选项来自 `schema.statuses` / `schema.priorities`）。

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 名称为空 | 允许保存，列表显示空标题（建议后续加必填校验） |
| id 重复 | 按 id 替换，不会出现两条 |
| `features.json` 损坏 | `readJson` 回退 `{features:[]}` |
| `features` 不是数组 | `listFeatures` 返回 `[]` |
| 并发编辑同一项目 | 后写覆盖先写（无锁） |
| 项目被删后保存 | `requireStudio` 抛「该目录不是「模组工坊」项目」 |

## 8. 现状与缺口

**已实现**：六字段 CRUD（名称、说明、状态、优先级、目标版本、备注）、状态四档带颜色、优先级三档、按状态分组导出、打开项目自动加载；`items` 字段记录关联物品 id，编辑器可编辑。

**已知缺口**：

- `items` 关联已存在，但未校验引用的物品 id 是否存在，也没有从功能跳到物品的入口；
- 无「功能 ↔ 素材」关联；
- 无排序（固定按更新时间倒序）；
- 无筛选与搜索；
- 无批量操作；
- 名称未做必填校验；
- 无「实现进度百分比」之类的汇总统计（右侧栏只统计 `done` 数量）。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理（需要 `project.path`） |
| 下游 | 08 文档导出（`renderFeatures`） |
| 展示 | 10 界面外壳（右侧栏统计功能数与已完成数） |
