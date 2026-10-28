# MC 模组项目文件结构（Minecraft 1.20.1）

> 适用版本：v0.1.1
> 更新日期：2026-10-28
> 本文描述一个标准模组工程里**代码放哪、素材放哪、元数据放哪**，作为插件写入文件时的依据。
> 版本规则见 [VERSION-PLAN.md](VERSION-PLAN.md)。
> 来源：Forge、Fabric 官方文档，以及 NeoForge 源码仓库（见第 7 节，附链接与访问日期）。
> **注意：NeoForge 官方文档站最低只到 1.20.4，没有 1.20.1 的页面**，1.20.1 的结论由源码分支佐证，见第 8 节。

## 1. 结论速览

| 内容 | 路径（相对工程根） | 说明 |
| --- | --- | --- |
| Java 源码 | `src/main/java/<包名>/` | 双端共用的模组代码 |
| 客户端专用代码 | `src/client/java/<包名>/` | 仅 Fabric（Loom 分源集）可选；Forge 系一般放 `client` 子包 |
| 资源根 | `src/main/resources/` | 打包进 JAR 的资源目录 |
| 模组元数据（Forge） | `src/main/resources/META-INF/mods.toml` | 必须在 `META-INF` 下 |
| 模组元数据（NeoForge 1.20.1） | `src/main/resources/META-INF/mods.toml` | 与 Forge 同名同位置，见第 8 节 |
| 模组元数据（NeoForge 1.20.4 官方文档） | `src/main/resources/META-INF/mods.toml` | 官方文档原文仍写 `mods.toml` |
| 模组元数据（Fabric） | `src/main/resources/fabric.mod.json` | 资源根下 |
| 客户端素材 | `src/main/resources/assets/<modid>/` | 贴图、模型、方块状态、语言、音效 |
| 服务端数据 | `src/main/resources/data/<modid>/` | 配方、战利品表、标签、进度 |
| 构建脚本 | `build.gradle` / `build.gradle.kts` | Gradle 构建 |
| 构建参数 | `gradle.properties` | 版本号、映射、JVM 参数 |
| 子工程声明 | `settings.gradle` | 多模块时使用 |
| Gradle 包装器 | `gradlew`、`gradlew.bat`、`gradle/wrapper/` | 保证构建版本一致 |

## 2. Forge / NeoForge 工程结构

```text
<工程根>/
├── build.gradle                 # 构建脚本（ForgeGradle / NeoGradle）
├── gradle.properties            # 版本与构建参数
├── settings.gradle
├── gradlew / gradlew.bat
├── gradle/wrapper/
├── src/
│   └── main/
│       ├── java/
│       │   └── com/example/examplemod/     # 包名：com.<域名>.<modid>
│       │       ├── ExampleMod.java         # @Mod 入口
│       │       ├── item/                   # 按功能分子包
│       │       ├── block/
│       │       └── client/                 # 仅客户端代码
│       └── resources/
│           ├── META-INF/
│           │   └── mods.toml               # 模组元数据（必需）
│           ├── pack.mcmeta                 # 作为资源包/数据包时的描述（可选）
│           ├── assets/
│           │   └── <modid>/
│           │       ├── lang/
│           │       │   ├── en_us.json
│           │       │   └── zh_cn.json
│           │       ├── textures/
│           │       │   ├── item/<id>.png
│           │       │   └── block/<id>.png
│           │       ├── models/
│           │       │   ├── item/<id>.json
│           │       │   └── block/<id>.json
│           │       ├── blockstates/<id>.json
│           │       └── sounds.json
│           └── data/
│               └── <modid>/
│                   ├── recipes/<id>.json
│                   ├── loot_tables/blocks/<id>.json
│                   ├── tags/items/<id>.json
│                   └── advancements/<id>.json
└── runs/                        # 运行目录（构建产物，勿提交）
```

要点（Forge 官方原文）：

- `mods.toml` **必须**放在所用源集资源目录下的 `META-INF` 中，主源集即 `src/main/resources/META-INF/mods.toml`；
- `assets` 目录是客户端资源包内容，可包含贴图、模型、音效、本地化等；
- `data` 目录是服务端数据包内容，可包含配方、战利品表、结构、标签、进度等；
- 包名建议使用自己拥有的顶级域名倒序 + modid（如 `com.example.examplemod`），避免与其他模组冲突。

## 3. Fabric 工程结构

```text
<工程根>/
├── build.gradle                 # Fabric Loom 构建脚本
├── gradle.properties            # minecraft_version / yarn_mappings / loader_version
├── settings.gradle
├── gradlew / gradlew.bat
├── gradle/wrapper/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/example/examplemod/
│   │   │       └── ExampleMod.java      # implements ModInitializer
│   │   └── resources/
│   │       ├── fabric.mod.json          # 模组元数据（必需）
│   │       ├── <modid>.mixins.json      # Mixin 配置（可选）
│   │       ├── assets/<modid>/...       # 同 Forge 的资源包结构
│   │       └── data/<modid>/...         # 同 Forge 的数据包结构
│   └── client/                          # 可选：Loom 分源集
│       ├── java/com/example/examplemod/client/
│       └── resources/
└── run/                         # 运行目录（构建产物，勿提交）
```

