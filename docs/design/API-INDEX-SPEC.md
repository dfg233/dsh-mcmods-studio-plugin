# API 索引规格（api-index）

> 状态：目标设计，未实现
> 归属：[../PLAN.md](../PLAN.md) M2 / v0.3.0
> 最后更新：2026-10-29

## 1. 目的

模型不能只靠初始 Gradle 项目的 `ExampleMod.java` 猜 API。`api-index` 从**项目实际依赖**中提取类、方法、字段签名，让 AI：

- 知道真实存在哪些类/方法；
- 不再编造不存在的方法名；
- 按任务只取相关签名，而不是读完整 Javadoc。

`api-index` 只回答“有什么签名”，不回答“推荐怎么用”。后者由模板/知识卡提供。

## 2. 事实优先级

```text
项目 classpath / 编译结果  >  官方 Javadoc/源码  >  官方文档  >  社区示例  >  模型记忆
```

- 签名以 classpath 为准；
- 用法以模板/知识卡为准；
- 最终以 `compileJava` 和检查为准；
- 官方文档是知识卡的来源之一，不是运行时必需。

## 3. 数据来源

### 3.1 项目文件

- `build.gradle` / `build.gradle.kts`；
- `settings.gradle` / `settings.gradle.kts`；
- `gradle.properties`；
- `gradle/wrapper/gradle-wrapper.properties`；
- `src/main/java`、`src/main/resources`。

从这些文件识别：加载器、MC 版本、映射、Java 版本、source set。

### 3.2 依赖 classpath

优先使用**项目真实编译 classpath**，因为它包含：

- Minecraft（官方映射）；
- Forge / NeoForge / Fabric Loader；
- Fabric API 模块；
- 项目声明的其他依赖。

两种获取方式：

| 方式 | 优点 | 风险 |
| --- | --- | --- |
| 静态扫描 Gradle 缓存 | 不执行项目构建脚本 | 缓存布局/版本解析可能不准 |
| 生成 Gradle init 脚本，导出 `compileClasspath` | 准确、与工程一致 | 会执行 Gradle 与构建脚本，需要用户开启 |

推荐：

- 默认静态扫描 + 声明版本；
- 用户可开启“精确索引”，运行只读 init 脚本：
  ```text
  gradlew -I mcmods-api-init.gradle mcmodsDumpClasspath --offline
  ```
- init 脚本只添加一个打印 classpath 的任务，不修改 `build.gradle`，不写项目文件。

### 3.3 可选增强

- 官方 Javadoc / 源码 jar：用于补充注释和泛型；
- 官方文档：整理成知识卡，不直接进 index；
- 项目现有代码：作为“本项目用法”的额外上下文。

## 4. 提取流程

```text
读构建文件
  → 识别 loader / mcVersion / mappings
  → 获取 classpath（静态或 Gradle 导出）
  → 列出 jar 内 class
  → 过滤包
  → 解析 public/protected 签名
  → 写入缓存
  → 返回索引摘要
```

### 4.1 过滤

默认只索引模组开发相关包：

```text
net.minecraft
net.minecraftforge
net.neoforged
net.fabricmc
com.mojang.blaze3d
com.mojang.math
```

排除：

```text
*.impl.*
*.internal.*
*.mixin.*
*.datagen.*（除非任务明确需要）
```

### 4.2 解析

- 用 JDK `javap` 或 classfile 解析器；
- 只保留 public/protected；不能只用 `javap -public`，否则会漏掉 `BlockEntity.saveAdditional` 这类 protected 重写点；
- 记录：类名、kind、修饰符、父类/接口、方法名、参数类型、返回类型、静态/抽象、泛型签名、是否 deprecated、`inheritedFrom`（继承方法）；
- 不记录方法体、常量池细节、私有字段；
- 大索引按包分片，按需加载；
- 嵌套类同时保留 `Outer$Inner` 与 `Outer.Inner` 两个查询键；
- 继承方法要么合并进子类（标注 `inheritedFrom`），要么提供 `api.get` 的父类跳转；不能静默缺失。

