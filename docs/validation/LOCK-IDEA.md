# Lock 想法卡样张

> 项目：`D:/MCmod/Lock`（Forge 1.20.1，Parchment 2023.09.03-1.20.1）
> 用途：验证 [IDEA-MODEL.md](../design/IDEA-MODEL.md)
> 状态：`clarified`（待作者确认假设与未决问题）

## 卡片

| 字段 | 内容 |
| --- | --- |
| `id` | `f_lock_core_001` |
| `name` | 可上锁的门/箱子与可复制钥匙 |
| `goal` | 玩家可以给门、大箱子装锁，用匹配的钥匙开关，并用复制台复制钥匙 |
| `loop` | 装锁 → 上锁 → 用钥匙解锁 → 复制钥匙 → 用撬棍拆锁 → 锁掉落回物品 |
| `description` | 锁是附加在现有方块上的系统，不是新方块；钥匙通过 UUID 与锁绑定；复制台复制已有 UUID 的钥匙 |
| `systems` | `lock-core`、`key-binding`、`duplicator`、`network-sync`、`interaction-events`、`resources-data`、`infrastructure` |
| `constraints` | Forge 1.20.1；Parchment；服务端权威；不改变门/箱子原方块 |
| `priority` | `high` |
| `status` | `clarified` |

### `content`

| kind | id | 状态 | 说明 |
| --- | --- | --- | --- |
| item | `mechanical_lock` | existing | 机械锁物品 |
| item | `damaged_lock` | existing | 损坏的锁 |
| item | `mechanical_key` | existing | 机械钥匙 |
| item | `crowbar` | existing | 撬棍 |
| block | `key_duplicator` | existing | 钥匙复制台 |
| gui | `key_duplicator` | existing | 复制台 GUI |
| sound | `lock_fail` | existing | 失败音效 |

> 新增内容会在任务里声明；想法卡不直接写代码。

### `acceptance`

1. 上锁后，空手/错误钥匙右键门或箱子不能打开；
2. 正确钥匙可以上锁/解锁，并播放对应音效；
3. 世界重启后，锁与钥匙的 UUID 仍匹配；
4. 大箱子的两半共享同一把锁；门的上半部分映射到下半部分；
5. 复制台只复制已有 UUID 的钥匙，模板槽不被消耗，取出成品才消耗材料；
6. 撬棍按规则拆卸锁，掉落带 NBT 的锁物品；
7. 机械锁原有行为不变。

### `assumptions`

- 锁状态以服务端 `LockLevelData` 为准，客户端 `ClientLockCache` 只读；
- 门/大箱子的坐标归一化由 `LockUtils.getActualLockPos` 负责；
- 锁物品的 NBT 字段 `isLocked / lockType / keyType / lockId / keyData` 是兼容边界。

### `openQuestions`

1. 电子锁是否首版支持？如果支持，钥匙类型是否复用 `keyType`？
2. 复制台是否需要消耗经验/能量？当前只看材料；
3. 损坏的锁是否在拆卸时按概率产生？
4. 是否需要为锁添加配置项（最大锁数量、复制成本）？

## AI 解析记录（示意）

```text
用户原话 → 目标/循环
  → 7 个系统
  → 7 条验收
  → 3 条假设
  → 4 个未决问题
```

未确认的假设不会进入任务。

## 验证结论

- 想法卡能容纳 Lock 的规模；
- `content` 需要区分 `existing` / `planned`，否则无法判断哪些是新增；
- `acceptance` 必须写到可操作的行为，不能只写“锁能用”；
- 7 个系统足以覆盖，不需要为每个类建卡。
