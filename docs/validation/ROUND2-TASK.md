# 第二轮任务包：用修正规格重填

> 项目：`D:/MCmod/Lock`
> 目的：用补强后的 [TASK-SPEC.md](../design/TASK-SPEC.md) 重填「新增电子锁」，确认方法是否成立
> 状态：`todo`（样张，不执行）
> 最后更新：2026-10-29

## 1. 任务 JSON

```json
{
  "id": "t_lock_electronic_02",
  "title": "新增电子锁类型",
  "ideaId": "f_lock_core_001",
  "systemId": "lock-core",
  "profileId": "forge-1.20.1",
  "goal": "在保持机械锁行为不变的前提下，新增 electronic_lock 类型，并接入现有注册、钥匙匹配和交互流程",
  "nonGoals": [
    "不改复制台 GUI",
    "不改网络协议",
    "不改 LockData 的 NBT 字段名",
    "不改机械锁行为"
  ],
  "templateRefs": [
    { "id": "lock-type", "version": 1 }
  ],
  "allowedPaths": [
    { "path": "src/main/java/com/dfg233/lock/item/custom/lock/ElectronicLock.java", "mode": "create" },
    { "path": "src/main/java/com/dfg233/lock/item/AbstractLock.java", "mode": "modify" },
    { "path": "src/main/java/com/dfg233/lock/item/ModItems.java", "mode": "modify" },
    { "path": "src/main/java/com/dfg233/lock/item/ModCreativeModeTabs.java", "mode": "modify" },
    { "path": "src/main/resources/assets/lock/lang/zh_cn.json", "mode": "modify" },
    { "path": "src/main/resources/assets/lock/lang/en_us.json", "mode": "modify" },
    { "path": "src/main/resources/assets/lock/models/item/electronic_lock.json", "mode": "create" },
    { "path": "src/main/resources/assets/lock/textures/item/electronic_lock.png", "mode": "create" }
  ],
  "guardPaths": [
    "src/main/java/com/dfg233/lock/network/*",
    "src/main/java/com/dfg233/lock/screen/*",
    "src/main/resources/data/lock/*"
  ],
  "baseRevisions": [
    { "path": "src/main/java/com/dfg233/lock/item/AbstractLock.java", "hash": "sha256:842dafd2a3b49cca4b83c7737ce6aef5be38e6ba2a5b05662b686bd198eb234e" },
    { "path": "src/main/java/com/dfg233/lock/item/ModItems.java", "hash": "sha256:2704d47a78b7560d3980ae45bd17beb4919c1f3742610169a7f76b5d7e45ea65" },
    { "path": "src/main/java/com/dfg233/lock/item/ModCreativeModeTabs.java", "hash": "sha256:43bb32a0d990825702e86772b2352ad406c8769971d30e5439d7a392027372fa" },
    { "path": "src/main/resources/assets/lock/lang/zh_cn.json", "hash": "sha256:29661d3be5924ed541403c4695e32a3bdcb11e0add9871859cce30676db3d0e8" },
    { "path": "src/main/resources/assets/lock/lang/en_us.json", "hash": "sha256:eeec6dd202d7328e28860241ed30579d19db15b02aaf568f57c4bd0145f0ca2d" }
  ],
  "baseStructureHash": "sha256:bfe92dfd6bda572fef2dcc1e9102eb156aa96316c4ed508069913808cd61b436",
  "contextRefs": [
    "system:lock-core",
    "system:key-binding",
    "class:AbstractLock",
    "class:LockData",
    "class:MechanicalLock",
    "class:ModEvents",
    "resource:lang"
  ],
  "codeRefs": [
    "class:AbstractLock",
    "class:LockData",
    "class:MechanicalLock",
    "class:ModEvents",
    "class:ModItems",
    "class:ModCreativeModeTabs"
  ],
  "apiRefs": [
    "net.minecraft.world.item.Item",
    "net.minecraft.world.item.Item$Properties",
    "net.minecraft.world.InteractionResult",
    "net.minecraftforge.registries.DeferredRegister",
    "net.minecraftforge.registries.RegistryObject"
  ],
  "acceptance": [
    "机械锁的现有行为不变",
    "电子锁与机械钥匙不能互相匹配",
    "电子锁与电子钥匙的 UUID 匹配成功",
    "世界重启后电子锁/钥匙仍匹配",
    "未上锁时门仍可正常开关",
    "错误钥匙不会打开电子锁"
  ],
  "verify": [
    { "id": "allowed-paths", "runner": "host" },
    { "id": "guard-paths", "runner": "host" },
    { "id": "resource-exists", "runner": "host" },
    { "id": "structure-diff", "runner": "host", "baseline": "baseStructureHash" },
    { "id": "compile-java", "runner": "host", "timeoutMs": 180000 },
    { "id": "key-type-match", "runner": "manual", "evidence": "游戏内或 GameTest 验证" },
    { "id": "nbt-roundtrip", "runner": "manual", "evidence": "保存/重载后检查 UUID" }
  ],
  "status": "todo"
}
```