要点（Fabric 官方原文）：

- `fabric.mod.json` 放在 `src/main/resources`，描述 mod id、版本、入口点、依赖与 mixin；
- `src/main/resources` 存放资源（贴图、模型、音效），并承载 `fabric.mod.json` 与 mixin 配置；
- 素材结构镜像资源包，例如方块贴图位于 `assets/<modid>/textures/block/block.png`；
- `src/main/java` 为双端代码；`src/client/java` 与 `src/client/resources` 为客户端专用（较新 Loom 的分源集，1.20.1 模板默认不启用）。

## 4. 关键文件说明

| 文件 | 作用 | 关键字段 |
| --- | --- | --- |
| `mods.toml` | Forge / NeoForge 1.20.1 模组元数据（`META-INF/mods.toml`） | `modLoader`、`loaderVersion`、`[[mods]]` 下的 `modId` / `version` / `displayName`、`[[dependencies.<modid>]]` |
| `neoforge.mods.toml` | 较新 NeoForge 版本的元数据文件名 | 字段同上；**1.20.4 的官方文档仍写 `mods.toml`**，切换到该文件名的时间未在文档中说明，见第 8 节 |
| `fabric.mod.json` | Fabric 模组元数据 | `schemaVersion`、`id`、`version`、`name`、`environment`、`entrypoints`、`depends`、`mixins` |
| `build.gradle` | 构建脚本 | 加载器插件、依赖坐标、`java.toolchain` |
| `gradle.properties` | 构建参数 | `minecraft_version`、`forge_version` / `loader_version`、`mod_version`；NeoForge 用 `neo_version`、`mod_id`、`mod_group_id` |
| `pack.mcmeta` | 资源包/数据包描述 | `pack_format`、`description` |

## 5. 素材目录细则

### 5.1 客户端资源 `assets/<modid>/`

| 子路径 | 内容 | 示例 |
| --- | --- | --- |
| `textures/item/` | 物品贴图（16×16 PNG） | `textures/item/ruby.png` |
| `textures/block/` | 方块贴图 | `textures/block/ruby_block.png` |
| `models/item/` | 物品模型 JSON | `models/item/ruby.json` |
| `models/block/` | 方块模型 JSON | `models/block/ruby_block.json` |
| `blockstates/` | 方块状态映射 | `blockstates/ruby_block.json` |
| `lang/` | 语言文件 | `lang/zh_cn.json`、`lang/en_us.json` |
| `sounds/` | 音效文件 | `sounds/block/ruby_break.ogg` |
| `sounds.json` | 音效注册 | 资源根下 |
| `textures/gui/` | 界面贴图 | `textures/gui/ruby_gui.png` |

### 5.2 服务端数据 `data/<modid>/`

| 子路径 | 内容 |
| --- | --- |
| `recipes/` | 合成表（有序/无序/熔炉/切石机） |
| `loot_tables/blocks/` | 方块掉落表 |
| `loot_tables/entities/` | 实体掉落表 |
| `tags/items/`、`tags/blocks/` | 标签 |
| `advancements/` | 进度 |
| `worldgen/` | 世界生成（1.20.1 结构） |

> 命名空间 `<modid>` 必须与 `mods.toml` 的 `modId` / `fabric.mod.json` 的 `id` 一致，否则游戏找不到资源。

## 6. 本插件的文件落点

| 插件写入 | 位置 | 是否影响构建 |
| --- | --- | --- |
| 项目元数据 | `.mcstudio/project.json` | 否，构建时被忽略 |
| 工坊标记 | `.mcstudio/studio.json` | 否 |
| 构想清单 | `.mcstudio/features.json` | 否 |
| 物品属性 | `.mcstudio/items/<id>.json` | 否 |
| 摘要 | `.mcstudio/summary.json` | 否，派生数据 |
| 代码结构 | `.mcstudio/structure.json` | 否，派生数据 |
| 贴图 | 优先 `src/main/resources/assets/<modid>/textures/item/<id>.png` | 是（打进 JAR） |
| 模型 | 优先 `src/main/resources/assets/<modid>/models/item/<id>.json` | 是 |
| 导出文档 | `docs/*.md` | 否 |

素材根目录判定规则（`lib/assets.js` 的 `resolveAssetRoot`）：

1. 工程存在 `src/main/resources` → 使用标准路径 `src/main/resources/assets/<modid>/`；
2. 否则 → 回退到 `.mcstudio/assets/<modid>/`，等工程具备标准结构后再迁移。

## 7. 官方依据

