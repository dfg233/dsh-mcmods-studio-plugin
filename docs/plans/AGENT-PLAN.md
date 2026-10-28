# Agent 结合与发展建议

> 文档编号：AGENT-PLAN
> 适用版本：v0.1.1
> 状态：**建议 1–6 与代码结构文档已实施，建议 7–9 待做**（2026-10-28 更新）
> 更新日期：2026-10-28
> 配套：[VERSION-PLAN.md](../VERSION-PLAN.md)（版本规则）、[PLAN.md](../PLAN.md)（宗旨与路线）、[STATUS.md](../STATUS.md)（实现状态）、[INDEX.md](../INDEX.md)（代码索引）
> 实施记录：[refactor/04-agent-modules.md](../refactor/04-agent-modules.md)、[refactor/05-tools-and-notices.md](../refactor/05-tools-and-notices.md)

## 0. 实施状态（2026-10-28）

| 建议 | 内容 | 状态 | 落地 |
| --- | --- | --- | --- |
| 1 | 注册为 agent 工具 | **已完成** | 21 个工具，DSH 原生 `mcmods_*`，见 `lib/tools.js`、`lib/tool-bridge.js` |
| 2 | `summary.json` 聚合 | **已完成** | `lib/summary.js`，写操作后自动刷新 |
| 3 | 紧凑 / 详细双表示 | **已完成** | `item_list`（约 300 字节 / 12 物品）与 `item_get`（19 字段带标签） |
| 4 | 字段知识外置 | **已完成** | `data/schema.json` + `scripts/gen-schema.mjs` + 一致性测试 |
| 5 | 校验器 | **已完成** | `lib/validate.js`，9 类检查，分级 error / warning |
| 6 | 导入提示 | **已完成** | `notices[]` 随导入与分析返回，界面已展示 |
| 附加 | 代码结构文档 | **已完成（v0.1.1）** | `lib/structure.js` + 4 个动作 + 4 个工具；按文件哈希增量，支持 agent 注解 |
| 7 | 关系可视化 | 待做 | 归入 v0.2，复用构想已有的 `items` 关联字段 |
| 8 | 编辑提效 | 待做 | 内联编辑与批量操作，归入 v0.2 |
| 9 | 文档双向同步 | 待做 | 后续版本 |

> 下文第 1 节保留立项时的背景描述，作为「为什么做这些」的依据；
> 当前实际状态以本节和 [STATUS.md](../STATUS.md) 为准。工具命名最终采用 `mcmods_` 前缀，
> 下文第 4.1 节保留立项时的 `mcsi_` 命名，仅作历史参考。

## 1. 背景

立项时插件是「只给用户用的界面」：28 个 HTTP 动作、5 个页签、右侧栏面板。
Agent 想使用它，只能自己写 `fetch` 脚本、解析 JSON、读 `.mcstudio/*.json`。

这与插件宗旨（见 [PLAN.md](../PLAN.md) 第 1 节）中「为 agent 提供项目上下文」的目标不匹配。

## 2. 现状诊断

### 2.1 实测数据

| 指标 | 现状 | 问题 |
| --- | --- | --- |
| `boot` 返回体积 | **7418 字节** | 其中 schema 3765、教程 2846，每次首屏都传 |
| 字段定义位置 | `lib/schema.js` 的 `ITEM_FIELDS` | Agent 要读源码才知道 19 个字段的含义 |
| 项目信息 | 分散在 `project.json`、`features.json`、`items/*.json` | Agent 查全貌需读 N+1 个文件 |
| 物品表示 | 完整 19 字段 JSON，单条约 400 字节 | 12 个物品就要 5000 字节，只为知道"有什么" |
| 接口暴露方式 | 仅 HTTP，面向浏览器 | Agent 需自建脚本，token 与出错率双高 |

### 2.2 五个具体问题

