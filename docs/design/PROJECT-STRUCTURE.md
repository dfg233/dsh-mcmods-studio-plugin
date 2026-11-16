# 项目结构标准（Forge 1.20.1）

> 用途：v0.5.1 起，scaffold 生成与 agent 写代码都按本结构组织；`agent.validate` 按此检查。
> 基准：TutorialMod（仅作插件制作参考，不打包、不索引）。
> 关联：[V0.5.1-PLAN.md](../fix/V0.5.1-PLAN.md)

## 1. 包结构

```text
<mod_group_id>/
├── <ClassName>.java              # @Mod 主类：集中注册 + 事件
├── ModDataGenerator.java         # datagen 入口（GatherDataEvent）
├── block/
│   ├── ModBlocks.java            # DeferredRegister<Block> + registerBlock（自动 BlockItem）
│   └── custom/                   # 自定义 Block 子类
├── blockEntity/
│   ├── ModBlockEntities.java
│   └── custom/
├── entity/
│   ├── ModEntities.java
│   ├── custom/                   # 自定义实体
│   └── layer/ModModelLayers.java # 模型层
├── item/
│   ├── ModItems.java
│   ├── ModArmorMaterials.java / ModToolTiers.java / ModFoods.java
│   ├── ModCreativeModeTabs.java  # 独立创造栏
│   └── custom/                   # 自定义 Item
├── client/                       # ClientSetup（Sheets/渲染/键位）
├── renderer/                     # 实体/方块实体渲染器
├── datagen/                      # providers（blockstate/item model/loot/recipe/tag/lang/worldgen）
└── worldgen/                     # ConfiguredFeatures / PlacedFeatures / BiomeModifiers
```

## 2. 注册约定

1. 每个注册类持有 `DeferredRegister`，并提供 `register(IEventBus)`；
2. 主类构造器只做：
   ```java
   IEventBus modEventBus = FMLJavaModLoadingContext.get().getModEventBus();
   ModItems.register(modEventBus);
   ModBlocks.register(modEventBus);
   ModBlockEntities.register(modEventBus);
   ModEntities.register(modEventBus);
   ModCreativeModeTabs.register(modEventBus);
   ```
3. 方块统一走 `registerBlock(name, supplier)`，自动注册 `BlockItem`；
4. 物品统一 `ITEMS.register(id, supplier)`；自定义实现放 `custom/`；
5. 创造栏统一 `ModCreativeModeTabs`，`itemGroup.<tab>` 语言键，`displayItems` 收全量；不往原版标签注入。

## 3. 命名约定

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 注册字段 | `SCREAMING_SNAKE_CASE` | `ICE_ETHER_ORE` |
| 注册 id | 小写字母/数字/下划线 | `ice_ether_ore` |
| 类名 | PascalCase | `IceEtherBlock` |
| 资源文件 | 与注册 id 同名 | `assets/<modid>/blockstates/ice_ether_ore.json` |
| 语言键 | `block.<modid>.<id>` / `item.<modid>.<id>` / `itemGroup.<tab>` | — |
| WoodType | 必须带命名空间 | `new WoodType(MOD_ID + ":ice_ether", ...)` |
| 模型层 | `boat/<wood>`、`chest_boat/<wood>` | `new ModelLayerLocation(..., "boat/ice_ether")` |

## 4. 资源目录

```text
src/main/resources/
├── assets/<modid>/
│   ├── blockstates/ models/block/ models/item/
│   ├── textures/{block,item,entity,entity/signs,entity/signs/hanging,gui/hanging_signs,models/armor}
│   ├── lang/zh_cn.json en_us.json
│   └── sounds.json
├── data/<modid>/{recipes,loot_tables,worldgen,dimension,tags,forge/biome_modifier}
└── data/minecraft/tags/{blocks,items}
```

- **资源 JSON 由 datagen 生成**（`src/generated/resources`），`src/main/resources` 只放贴图/声音/手写不可生成项；
- datagen 通过 `runs.data` 执行：`gradlew runData`。

## 5. 风格检查（对应 v0.5.1 第 3 节 12 条）

- `error`：WoodType 无命名空间、模型层重复、注册 id 非法、BlockItem 缺失；
- `warn`：缺 datagen（`ModDataGenerator`/`runs.data`）、语言键缺失、资源目录缺失；
- `info`：建议命名/结构。

## 6. 不做什么

- 不手写可由 datagen 生成的 JSON；
- 不手动注册 sign/hanging sign 模型层（由 Forge 自动生成）；
- 不把教程模组作为运行时参考（只在插件开发阶段参考）。