| 来源 | 链接 | 访问日期 | 引用要点 |
| --- | --- | --- | --- |
| Forge 1.20.1 · The Mod Files | <https://docs.minecraftforge.net/en/1.20.1/gettingstarted/modfiles/> | 2026-10-22 | `mods.toml` 必须位于 `META-INF` 下，主源集为 `src/main/resources/META-INF/mods.toml`；`modId` 需匹配 `^[a-z][a-z0-9_]{1,63}$` |
| Forge 1.20.1 · Structuring Your Mod | <https://docs.minecraftforge.net/en/1.20.1/gettingstarted/structuring/> | 2026-10-22 | 顶级包应唯一（域名/邮箱倒序 + modid）；客户端代码建议独立 `client` 子包 |
| Forge 1.20.1 · Client Assets | <https://docs.minecraftforge.net/en/1.20.1/resources/client/> | 2026-10-22 | `assets` 目录是资源包内容，包含贴图、模型、音效、本地化 |
| Forge 1.20.1 · Server Data | <https://docs.minecraftforge.net/en/1.20.1/resources/server/> | 2026-10-22 | `data` 目录是数据包内容，包含配方、战利品表、标签、进度 |
| Fabric · Project Structure | <https://docs.fabricmc.net/1.20.4/develop/getting-started/project-structure> | 2026-10-22 | `src/main/resources` 存资源与 `fabric.mod.json`；素材镜像资源包结构；`src/main/java` 双端代码 |
| NeoForge · The Mod Files（1.20.4 版） | <https://docs.neoforged.net/docs/1.20.4/gettingstarted/modfiles> | 2026-10-22 | 原文：「The `mods.toml` file, located at `src/main/resources/META-INF/mods.toml`」；`gradle.properties` 使用 `minecraft_version` / `neo_version` / `mod_id` / `mod_group_id` |
| NeoForge · Structuring Your Mod（当前版） | <https://docs.neoforged.net/docs/gettingstarted/structuring> | 2026-10-22 | 顶级包需与 group id 一致；按功能（`block` / `item` / `entity`）或按逻辑（`feature.crafting_table`）分子包；客户端代码独立 `client` 子包 |
| NeoForge 源码 · 1.20.1 分支元数据 | <https://raw.githubusercontent.com/neoforged/NeoForge/1.20.1/src/main/resources/META-INF/mods.toml> | 2026-10-22 | 文件真实存在于 `META-INF/mods.toml`（内容为 NeoForge 自身作为模组的元数据，`modLoader="javafml"`） |

> 说明一：Fabric 官方文档站已不再提供 1.20.1 版本页面（保留 1.20.4 及以后），
> 但 `src/main/java` + `src/main/resources` + `assets/<modid>/` 的结构在 1.20.1 与 1.20.4 一致；
> 1.20.4 页面提到的 `src/client/java` 属于较新 Loom 的分源集特性，1.20.1 模板默认不启用。
>
> 说明二：NeoForge 官方文档站的版本选择器**最低只到 1.20.4**，没有 1.20.1 的页面；
> `/docs/1.20.1/...` 路径返回 404。因此 1.20.1 的结论改用源码分支佐证（见第 8 节）。

## 8. NeoForge 1.20.1 的核实结论

`docs.neoforged.net` 曾一度无法访问，开启代理后访问成功，但**站点本身没有 1.20.1 版本页**：

- 版本选择器最低版本为 **1.20.4**；
- `https://docs.neoforged.net/docs/1.20.1/gettingstarted/modfiles` 返回 **404**；
- 官方 MDK 镜像组织 `NeoForgeMDKs` 的仓库从 **1.20.4** 才开始有（1.20.1 无镜像）。

因此改用两类旁证：

| 待确认项 | 结论 | 依据 |
| --- | --- | --- |
| NeoForge 1.20.1 的元数据文件名与位置 | `src/main/resources/META-INF/mods.toml` | `neoforged/NeoForge` 仓库 **1.20.1 分支**该路径返回 HTTP 200，内容为 `modLoader="javafml"` / `loaderVersion="[24,]"` 的 TOML |
| NeoForge 1.20.4 是否已改名 | **未改名**，仍是 `mods.toml` | 1.20.4 官方文档原文写 `META-INF/mods.toml`；该页面 `neoforge.mods.toml` 出现 0 次 |
| 包结构与 Forge 是否不同 | 基本一致，且额外要求顶级包与 `group id` 一致 | NeoForge 当前版「Structuring Your Mod」原文：top-level package should also match your group id |
| `gradle.properties` 字段 | `minecraft_version`、`neo_version`、`mod_id`、`mod_name`、`mod_license`、`mod_version`、`mod_group_id` | NeoForge 文档「The Mod Files」字段表 |

关于 `neoforge.mods.toml`：这个名字在较新版本的 NeoForge 中存在（源码与文档站其他页面可见），
但**官方文档未说明从哪个版本开始切换**，本插件在 1.20.1 场景下始终按 `mods.toml` 处理。
若将来适配 1.20.6+，需要重新核实该版本的元数据文件名。

### 仍然存在的空白

- NeoForge 1.20.1 的 MDK 模板（`build.gradle` 的 NeoGradle 配置）没有官方页面，1.20.1 实际使用的是
  ForgeGradle 的 NeoForge 分支还是 NeoGradle，**未核实**；本插件不生成构建脚本，暂不影响功能。
- 若你后续需要精确的 1.20.1 NeoForge 构建脚本，建议直接取一份 1.20.1 的 MDK 压缩包对比。