| # | 问题 | 后果 |
| --- | --- | --- |
| 1 | 只有 HTTP，没有 agent 原生工具 | 每次调用都要写代码，消耗 token 且不稳定 |
| 2 | 没有「项目全貌」聚合视图 | 必须逐文件读取，成本随项目规模线性增长 |
| 3 | 只有一种详细表示 | 探索阶段读大量无用字段 |
| 4 | 字段知识写在源码里 | Agent 每次都要重新理解，无法持久化 |
| 5 | 没有校验能力 | Agent 生成后无法自检，错误留给用户 |

## 3. 建议总览

| # | 建议 | 面向 | 优先级 |
| --- | --- | --- | --- |
| 1 | 注册原生工具，而非只暴露 HTTP | Agent | P0 |
| 2 | 维护 `summary.json` 单文件聚合 | Agent | P0 |
| 3 | 紧凑 / 详细双表示 | Agent | P1 |
| 4 | 字段知识抽成数据文件 | Agent | P1 |
| 5 | 提供校验器 | Agent | P1 |
| 6 | 导入经验沉淀为提示 | Agent | P3 |
| 7 | 关系可视化 | 用户 | P2 |
| 8 | 降低编辑操作成本 | 用户 | P2 |
| 9 | 文档导出双向同步 | 双方 | P3 |

## 4. 详细方案

### 4.1 建议 1：注册原生工具（P0）

**目标**：Agent 无需写脚本即可读写项目。

**方案**：在插件 Host 半注册工具，与 HTTP 动作共用同一套业务函数。

| 工具 | 参数 | 返回 | 替代的现状 |
| --- | --- | --- | --- |
| `mcmods_project_summary` | 无 | 项目全貌摘要（mounted 项目、计数、缺失概览） | 读 4–5 个文件 |
| `mcmods_item_list` | `{project?, type?, query?}` | 紧凑列表，每项 `id/名称/类型` | 读全部 `items/*.json` |
| `mcmods_item_get` | `{project?, id}` | 单物品完整属性，字段带中文名与单位 | 读 JSON 再对照 schema |
| `mcmods_item_save` | `{project?, item}` | 保存结果 + 校验告警 | 写 HTTP 脚本 |
| `mcmods_idea_list` / `mcmods_idea_save` | `{project?, ...}` | 构想清单操作 | 同上 |
| `mcmods_schema_get` | `{compact?}` | 字段定义；`compact` 只给 key + 类型 | 读 `lib/schema.js` |
| `mcmods_validate` | `{project?}` | 问题清单 | 无此能力（新增） |
| `mcmods_doc_export` | `{project?}` | 导出文件清单 | 写脚本 |

**约束**：

- 工具内部复用 `lib/entries.js` / `lib/meta.js` / `lib/assets.js` 的现有函数，不重复实现；
- 全部返回结构化数据，错误用中文说明原因与修复方向；
- 不传 `project` 时使用「当前打开项目」（与界面共享 `studioState` 的服务端对应物）。

**验收**：

- Agent 不写任何 `fetch` 代码，仅用工具完成「读项目 → 改一个物品 → 导出文档」；
- 完成同样任务，token 消耗比现状下降 50% 以上。

### 4.2 建议 2：`summary.json` 聚合（P0）

**目标**：一次读取掌握项目全局。

**方案**：`<项目>/.mcstudio/summary.json`，由插件在每次写操作后增量维护。

```json
{
  "schemaVersion": 1,
  "meta": { "name": "示例模组", "modid": "demomod", "loader": "neoforge", "minecraft": "1.20.1" },
  "counts": { "ideas": 8, "ideasDone": 3, "items": 12, "blocks": 5 },
  "items": [
    { "id": "ruby", "name": "红宝石", "type": "material", "texture": true, "model": true }
  ],
  "ideas": [
    { "id": "f_1", "name": "宝石挖掘", "status": "planning", "priority": "high" }
  ],
  "missing": { "ids": ["ruby_sword"], "count": 1 },
  "code": {
    "mode": "scan",
    "files": 14,
    "classes": 15,
    "methods": 38,
    "annotated": 0,
    "stale": 0,
    "registrations": { "items": [{ "id": "ruby", "file": "ModItems.java", "line": 15 }] }
  },
  "updatedAt": "2026-10-23T12:00:00.000Z"
}
```

