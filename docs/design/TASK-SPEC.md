# 任务包（Task）规格

> 状态：目标设计，未实现
> 归属：[../PLAN.md](../PLAN.md) M2
> 最后更新：2026-10-29

## 1. 目的

任务包是 AI 的**工作单**，也是插件的**验收依据**。

没有任务包，不允许 AI 直接改工程；没有验收证据，不允许把任务标为完成。

## 2. 字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | `t_...` |
| `title` | string | 是 | 一句话目标 |
| `ideaId` | string | 否 | 来源想法卡 |
| `systemId` | string | 是 | 所属系统 |
| `goal` | string | 是 | 这次做什么 |
| `nonGoals` | string[] | 否 | 这次不做什么 |
| `templateRefs` | array | 否 | `{id, version}` |
| `allowedPaths` | array | 是 | `{path, mode:"create"|"modify"}`；字符串简写等价于 `modify` |
| `guardPaths` | string[] | 否 | 只读保护路径；出现任何改动即失败 |
| `baseRevisions` | array | 否 | `{path, hash}`（源码默认 sha256）或 `{path, revision}`（业务数据），写入前核对并行编辑 |
| `baseStructureHash` | string | 否 | `structure-diff` 基线快照的哈希；需能解析到已保存快照，否则降级为 allowed-paths + 警告 |
| `contextRefs` | array | 否 | 需要喂给 AI 的类、资源、系统卡 |
| `apiRefs` | string[] | 否 | 需要从依赖 classpath API 索引取的类（最多 20 个），不含项目自身类 |
| `codeRefs` | string[] | 否 | 项目自身类 ID（structure 的类名/符号），渲染时解析到文件；不进入 API 索引 |
| `acceptance` | string[] | 是 | 可执行的验收条件 |
| `verify` | array | 是 | `{id, runner:"host"|"agent"|"manual", timeoutMs?, evidence?, baseline?}`；字符串简写等价于 host；不接受未注册 id |
| `status` | enum | 是 | `todo` / `doing` / `review` / `done` / `blocked` |
| `result` | object | 否 | 变更摘要、检查结果、回滚点 |
| `requestId` | string | 否 | 幂等 |
| `createdAt` / `updatedAt` | string | 否 | 时间 |

### 示例

```json
{
  "id": "t_electronic_lock_01",
  "title": "新增电子锁类型",
  "ideaId": "f_lock_001",
  "systemId": "lock-core",
  "goal": "在保持机械锁行为不变的前提下，新增 electronic_lock 类型",
  "nonGoals": ["不改复制台", "不改网络协议"],
  "templateRefs": [{ "id": "uuid-key-item", "version": 1 }],
  "allowedPaths": [
    "src/main/java/com/dfg233/lock/item/custom/lock/ElectronicLock.java",
    "src/main/java/com/dfg233/lock/item/AbstractLock.java",
    "src/main/java/com/dfg233/lock/item/ModItems.java",
    "src/main/resources/assets/lock/lang/*.json",
    "src/main/resources/assets/lock/models/item/electronic_lock.json",
    "src/main/resources/assets/lock/textures/item/electronic_lock.png"
  ],
  "contextRefs": [
    "system:lock-core",
    "class:AbstractLock",
    "class:LockData",
    "class:MechanicalLock",
    "resource:lang"
  ],
  "acceptance": [
    "机械锁行为不变",
    "电子钥匙与电子锁 UUID 匹配",
    "世界重启后仍能匹配",
    "未上锁时门仍可正常开关"
  ],
  "verify": ["allowed-paths", "resource-exists", "nbt-roundtrip", "compile-java", "structure-diff"],
  "status": "todo"
}
```

### 扩展写法

```json
{
  "allowedPaths": [
    { "path": "src/main/java/com/dfg233/lock/item/custom/lock/ElectronicLock.java", "mode": "create" },
    { "path": "src/main/java/com/dfg233/lock/item/AbstractLock.java", "mode": "modify" }
  ],
  "guardPaths": [
    "src/main/java/com/dfg233/lock/network/*"
  ],
  "baseRevisions": [
    { "path": "src/main/java/com/dfg233/lock/item/AbstractLock.java", "hash": "sha256:..." }
  ],
  "baseStructureHash": "sha256:...",
  "verify": [
    { "id": "allowed-paths", "runner": "host" },
    { "id": "structure-diff", "runner": "host" },
    { "id": "compile-java", "runner": "host", "timeoutMs": 120000 }
  ]
}
```

`guardPaths` 用于“必须读、但不许改”的文件；`allowedPaths` 只放可写路径。越界写入或 guard 路径变更直接失败。

## 3. 状态机

