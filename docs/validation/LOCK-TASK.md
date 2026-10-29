# Lock 任务包样张：新增电子锁

> 项目：`D:/MCmod/Lock`
> 用途：验证 [TASK-SPEC.md](../design/TASK-SPEC.md)
> 状态：`todo`（样张，不执行）

## 任务

```json
{
  "id": "t_lock_electronic_01",
  "title": "新增电子锁类型",
  "ideaId": "f_lock_core_001",
  "systemId": "lock-core",
  "goal": "在保持机械锁行为不变的前提下，新增 electronic_lock 类型，并让现有钥匙/交互流程识别它",
  "nonGoals": [
    "不改复制台 GUI",
    "不改网络协议",
    "不改 LockData 的 NBT 字段名"
  ],
  "templateRefs": [
    { "id": "lock-type", "version": 1 }
  ],
  "allowedPaths": [
    "src/main/java/com/dfg233/lock/item/custom/lock/ElectronicLock.java",
    "src/main/java/com/dfg233/lock/item/AbstractLock.java",
    "src/main/java/com/dfg233/lock/item/ModItems.java",
    "src/main/java/com/dfg233/lock/item/ModCreativeModeTabs.java",
    "src/main/resources/assets/lock/lang/zh_cn.json",
    "src/main/resources/assets/lock/lang/en_us.json",
    "src/main/resources/assets/lock/models/item/electronic_lock.json",
    "src/main/resources/assets/lock/textures/item/electronic_lock.png"
  ],
  "contextRefs": [
    "system:lock-core",
    "system:key-binding",
    "class:AbstractLock",
    "class:LockData",
    "class:MechanicalLock",
    "class:ModEvents",
    "resource:lang"
  ],
  "apiRefs": [
    "net.minecraft.world.item.Item",
    "net.minecraft.world.item.Item$Properties",
    "net.minecraft.world.InteractionResult",
    "net.minecraftforge.registries.DeferredRegister"
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
    "allowed-paths",
    "resource-exists",
    "nbt-roundtrip",
    "key-type-match",
    "compile-java",
    "structure-diff"
  ],
  "status": "todo"
}
```

## 上下文包预算

| 项 | 内容 | 预算 |
| --- | --- | --- |
| 系统卡 | `lock-core`、`key-binding` | 2 张 |
| 模板 | `lock-type` | 1 个 |
| 类 | `AbstractLock`、`LockData`、`MechanicalLock`、`ModEvents` | 4 个 |
| 资源 | `lang` 两个文件 | 2 个 |
| API | `Item`、`Item.Properties`、`InteractionResult`、`DeferredRegister` | 4 个类 / ≤4KB |

总计约 8 个文件，符合“最多 10 个文件”的预算。

## 验收检查说明

| 检查 | 作用 |
| --- | --- |
| `allowed-paths` | 只允许上述文件变更 |
| `resource-exists` | 模型/贴图/语言键存在 |
| `nbt-roundtrip` | `LockData` 新字段/旧字段可往返 |
| `key-type-match` | 电子钥匙不会打开机械锁，反之亦然 |
| `compile-java` | `gradlew compileJava` 成功 |
| `structure-diff` | 未修改 `network`、`screen`、`data` 等其他系统 |

## 验证时发现的缺口（已在规格中处理）

1. 模板清单里没有 `lock-type`，需要新增或把 `uuid-key-item` 扩展为“锁类型”；
2. `structure-diff` 不在现有检查清单里，需要补；
3. `apiRefs` 需要记录映射（Parchment）与版本，否则签名可能对不上；
4. `allowedPaths` 需要支持“只允许新增文件”与“禁止修改文件”两类规则；
5. 任务需要记录目标文件的 `expectedRevision`/内容哈希，避免覆盖作者并行编辑。
