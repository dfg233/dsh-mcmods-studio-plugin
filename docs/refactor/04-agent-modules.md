# 重构日志 04：Agent 接入结构

> **历史存档（2026-10-28 标注）**：本文记录 2026-10-24 的重构状态，文中版本号、工具数与动作数为当时结果，不随当前版本回改。当前版本见 [VERSION-PLAN.md](../VERSION-PLAN.md)，当前能力见 [STATUS.md](../STATUS.md)。

> 阶段：重构计划 阶段 4
> 日期：2026-10-24
> 状态：已完成并验证
> 影响范围：新增 4 个模块、1 个数据文件、1 个生成脚本、2 个测试文件

## 1. 目的

依据 [AGENT-PLAN](../plans/AGENT-PLAN.md) 第一与第二阶段：让 agent 不必自写脚本、
不必逐文件解析，就能准确读写项目，并能自检结果。

## 2. 新增文件

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `lib/summary.js` | 108 | 维护 `.mcstudio/summary.json` 项目摘要 |
| `lib/validate.js` | 175 | 项目校验：id、数值范围、素材缺失、模型引用、语言键 |
| `lib/tools.js` | 400 | 17 个 agent 工具的定义与调用入口 |
| `data/schema.json` | 7.4 KB | 字段定义的对外副本，供 agent 直接读取 |
| `scripts/gen-schema.mjs` | 44 | 从 `lib/schema.js` 生成上述 JSON |

## 3. 各模块设计

### 3.1 `lib/summary.js`：一次读取掌握全貌

摘要结构（12 物品 + 8 构想约 1.2 KB）：

```json
{
  "schemaVersion": 1,
  "meta": { "name": "...", "modid": "...", "version": "...", "loader": "...", "minecraft": "1.20.1" },
  "counts": { "ideas": 8, "ideasDone": 3, "items": 12, "blocks": 5, "totalEntries": 17 },
  "ideas": [{ "id": "f_1", "name": "宝石挖掘", "status": "planning", "priority": "high" }],
  "items": [{ "id": "ruby", "name": "红宝石", "type": "material", "texture": true, "model": true }],
  "missing": { "ids": ["ruby_sword"], "count": 1 },
  "updatedAt": "..."
}
```

设计要点：

- **只放最小字段**：物品只保留 id / 名称 / 类型 / 有无素材，不含 19 个属性；
- **派生数据**：损坏或缺失都能重建，不作为唯一事实来源；
- **自动刷新**：`api.js` 里标注 `summary: true` 的动作执行后自动重建；
- 重建失败不影响主操作（`catch(() => {})`）。

### 3.2 `lib/validate.js`：让 agent 能自检

校验项与分级：

| 检查 | 级别 | 说明 |
| --- | --- | --- |
| `item.id` | error | id 不符合 `^[a-z0-9_]{1,64}$` |
| `item.property` | error | 字段不是数字，或超出 min/max |
| `model.reference` | error | 模型引用了不存在的贴图 |
| `asset.texture` | warning | 缺少贴图 |
| `asset.model` | warning | 缺少模型 |
| `asset.blockstate` | warning | 方块缺 blockstate |
| `lang.missing` | warning | 缺中文语言条目 |
| `asset.orphan` | warning | 贴图或模型没有对应条目 |
| `item.type` | warning | 类型不在支持列表 |

输出 `{ ok, errors[], warnings[], checkedAt }`，每条含 `code` / `message` / `target`，
便于 agent 逐条修复。

**只读**：校验不修改任何文件。

### 3.3 `lib/tools.js`：17 个工具

| 分类 | 工具 |
| --- | --- |
| 项目 | `project_summary`、`project_list`、`project_create`、`project_import`、`project_analyze`、`project_scan` |
| 物品 | `item_list`、`item_get`、`item_save`、`item_delete` |
| 构想 | `idea_list`、`idea_save`、`idea_delete` |
| 素材 | `asset_list` |
| 质量 | `project_validate` |
| 输出 | `doc_export` |
| 元信息 | `schema_get` |

设计要点：

- **紧凑优先**：`item_list` 每项只回 `id` / `name` / `type`，12 个物品约 300 字节；
- **详情按需**：`item_get` 才返回 19 个字段，且每条带中文 `label` 与 `unit`；
- **默认项目**：不传 `project` 时自动取注册表里第一个可用项目；
- **复用业务函数**：直接调 `listItems` / `saveItem` 等，不经过 HTTP。