**体积估算**：12 物品 + 8 构想约 **1.2 KB**，替代原来读 20 个文件（约 8 KB）。
`code` 只放注册点与计数，文件级明细留在 `structure.json`，避免摘要变大。

**维护时机**：`items.save/delete`、`features.save/delete`、`assets.upload/delete`、`project.open`、`project.import/reimport`、`structure.refresh/annotate` 之后重写。

**一致性**：`summary.json` 是派生数据，损坏或缺失时可由 `boot` 重建，不作为唯一事实来源。

### 4.3 建议 3：紧凑 / 详细双表示（P1）

同一数据两种输出，由参数切换：

| 模式 | 物品表示 | 用途 |
| --- | --- | --- |
| `compact`（默认） | `ruby 红宝石 material 64/0` | 探索、列举、比对 |
| `detail` | 完整 19 字段，带中文标签与单位 | 确认后精确读取 |

**效果**：12 个物品的列举从约 5000 字节降到约 300 字节。

### 4.4 建议 4：字段知识抽成数据文件（P1）

**现状**：`ITEM_FIELDS`（19 个字段的 label、type、min/max、unit、hint）硬编码在 `lib/project.js` 内。

**方案**：字段定义保留在 `lib/schema.js`（唯一来源），由 `scripts/gen-schema.mjs` 生成
`data/schema.json` 对外副本；工具 `mcmods_schema_get` 直接返回该副本。

**收益**：

| 方面 | 收益 |
| --- | --- |
| Agent | 可直接读该文件理解字段，不必读源码 |
| 工具 | `mcmods_schema_get` 返回字段定义，`compact` 只给 key 与类型 |
| 多版本 | 每个 MC 版本一份 schema，切换只需换文件 |
| 维护 | 改字段只动 `schema.js`，副本由脚本生成并由一致性测试守护 |

### 4.5 建议 5：校验器（P1）

Agent 生成内容后最需要的是「能不能用」的判断。

| 校验项 | 输出示例 |
| --- | --- |
| id 合法性 | `ruby-sword` 非法：只能包含小写字母、数字和下划线 |
| 数值越界 | `maxStackSize=128` 超出范围 1–64 |
| 贴图缺失 | `ruby_sword` 缺少 `assets/demomod/textures/item/ruby_sword.png` |
| 模型引用 | `models/item/ruby.json` 引用了不存在的贴图 `demomod:item/nonexistent` |
| 语言键 | `item.demomod.ruby` 在 `zh_cn.json` 中缺失 |
| 类型冲突 | `ruby_block` 有 blockstate 但类型是 `item` |

**输出格式**：分级（error / warn）+ 修复建议，便于 agent 直接迭代。

### 4.6 建议 6：导入经验沉淀（P3）

已踩过的坑应变成 agent 可读的提示，而不是只写在代码注释里：

| 场景 | 提示 |
| --- | --- |
| 描述文件含 `${mod_version}` | 已用 `gradle.properties` 解析为 `2.1.0` |
| 1.20.1 的 Forge/NeoForge 共用 `mods.toml` | 已根据 `neo_version` 判定为 NeoForge |
| 语言文件名 | `zh_cn`、`en_us` 是语言代码，不作为物品 id |
| 其他命名空间 | 检测到 `othermod`，已跳过 |

**落地方式**：`project.import` 的返回里增加 `notices[]` 字段，工具与界面共用。

### 4.7 建议 7：关系可视化（P2）

用户侧当前缺「信息之间的关系」。建议三类视图：

| 视图 | 内容 | 复用 |
| --- | --- | --- |
| 依赖图 | 构想 → 物品 → 贴图/模型 → 配方 | 复用画布的拖拽与排布 |
| 缺失面板 | 一屏列出所有缺贴图、缺模型、引用错误 | 复用 `listAssets` 的 `missing` |
| 时间线 | 最近改动按时间倒序 | 读各条目的 `updatedAt` |

### 4.8 建议 8：降低编辑成本（P2）

