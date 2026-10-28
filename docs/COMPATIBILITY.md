# 兼容性说明

> 适用版本：v0.1.2
> 更新日期：2026-10-28
> 插件版本与 Minecraft 适配版本相互独立；当前插件只适配 Minecraft 1.20.1。
> 版本规则见 [VERSION-PLAN.md](VERSION-PLAN.md)。

## 1. 支持范围

| 维度 | 支持值 | 说明 |
| --- | --- | --- |
| Minecraft | **1.20.1** | 当前唯一适配版本；后续版本逐步适配，路线见 [PLAN.md](PLAN.md) 第 2 节 |
| Forge | 47.x | `net.minecraftforge:forge:1.20.1-47.x.x` |
| NeoForge | 47.1.x | `net.neoforged:forge:1.20.1-47.1.x` |
| Fabric | Loader 0.15.x + Fabric API | Yarn 映射，`fabric-loom` |
| Java | 17 | 三种加载器在 1.20.1 均要求 Java 17 |

## 2. 加载器差异（设计时的注意事项）

| 主题 | Forge | NeoForge | Fabric |
| --- | --- | --- | --- |
| 注册方式 | `DeferredRegister` + `RegistryEvent` | 同 Forge（1.20.1） | `Registry.register` |
| 元数据文件 | `META-INF/mods.toml` | `META-INF/mods.toml` | `fabric.mod.json` |
| 构建插件 | ForgeGradle | ForgeGradle（1.20.1 分支） | Fabric Loom |
| 映射 | Mojang 官方映射 | Mojang 官方映射 | Yarn |
| 事件系统 | `@SubscribeEvent` / 事件总线 | 同 Forge（1.20.1） | Fabric API 回调 |
| 物品设置 | `new Item.Properties()` | `new Item.Properties()` | `new FabricItemSettings()` |

> 1.20.1 是 Forge 与 NeoForge 共同支持的版本，二者 API 高度相似，
> 但**依赖坐标、模组加载入口、部分事件包名不同**，请勿混用。

## 3. 插件侧兼容策略

- `mcVersion` 是项目级字段（默认 1.20.1），决定字段能力表与代码模板目录；
- `loader` 字段决定文档提示与代码生成模板：当前版本只影响展示与结构扫描，不生成文件；v0.3 起按加载器选择 Java 模板（见 [PLAN.md](PLAN.md)）；
- 导入工程时通过 `fabric.mod.json` / `mods.toml` / 构建脚本自动识别加载器；
- 物品属性中的 `loaderNotes` 字段用于记录跨加载器差异；
- 贴图与模型路径对三种加载器一致（`assets/<modid>/...`），可直接复用；
- 代码结构扫描只读取 `src/main/java` 下的 Java 文件，不依赖加载器；解析支持 Java 17 的类、记录、枚举、注解与方法声明。

## 4. 未覆盖的内容

- 方块状态（blockstate）与多方块模型的可视化编辑；
- 配方（recipe）与标签（tag）文件生成；
- 战利品表、进度、数据生成（datagen）；
- 代码生成与 gradle 构建（首版明确不做，交给 IDEA）。

## 5. 版本升级策略

- 数据格式带 `schemaVersion`，升级时在 `lib/meta.js` 中做迁移；
- 插件版本遵循语义化版本，破坏性变更写入 `CHANGELOG.md`；
- 未来若支持 1.20.1 之外的版本，`loader` 与 `minecraft` 字段需扩展为矩阵。