## 2. 方法确认：这些字段够不够

### 2.1 `allowedPaths` 的 `mode`

- `create` / `modify` 能表达“新文件”和“改旧文件”；
- `readonly` 放在 `allowedPaths` 里语义别扭：它并不是“允许修改”，而是“禁止修改”。
- **结论**：拆成 `allowedPaths`（只写）与 `guardPaths`（只读、禁止修改）。
- 本轮样张已改用 `guardPaths`，确认更清晰。

### 2.2 `baseRevisions`

- Java 源码没有业务 revision，只有内容哈希；
- `hash: sha256:...` 可用，且能直接由插件计算；
- 新文件没有 base，天然跳过；
- **结论**：默认 `hash`，`revision` 仅用于有业务版本的数据（如物品/构想）。

### 2.3 `verify`

- `runner: host` 明确由插件执行；`manual` 明确要人工/游戏内验证；
- `compile-java` 需要超时（180s）；
- `structure-diff` 需要 `baseline`，否则不知道和谁比；
- `evidence` 让 `manual` 不变成“口头完成”；
- **结论**：保留对象写法，增加 `runner` 枚举（`host|agent|manual`）与 `evidence` 字段；`structure-diff` 必须带 baseline。

### 2.4 `apiRefs` 与 `codeRefs`

- `apiRefs` 指向 classpath 里的加载器/MC 类，适合 API 索引；
- 项目自己的类（`AbstractLock`、`LockData`）不属于 API 索引，放 `contextRefs` 会混；
- **结论**：新增 `codeRefs`，明确“项目符号”；`apiRefs` 只放依赖库类。

### 2.5 `baseStructureHash`

- `structure-diff` 需要知道“改动前结构”；
- 任务开始时的 `structure.json` 哈希可作为基线；
- **结论**：任务增加可选 `baseStructureHash`；没有基线时 `structure-diff` 退化为“只比允许路径”。

### 2.6 上下文预算

| 项 | 数量 |
| --- | --- |
| 代码文件 | 4 个类 |
| 资源文件 | 2 个语言文件 |
| 系统卡 | 2 张 |
| 模板 | 1 个 |
| API | 5 个类 |
| codeRefs | 6 个类 |

文件数约 6，API 5 个类，低于 10 文件 / 20 类预算；但 `codeRefs` 与 `contextRefs` 有重叠，实际打包要按 id 去重。

### 2.7 `templateRefs`

- `lock-type` v1 是**计划模板**，当前插件还没有；
- 任务能引用它，但执行前模板必须存在；
- **结论**：`templateRefs` 需要解析时校验模板是否存在/版本兼容，不存在则任务进入 `blocked`，不能假装渲染。

## 3. 方法确认结论

| 方法 | 结论 |
| --- | --- |
| 允许路径按 create/modify 区分 | 成立 |
| 只读保护改 `guardPaths` | 成立，已替换 `readonly` |
| 内容哈希做 base | 成立，源码无业务 revision |
| 检查区分 host/agent/manual | 成立，需加枚举与 evidence |
| `structure-diff` 带 baseline | 成立，需加 `baseStructureHash` |
| `apiRefs`/`codeRefs` 分离 | 成立，已补字段 |
| 模板缺失时阻塞任务 | 成立，不能静默跳过 |
| 预算按文件/API 双维度 | 成立，实际约 6 文件/5 API 类 |

## 4. 已确认策略（2026-10-29）

| 问题 | 决定 |
| --- | --- |
| `guardPaths` 独立还是塞回 `allowedPaths` | **独立字段**；与 allowed 冲突时任务无效 |
| `manual` 证据格式 | 文本说明 + 可选文件路径（截图/报告/日志）；不强制截图 |
| `structure-diff` 失败 | guard/越界/未声明文件 → 阻断；行号/顺序/派生文件 → 警告 |
| `codeRefs` 用 ID 还是路径 | 用 `structure` 类 ID，打包时解析路径；缺失类 → `blocked` |

补充：

- `baseStructureHash` 必须能解析到任务开始时保存的结构快照，否则退化为 allowed/guard 检查并标记“未验证结构”；
- 新建类不放进 `codeRefs`，由模板/任务声明。

> 本轮只重填任务包与确认字段，不改代码。
