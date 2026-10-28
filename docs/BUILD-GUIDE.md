# 构建教程（Minecraft 1.20.1）

> 适用版本：v0.1.3
> 更新日期：2026-10-28
> 本插件负责**模组设计、属性文档、素材管理、代码结构索引与代码编写辅助**。
> v0.1.x 不生成也不编译 gradle 工程，请按下文在 IDEA 中完成实际构建；
> v0.3 起可生成带标记区块的 Java 注册代码与资源 JSON（见 [PLAN.md](PLAN.md)）。
> 当前仅支持 Minecraft **1.20.1**。
> 插件版本规则见 [VERSION-PLAN.md](VERSION-PLAN.md)。

## 一、准备环境

| 工具 | 版本要求 | 说明 |
| --- | --- | --- |
| JDK | **17**（1.20.1 必需） | Forge / NeoForge / Fabric 在 1.20.1 均要求 Java 17 |
| IntelliJ IDEA | Community 或 Ultimate | 推荐使用 IDEA，社区版即可 |
| Gradle | 无需全局安装 | 各 MDK 自带 `gradlew`，首次运行会下载对应版本 |
| 网络 | 可访问 Mojang / NeoForged / FabricMC maven | 国内建议配置代理或镜像 |

检查 JDK：

```bash
java -version
# 应输出 openjdk version "17.x"
```

IDEA 中需要把 **Project SDK** 设为 17（`File → Project Structure → SDK`），
Gradle 的 **Gradle JVM** 也设为 17（`Settings → Build Tools → Gradle → Gradle JVM`）。

## 二、选择加载器模板

1.20.1 有两条工程路线：

| 加载器 | 模板来源 | 说明 |
| --- | --- | --- |
| Forge | [MinecraftForge MDK](https://github.com/MinecraftForge/MinecraftForge/tree/1.20.1) | 官方 MDK，`build.gradle` 使用 ForgeGradle |
| NeoForge | [NeoForge 1.20.1 MDK](https://github.com/neoforged/NeoForge/tree/1.20.1) | 1.20.1 的 NeoForge 仍沿用 ForgeGradle 体系（47.1.x） |
| Fabric | [Fabric Example Mod](https://github.com/FabricMC/fabric-example-mod/tree/1.20) | 使用 Fabric Loom + Yarn 映射 |

> 1.20.1 的 NeoForge 与 Forge 共用大部分 API，但依赖坐标不同：
> Forge 为 `net.minecraftforge:forge`，NeoForge 为 `net.neoforged:forge`。
> 请勿混用两套依赖。

## 三、导入 IDEA 并构建

1. 解压 MDK 到你的项目目录（例如 `D:\program\my-mod`）。
2. IDEA → `Open` → 选择该目录，等待 Gradle 同步。
3. 首次同步会下载 Gradle 发行版与依赖，可能需要几分钟。
4. 同步完成后：
   - Forge / NeoForge：运行 `runClient` 任务启动开发客户端；
   - Fabric：运行 `runClient` 任务。
5. 打包：执行 `build` 任务，产物位于 `build/libs/`，形如 `mymod-1.0.0.jar`。

命令行等价操作：

```bash
cd D:\program\my-mod
gradlew build
```

Windows 下如提示找不到 `gradlew`，使用 `.\gradlew.bat build`。

## 四、目录对照

| 路径 | 用途 |
| --- | --- |
| `src/main/java/<包名>/` | Java 源码（注册物品、方块、事件） |
| `src/main/resources/META-INF/mods.toml` | Forge / NeoForge 模组元数据 |
| `src/main/resources/fabric.mod.json` | Fabric 模组元数据 |
| `src/main/resources/assets/<modid>/textures/item/` | 物品贴图（16×16 PNG） |
| `src/main/resources/assets/<modid>/models/item/` | 物品模型 JSON |
| `src/main/resources/data/<modid>/` | 配方、标签、战利品表 |

本插件导入工程时会读取上述结构，并在 `.mcstudio/` 下建立设计数据，
同时输出 `docs/mcstudio-snapshot.md` 快照。

## 五、常见问题

- **Gradle 下载卡住**：在 `gradle.properties` 中配置代理，或使用国内镜像；也可先用 IDEA 自带 Gradle 离线模式。
- **JDK 版本不匹配**：`Unsupported class file major version` 通常是 Gradle JVM 不是 17。
- **贴图不显示**：确认路径为 `assets/<modid>/textures/item/<id>.png`，且物品模型 `parent` 为 `minecraft:item/generated`。
- **注册名报错**：`modid` 与物品 `id` 都只能使用小写字母、数字、下划线。
- **Forge 与 NeoForge 依赖冲突**：一个工程只能选择其中一套依赖。

## 六、与本插件的配合

1. 在「项目」页新建或导入工程；
2. 在「构想」梳理玩法，在「物品」页填写属性；
3. 在「贴图与模型」页上传 16×16 PNG、编辑模型 JSON；
4. 点击「导出文档」，把 `docs/` 提交进 git；
5. 选中项目后刷新代码结构（HTTP 动作 `structure.refresh` 或工具 `mcmods_structure_refresh`），
   插件会生成 `.mcstudio/structure.json`，供 agent 查「注册代码在哪」；
6. 在 IDEA 中依据文档实现 Java 注册代码。

> 插件不修改 `src/main/java` 与 gradle 文件（结构扫描只读），因此可以安全地在设计阶段与编码阶段并行使用。