调用入口：`agent.call`，agent 只需记住一个动作名 + 工具名。

### 3.4 `data/schema.json`：字段知识外置

`lib/schema.js` 仍是**唯一代码来源**（同步、无 I/O 依赖），
`data/schema.json` 是它的副本，供 agent 与外部工具直接读取。

一致性由 `test/10-schema-sync.mjs` 守护：对比两者逐项相等，
并限制体积 < 12 KB。改动字段后运行 `npm run gen:schema` 刷新。

## 4. 新增接口

| action | payload | 返回 |
| --- | --- | --- |
| `agent.summary` | `{path}` | 摘要对象 |
| `agent.validate` | `{path}` | `{ok, errors[], warnings[], checkedAt}` |
| `agent.tools` | — | `{tools[], actions[]}` |
| `agent.call` | `{tool, args}` | 工具结果 |

动作总数 28 → **32**。

## 5. 新增测试

| 文件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `test/09-agent.mjs` | 19 | 工具清单、摘要、紧凑格式、筛选、校验、默认项目、错误路径 |
| `test/10-schema-sync.mjs` | 2 | schema 一致性、体积上限 |

关键用例：

- 紧凑格式体积断言（`< 400 字节`），防止未来把完整属性塞回列表；
- `schema_get` 紧凑模式体积小于完整模式的一半；
- 校验能报出缺贴图、缺模型、数值越界、模型引用错误；
- 保存时的越界值会被夹紧，而**盘上被手工改坏**的值会被校验捕获（两者行为不同，分别测）。

## 6. 实施中修正的问题

### 6.1 校验数值越界的测试前提有误

初版用例直接 `items.save` 一个 `maxStackSize: 999`，期望校验报错——但保存时
`coerceProperties` 已把它夹紧到 64，校验看到的是合法值。

**这不是缺陷，是设计**：写入时兜底、读取时校验。测试改为直接改写盘上 JSON
模拟外部误改，并另加一条用例验证「保存时夹紧」，两个行为都覆盖到。

### 6.2 `rebuildSummary` 中的重复判断

初版 `hasTexture` 写了两遍相同的 `some()` 调用，属于复制粘贴笔误，已修正。

## 7. 验证

| 项目 | 结果 |
| --- | --- |
| 语法 | 全部 `node --check` 通过 |
| 完整测试 | **10 个用例文件全部通过**（75 → 98 项） |
| 运行时 | 重装后 `agent.tools` 返回 17 个工具、32 个动作 |
| schema 体积 | 7.4 KB（上限 12 KB） |

## 8. 未改动的内容

- `client.js`：本次未触碰（界面尚不消费 summary / validate，属于计划外）；
- 既有 28 个动作的参数与返回：完全保持；
- `lib/assets.js`、`lib/docs.js`、`lib/gradle.js`、`lib/registry.js`：未改动。

## 9. 回滚

```bash
BK="/d/program/_refactor-backup/pre-stage34-20261024-171805"
cp "$BK/lib/api.js" lib/
rm -f lib/summary.js lib/validate.js lib/tools.js data/schema.json scripts/gen-schema.mjs
rm -f test/09-agent.mjs test/10-schema-sync.mjs
npm test
```

## 10. 与 AGENT-PLAN 的完成度

| AGENT-PLAN 建议 | 状态 |
| --- | --- |
| 建议 1：注册原生工具 | **部分完成**——17 个工具已实现并通过 `agent.call` 暴露；尚未注册为 DSH 原生 tool（需改 `index.js` 与验证宿主 API，属另一阶段） |
| 建议 2：`summary.json` 聚合 | 完成 |
| 建议 3：紧凑 / 详细双表示 | 完成（`item_list` / `item_get`） |
| 建议 4：字段知识外置 | 完成（`data/schema.json` + 同步测试） |
| 建议 5：校验器 | 完成（9 类检查） |
| 建议 6：导入提示 | 未做（`notices[]` 属于 P3） |
| 建议 7–9 | 未做（用户侧与双向同步，属 P2/P3） |

## 11. 后续建议

1. **注册 DSH 原生 tool**：把 `TOOLS` 接到 `ctx.tools.register`，agent 可直接调用而不必走 `agent.call`；
2. **界面消费 summary / validate**：物品页显示校验问题，项目页显示摘要统计；
3. **导入提示**：`project.import` 返回 `notices[]`，把占位符解析、加载器判定等结论带给 agent。
