# 系统卡（System）模型

> 状态：目标设计，未实现
> 归属：[../PLAN.md](../PLAN.md) M1
> 最后更新：2026-10-29

## 1. 目的

系统卡描述一个**职责边界**，不是一张类图。它回答：

- 这个系统负责什么、不负责什么；
- 哪些规则不能被破坏；
- 关键入口、资源、依赖在哪；
- 改它时要跑哪些检查。

系统卡的粒度：一个系统通常对应 3–10 个类；不要一个类一张卡，也不要整个模组一张卡。

## 2. 数据字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定标识，如 `lock-core` |
| `name` | string | 中文名 |
| `responsibility` | string | 负责什么 |
| `nonGoals` | string[] | 不负责什么 |
| `invariants` | string[] | 不能破坏的规则，尽量可验证 |
| `entryPoints` | array | `{kind:'class'|'method'|'registration', path?, name?, line?}` |
| `resources` | array | `{kind, path, required}`：贴图、模型、语言、配方、标签、声音、GUI |
| `dependsOn` | string[] | 依赖的系统 id |
| `checks` | string[] | 检查 id |
| `status` | enum | `planned` / `implementing` / `stable` / `deprecated` |
| `lastVerifiedAt` | string | 可选：上次核对代码/资源的时间 |
| `notes` | string | 备注 |

### 示例：Lock 的锁核心

```json
{
  "id": "lock-core",
  "name": "锁核心",
  "responsibility": "维护锁状态、钥匙匹配、门/大箱子坐标归一化",
  "nonGoals": ["不负责钥匙复制台 GUI", "不负责具体渲染模型"],
  "invariants": [
    "锁状态以服务端 LockLevelData 为准",
    "LockData 的 NBT 字段名不得改名",
    "未开启的锁不能被空手拆卸"
  ],
  "entryPoints": [
    { "kind": "class", "path": "src/main/java/com/dfg233/lock/item/AbstractLock.java" },
    { "kind": "class", "path": "src/main/java/com/dfg233/lock/data/LockLevelData.java" },
    { "kind": "class", "path": "src/main/java/com/dfg233/lock/Utils/LockUtils.java" }
  ],
  "resources": [
    { "kind": "lang", "path": "assets/lock/lang/zh_cn.json", "required": true },
    { "kind": "sound", "path": "assets/lock/sounds.json", "required": true }
  ],
  "dependsOn": ["key-binding"],
  "checks": ["server-authority", "nbt-roundtrip", "unlocked-pass-through"],
  "status": "stable"
}
```

## 3. Lock 的系统拆分

| 系统 | 职责 | 关键类 | 主要不变量 |
| --- | --- | --- | --- |
| 锁核心 | 状态、匹配、坐标归一 | `AbstractLock`、`MechanicalLock`、`LockData`、`LockLevelData`、`LockUtils` | 服务端权威；NBT 兼容；未上锁放行 |
| 钥匙绑定 | UUID/类型绑定 | `KeyItem`、`MechanicalKeyItem`、`KeyData` | 一把钥匙对应一个 `lockId` |
| 复制台 | 方块实体、槽位、合成 | `KeyDuplicatorBlock`、`KeyDuplicatorBlockEntity`、`KeyDuplicatorMenu`、`KeyDuplicatorScreen` | 模板不消耗；输出槽不可放；取出才消耗材料 |
| 网络同步 | 锁状态 S2C | `ModMessages`、`S2CSyncLockPacket`、`ClientLockCache` | 客户端只读；包注册与协议版本 |
| 交互事件 | 右键/破坏/放置/区块监听 | `ModEvents`、`ClientRenderEvents` | 未上锁不拦截；取消后不留半状态 |
| 资源与数据 | 配方、战利品、标签、语言、声音、模型 | `data/lock/*`、`assets/lock/*` | id 与资源路径一致 |
| 基础设施 | 注册顺序、配置、入口 | `Lock`、`Config`、`ModItems/Blocks/BlockEntities/Menus/Sounds/Tabs`、`mods.toml` | 注册顺序固定；客户端类不进服务端 |

## 4. 与其它对象的关系

```text
想法卡 1 ── * 系统卡 1 ── * 任务
                  │
                  ├── 关键类 / 注册项
                  ├── 资源
                  └── 检查
```

- 想法卡描述“要什么”，系统卡描述“由哪些边界承接”；
- 任务必须属于一个系统；
- 系统卡引用真实类/资源，不复制代码；
- 系统卡的 `invariants` 会进入任务上下文和检查。

## 5. 界面

「计划」页：

- 系统卡按依赖排列，不按包名；
- 卡片显示状态、任务数、未通过检查数；
- 点开显示职责、不变量、入口、资源、依赖；
- 可切换到“依赖视图”，但不做完整 UML。

## 6. 接口与工具（示意）

```text
system.list {status?, ideaId?}
system.get {id}
system.save {system, requestId?}
system.link {systemId, entryPoints?, resources?}
```

工具：`mcmods_plan`，列表只回 id/名称/状态/任务数。

## 7. 验收

- 一个 30 个类的项目能拆成 5–8 个系统；
- 每个系统至少一条可验证的不变量；
- 任务能唯一归属一个系统；
- 系统卡能链接到真实文件和资源。