```text
todo → doing → review → done
        │        │
        └→ blocked ←┘
```

- `doing`：AI 可以改允许路径；
- `review`：等待检查/用户确认；
- `done`：所有 `verify` 通过，且有证据；
- `blocked`：缺上下文、检查失败、模板缺失/版本不兼容，或用户未决问题未清空。

## 4. 上下文包

`context.pack` 为任务生成最小上下文：

```json
{
  "task": {...},
  "system": {...},
  "templates": [...],
  "api": [{ "class": "net.minecraft.world.item.Item", "methods": ["..."] }],
  "classes": [{ "path": "...", "summary": "...", "excerpt": "..." }],
  "resources": [{ "path": "...", "kind": "lang|model|..." }],
  "invariants": ["..."],
  "allowedPaths": [{ "path": "...", "mode": "modify" }],
  "guardPaths": ["..."],
  "codeRefs": [{ "id": "class:...", "path": "..." }],
  "budget": { "files": 8, "bytes": 12000, "apiClasses": 20 }
}
```

预算建议：

- 最多 10 个文件、12KB、20 个 API 类（三个维度任一超限即裁剪）；
- 超过预算时只保留摘要，让 AI 用工具按需读取；
- 不把整个仓库、生成的 `structure.json`、历史日志塞进上下文。

## 5. 应用与回滚

```text
任务开始
  → 读取目标文件 revision
  → 生成变更集（模板/代码/资源）
  → 预览：新增/修改/跳过/越界
  → 备份
  → 应用
  → 检查
  → 成功：记录 result / 失败：回滚 + 报告
```

- 所有写入带 `requestId`；
- 已有文件必须带 `expectedRevision` 或内容哈希；
- 越界路径直接拒绝，不给“先改了再解释”的机会；
- 回滚只恢复本任务允许的文件，不碰其他改动。

### 5.1 执行策略（2026-10-29 确认）

1. **`guardPaths` 独立字段**
   - 只表示“必须存在且不得修改”；
   - 与 `allowedPaths` 冲突时任务无效；
   - 任何 guard 路径变化直接阻断。

2. **`manual` 证据**
   - `runner:"manual"` 必须填 `evidence`；
   - 证据可以是文本说明 + 可选文件路径（截图、测试报告、日志）；
   - 不强制截图；没有证据不能把任务标为 `done`。

3. **`structure-diff` 阻断/警告**
   - 阻断：guard 路径变化、未声明的新增/删除文件、注册项/资源变化超出任务范围；
   - 警告：类顺序、行号偏移、派生文件（`summary.json`、`structure.json`）变化；
   - 任务开始时把 `structure.json` 快照存入 `$DSH_HOME/mcmods-studio/cache/structure/<hash>.json`；
   - `baseStructureHash` 找不到快照时，不做结构 diff，只跑 allowed/guard 检查并标记“未验证结构”。

4. **`codeRefs` 使用结构类 ID**
   - 用 `structure.json` 的类名/符号，不直接写文件路径；
   - 上下文打包时解析到路径与行号；
   - 引用不存在的类 → 任务 `blocked`；
   - 新建类不放进 `codeRefs`，由模板/任务声明。

## 6. 验收与证据

`verify` 支持：

- `allowed-paths`：只改了允许路径；
- `guard-paths`：`guardPaths` 无改动；
- `structure-diff`：相对 `baseStructureHash` 只出现预期变化；
- `resource-exists`：模型/贴图/语言/声音/标签存在；
- `registration-pair`：方块+方块实体+物品、菜单+屏幕、包+注册；
- `nbt-roundtrip`：写入/读取一致；
- `compile-java`：`gradlew compileJava`（用户开启、超时、输出摘要）；
- `custom`：任务自定义命令或检查。

检查结果写入 `result.checks`，包含 id、runner、退出码/证据、摘要；`manual` 必须有 evidence；没有证据不能标 `done`。

## 7. 界面

「计划」页任务板：

- 列：待做 / 进行中 / 待验证 / 完成 / 阻塞；
- 卡片显示系统、目标、验收进度、越界警告；
- 点开显示上下文包、允许路径、检查结果、回滚按钮；
- 用户可手动改状态，但 `done` 需要检查通过。

## 8. 接口与工具（示意）

```text
task.list {status?, systemId?}
task.get {id}
task.save {task, requestId?}
task.start {id}
task.verify {id}
task.apply {id, changes, requestId}
task.rollback {id}
context.pack {taskId, budget?}
```

工具：`mcmods_task`、`mcmods_context`。

## 9. 验收

- 一个任务能独立交给 AI，不需要额外解释；
- AI 只改允许路径；
- 检查失败能回滚；
- 任务完成后能追溯想法、系统、模板和证据。
