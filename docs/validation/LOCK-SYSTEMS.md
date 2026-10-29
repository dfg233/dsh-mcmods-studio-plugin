# Lock 系统卡样张

> 项目：`D:/MCmod/Lock`
> 用途：验证 [SYSTEM-MODEL.md](../design/SYSTEM-MODEL.md)
> 最后更新：2026-10-29

> 路径均相对于项目根；`status` 为样张判断，不是插件实测。

## 1. `lock-core` 锁核心

| 字段 | 内容 |
| --- | --- |
| 职责 | 维护锁状态、钥匙匹配、门/大箱子坐标归一化、锁的安装/拆卸 |
| 不负责 | 复制台 GUI、钥匙物品 NBT、网络包编码 |
| 关键类 | `item/AbstractLock.java`、`item/custom/lock/MechanicalLock.java`、`data/LockData.java`、`data/LockLevelData.java`、`Utils/LockUtils.java` |
| 不变量 | 服务端 `LockLevelData` 是状态源；门上半部分映射到下半部分；大箱子两半共享锁；`LockData` NBT 字段名不可改；未上锁时右键必须放行 |
| 资源 | `data/lock/tags/blocks/lockable.json` |
| 依赖 | `key-binding` |
| 检查 | `server-authority`、`nbt-roundtrip`、`unlocked-pass-through`、`door-chest-normalize` |

## 2. `key-binding` 钥匙绑定

| 字段 | 内容 |
| --- | --- |
| 职责 | 钥匙物品与 `lockId` / `keyType` 的绑定、读取、写入 |
| 不负责 | 锁的状态切换、复制台 |
| 关键类 | `item/custom/key/KeyItem.java`、`item/custom/key/MechanicalKeyItem.java`、`data/KeyData.java` |
| 不变量 | 一把钥匙只对应一个 `lockId`；`keyType` 必须与锁匹配；NBT 读写可往返 |
| 资源 | `assets/lock/models/item/mechanical_key.json`、`assets/lock/textures/item/mechanical_key.png` |
| 依赖 | 无 |
| 检查 | `nbt-roundtrip`、`key-type-match`、`wrong-key-rejected` |

## 3. `duplicator` 复制台

| 字段 | 内容 |
| --- | --- |
| 职责 | 方块实体、3 槽位、自动合成、菜单/屏幕、capability |
| 不负责 | 锁状态判定、网络同步协议 |
| 关键类 | `block/KeyDuplicatorBlock.java`、`block/entity/KeyDuplicatorBlockEntity.java`、`screen/KeyDuplicatorMenu.java`、`screen/KeyDuplicatorScreen.java`、`screen/ModMenuTypes.java` |
| 不变量 | 槽位索引 0=模板、1=材料、2=输出；输出槽不可放入；模板不消耗；从输出槽取出才消耗材料；菜单槽位与方块实体一致 |
| 资源 | `assets/lock/blockstates/key_duplicator.json`、`assets/lock/models/block/key_duplicator.json`、`assets/lock/textures/gui/container/key_duplicator.png`、`assets/lock/lang/*.json` |
| 依赖 | `key-binding`、`lock-core` |
| 检查 | `slot-index-match`、`template-not-consumed`、`material-consume-on-extract`、`menu-screen-pair` |

## 4. `network-sync` 网络同步

| 字段 | 内容 |
| --- | --- |
| 职责 | 把服务端锁状态同步到客户端缓存 |
| 不负责 | 锁业务判断、GUI |
| 关键类 | `network/ModMessages.java`、`network/S2CSyncLockPacket.java`、`client/ClientLockCache.java` |
| 不变量 | 只发 S2C；包必须注册且协议版本明确；客户端缓存只读；空 NBT 表示移除 |
| 资源 | 无 |
| 依赖 | `lock-core` |
| 检查 | `packet-registered`、`client-cache-readonly`、`protocol-version` |

## 5. `interaction-events` 交互事件

| 字段 | 内容 |
| --- | --- |
| 职责 | 右键、破坏、放置、区块监听、客户端渲染事件 |
| 不负责 | 锁数据的存储格式 |
| 关键类 | `event/ModEvents.java`、`event/ClientRenderEvents.java` |
| 不变量 | 未上锁时不拦截原版交互；锁定后拦截；取消事件后不能留下半状态；破坏时掉落锁并清理世界数据 |
| 资源 | `assets/lock/sounds.json` |
| 依赖 | `lock-core`、`network-sync`、`key-binding` |
| 检查 | `unlocked-pass-through`、`break-cleanup`、`place-merge-defense`、`client-server-separation` |

## 6. `resources-data` 资源与数据

| 字段 | 内容 |
| --- | --- |
| 职责 | 让内容在游戏中可见、可合成、可掉落、可本地化 |
| 不负责 | Java 行为 |
| 关键文件 | `assets/lock/lang/zh_cn.json`、`en_us.json`、`models/item/*`、`blockstates/*`、`textures/**`、`sounds.json`、`data/lock/recipes/*`、`loot_tables/blocks/*`、`tags/blocks/lockable.json`、`tags/items/crowbar_breakable.json` |
| 不变量 | 注册 id 与资源路径一致；语言键覆盖可见文本；标签覆盖门/箱子；配方产出与物品 id 一致 |
| 依赖 | `infrastructure` |
| 检查 | `resource-exists`、`lang-key`、`recipe-id`、`loot-table`、`tag-member` |

## 7. `infrastructure` 基础设施

| 字段 | 内容 |
| --- | --- |
| 职责 | 注册顺序、入口、配置、创造模式标签、声音、菜单类型 |
| 不负责 | 具体玩法 |
| 关键类 | `Lock.java`、`Config.java`、`item/ModItems.java`、`block/ModBlocks.java`、`block/entity/ModBlockEntities.java`、`screen/ModMenuTypes.java`、`sounds/ModSounds.java`、`item/ModCreativeModeTabs.java` |
| 不变量 | 注册顺序固定；客户端类不能进入 common/server 路径；`mods.toml` 的 modid/版本与代码一致 |
| 资源 | `META-INF/mods.toml`、`assets/lock/lang/*` |
| 依赖 | 无 |
| 检查 | `registration-order`、`client-server-separation`、`mods-toml`、`creative-tab` |

## 覆盖检查

- 31 个 Java 文件 → 7 个系统，未出现“一个类一张卡”；
- 每个系统至少有 3 条不变量/检查；
- 任务可唯一归属（例如“新增电子锁”属于 `lock-core`）；
- 资源与注册项都有路径；
- 未覆盖：`ClientRenderEvents` 的渲染细节、`DamagedLockItem` 的概率逻辑，后续可放进 `lock-core` 的备注或单独任务。