### 4.3 缓存

```text
$DSH_HOME/mcmods-studio/cache/api/
  <projectHash>-<classpathHash>/
    meta.json
    classes/<package>.json
```

- 不写进项目 `.mcstudio/`，避免大文件入库；
- `classpathHash` 由 jar 列表、大小、mtime、构建文件摘要组成；
- 构建文件或依赖变化时失效；
- 可安全删除，重建即可。

## 5. 输出格式

`meta.json`：

```json
{
  "schemaVersion": 1,
  "projectPath": "D:/MCmod/Lock",
  "loader": "forge",
  "loaderVersion": "47.4.16",
  "mcVersion": "1.20.1",
  "mappings": "parchment 2023.09.03-1.20.1",
  "javaVersion": "17",
  "source": "gradle-classpath",
  "classpathHash": "sha256:...",
  "generatedAt": "2026-10-29T...",
  "stats": { "jars": 42, "classes": 3800, "packages": 120 }
}
```

类条目：

```json
{
  "name": "net.minecraft.world.item.Item",
  "kind": "class",
  "modifiers": ["public"],
  "extends": "java.lang.Object",
  "implements": [],
  "methods": [
    {
      "name": "stacksTo",
      "params": ["int"],
      "returns": "Item.Properties",
      "static": false,
      "visibility": "public",
      "inheritedFrom": null
    }
  ],
  "fields": []
}
```

## 6. 查询接口

```text
api.status {}                     # 是否有索引、版本、统计、是否过期
api.refresh {force?}              # 重建索引（用户开启精确模式）
api.search {query, package?, kind?, limit?}
api.get {class}
api.context {taskId, budget?}     # 供 context.pack 使用
```

查询规则：

- 默认只回签名摘要，不回整类；
- `api.search` 按类名/方法名/包名匹配，最多 50 条；
- 任务上下文只放任务 `apiRefs` 和模板引用的类，最多 20 个类/4KB；
- 找不到时返回 `unknown`，不猜。

## 7. 与模板/任务/上下文的关系

```text
模板 manifest 声明 apiRefs: ["net.minecraft.world.item.Item", ...]
  → 任务上下文取这些类的签名
  → 模板说明告诉 AI 怎么用
  → 编译检查验证
```

- `apiRefs` 只指向依赖 classpath；项目自身类用 `codeRefs` 从 `structure.json` 取，不混入 API 索引；
- `api-index` 回答“签名存在”；
- 模板/知识卡回答“正确用法”；
- `compileJava` 回答“是否能编译”；
- 行为检查回答“是否真的对”。

没有 API 索引时，任务上下文必须标记 `apiUnknown: true`，AI 只能读项目现有代码或要求用户开启索引，不能假装知道。

## 8. 安全与边界

- 默认不执行项目构建脚本；
- 精确模式需用户显式开启，使用 `--offline`、超时、输出摘要；
- 不执行项目代码、不运行游戏；
- 不把 jar 复制进插件仓库；
- 不索引私有/内部实现；
- 不把整个索引塞进提示词。

## 9. 验收

- 对 Lock 工程，能索引 Forge/MC 的核心类；
- `BlockEntity.saveAdditional`、`MenuProvider.createMenu`、`Item$Properties` 能查到；
- AI 查询 `Item.Properties`、`BlockEntity`、`MenuProvider` 能拿到真实签名；
- 构建文件变化后索引失效并重建；
- 无 JDK/Gradle 时返回明确状态，不阻塞内容编辑；
- 任务上下文不超过预算。

## 10. 未决问题

1. 精确模式是否默认开启，还是首次建项目时询问？
2. 是否支持 source jar/Javadoc 作为可选增强？
3. 索引包白名单是否按 profile 配置？
4. 多加载器项目（同仓库多 source set）如何标记？