| 现状 | 建议 |
| --- | --- |
| 改属性要开弹窗逐项填 | 列表内联编辑；批量选中改同一字段 |
| 新增物品手填 id | 从贴图文件名自动推断 |
| 贴图一张张传 | 拖拽整个目录，按文件名匹配 id |
| 无撤销 | 编辑历史栈（P2 已有规划） |

### 4.9 建议 9：文档双向同步（P3）

当前只能导出。建议支持回读：用户或 agent 修改了导出的 `ITEMS.md` 后，插件能识别并同步回 `.mcstudio/`，冲突时提示。

**风险**：Markdown 结构易被手工破坏，需要严格的格式约定与回滚能力，因此优先级最低。

## 5. 优先级与路线

| 阶段 | 内容 | 理由 |
| --- | --- | --- |
| **第一阶段** | 建议 1 + 建议 2 | 直接解决 agent 接入与 token 消耗；改动集中在 Host 层，风险低 |
| **第二阶段** | 建议 3 + 4 + 5 | 建立在前两者之上，边际成本小，质量收益明显 |
| **第三阶段** | 建议 7 + 8 | 用户侧体验，工作量大 |
| **第四阶段** | 建议 6 + 9 | 锦上添花 |

### 5.1 与版本路线的关系（重要）

立项时 [PLAN.md](../PLAN.md) 的 v0.2 曾是「代码工作区 + 代码生成」，走「替用户写代码」的路子。
在确立「上下文优先于生成」后，v0.2 调整为关系视图与编辑效率，代码工作区顺延到 v0.3；
路线选择本身不受影响：

| 路线 | 前提 | 插件职责 |
| --- | --- | --- |
| A. 插件生成代码 | 用户主要靠界面 | 内置模板，一键生成 |
| B. Agent 写代码 | Agent 能力足够 | 提供准确上下文 + 校验，不内置模板 |
| C. 混合 | 两者都有 | 插件提供生成能力，但以工具形式暴露，由 agent 调用 |

**建议采用路线 C**：

- 保留代码生成的**能力**，但从「内置模板 + 界面按钮」改为「工具 + 数据」；
- Agent 调用工具完成生成，用户可以手动触发同样的工具；
- 生成逻辑仍是唯一实现，不重复维护两套。

**因此 v0.2 应调整为**：先做工具化与 summary（本文件第一阶段），再决定代码生成的形态。

## 6. 预期收益

| 指标 | 现在 | 目标 |
| --- | --- | --- |
| Agent 使用成本 | 每次自写脚本 | 直接调用工具 |
| 掌握项目全貌 | 读 N+1 个文件（约 8 KB） | 读 1 个文件（约 1.2 KB） |
| 列举物品 | 约 5000 字节 | 约 300 字节 |
| 字段理解 | 读源码 | 读 schema 或调工具 |
| 错误发现 | 用户手工检查 | 校验器自动报告 |

## 7. 风险

| 风险 | 应对 |
| --- | --- |
| 工具与 HTTP 动作重复实现 | 二者共用 `lib/` 下的业务函数，工具只做参数适配 |
| `summary.json` 与真实数据不一致 | 视为派生数据，可随时由源数据重建；写入后立即刷新 |
| schema 外置导致读取开销 | 进程内缓存，文件变更时失效 |
| 工具数量过多增加认知负担 | 按「项目 / 条目 / 结构 / 校验 / 导出」五类划分，当前 21 个；工具说明面向用途而非实现 |
| 破坏既有 HTTP 接口 | 工具是新增能力，不改动已有动作；动作总数 37 |

## 8. 已确认事项（2026-10-28）

1. 工具命名前缀采用 `mcmods_`，由 `lib/tool-bridge.js` 统一添加；
2. `summary.json` 由 agent 与工具层使用，界面仍走原有动作，不额外读取摘要；
3. 第一阶段（工具化）已在 v0.1 完成，早于 v0.2，不再与 v0.2 合并；
4. 校验器保留为独立工具 `project_validate`，保存操作不附带全量校验告警；
5. 代码结构文档作为附加能力在 v0.1.1 落地，补齐「功能由哪些代码实现」的上下文。
