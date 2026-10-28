# 想法卡（Idea）模型

> 状态：目标设计，未实现
> 归属：[../PLAN.md](../PLAN.md) M1
> 最后更新：2026-10-29

## 1. 目的

把用户自然语言里的“我想做一个……”变成**可确认、可拆分、可验收**的结构化卡片。

想法卡不是聊天记录，也不是代码任务；它是用户与 AI 对“要做什么”的共同理解。

## 2. 数据字段

沿用 `features.json`，增加可选字段；旧记录不迁移也能读。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | `f_...`，沿用现有格式 |
| `name` | string | 是 | 一句话名称 |
| `goal` | string | 否 | 用户想实现什么；缺省时用 `description` |
| `loop` | string | 否 | 玩法循环：玩家做什么、得到什么反馈 |
| `description` | string | 否 | 详细说明，沿用旧字段 |
| `content` | array | 否 | 涉及的内容：`{kind:'item'|'block'|'recipe'|'lang'|'gui'|..., id?, note?}` |
| `systems` | string[] | 否 | 关联系统卡 id |
| `constraints` | object | 否 | 加载器、MC 版本、依赖、兼容性、性能 |
| `acceptance` | string[] | 否 | 可验证的验收条件 |
| `assumptions` | string[] | 否 | AI 的假设，必须让用户看到 |
| `openQuestions` | string[] | 否 | 未决问题；未清空前不进入实现 |
| `status` | enum | 是 | `draft` / `clarified` / `confirmed` / `implementing` / `verified` / `dropped` |
| `priority` | enum | 否 | 沿用 `high` / `medium` / `low` |
| `notes` | string | 否 | 备注 |
| `createdAt` / `updatedAt` | string | 否 | 时间 |

### 示例

```json
{
  "id": "f_lock_001",
  "name": "可上锁的门与可复制钥匙",
  "goal": "玩家可以给门/箱子装锁，用匹配的钥匙开关，并用复制台复制钥匙",
  "loop": "装锁 → 上锁 → 用钥匙解锁 → 复制钥匙 → 用撬棍拆锁",
  "content": [
    { "kind": "item", "id": "mechanical_lock" },
    { "kind": "item", "id": "mechanical_key" },
    { "kind": "block", "id": "key_duplicator" }
  ],
  "systems": ["lock-core", "key-binding", "duplicator"],
  "constraints": { "loader": "forge", "mcVersion": "1.20.1" },
  "acceptance": [
    "上锁后空手无法打开",
    "错误钥匙无法打开",
    "世界重启后钥匙仍匹配",
    "复制台只能复制已有 UUID 的钥匙"
  ],
  "assumptions": ["锁状态以服务端为准，客户端只读缓存"],
  "openQuestions": ["电子锁是否首版支持？"],
  "status": "clarified",
  "priority": "high"
}
```

## 3. 生命周期

```text
draft（用户原话）
  → clarified（AI 已解析，列出假设/未决问题）
  → confirmed（用户确认）
  → implementing（已拆任务）
  → verified（验收通过）
  → dropped（放弃）
```

规则：

- `draft` 允许模糊；
- `clarified` 必须有至少一条验收；
- `openQuestions` 未清空时不能进入 `implementing`，除非用户明确接受风险；
- `confirmed` 之后修改关键字段，需要重新确认；
- `verified` 必须有验收证据（检查结果或任务记录）。

## 4. AI 解析规则

AI 把用户原话解析为想法卡时：

1. 不直接写代码，不直接改工程；
2. 先列出“我理解的目标”和“我做的假设”；
3. 至少提一个可能的边界/风险；
4. 未决问题最多保留 3–5 个，不要把所有细节都变成问题；
5. 用户确认后再拆系统与任务。

插件不调用模型；解析由 DSH 会话中的 AI 完成，插件提供 schema、存储、确认状态和工具。

## 5. 界面

「想法」页：

- 左侧对话/输入，右侧想法卡列表；
- 卡片显示名称、状态、验收数量、未决问题数量；
- 展开后显示目标、玩法循环、内容、系统、假设、未决问题；
- `确认` / `标记待澄清` / `放弃` 三个动作；
- AI 修改后显示 diff，不静默覆盖用户编辑。

## 6. 接口与工具（示意）

```text
idea.list {status?}
idea.get {id}
idea.save {idea, requestId?}
idea.confirm {id, expectedRevision?}
idea.drop {id, reason?}
```

工具：`mcmods_idea`，列表只回 id/名称/状态；全文按需读取。

## 7. 验收

- 用户一句话能生成一张想法卡；
- 卡片必须包含验收条件与未决问题；
- 未确认的卡片不会生成任务；
- 旧 `features.json` 仍可读。
