# 代码工作区模块计划

> 模块编号：11
> 适用插件版本：v0.1.3
> 代码位置：规划中，拟新增 `lib/files.js`、`lib/codegen.js`、`lib/codegen/templates/`、`client.js` 的「代码」页签
> 状态：**未实现（规划）**
> 目标版本：**v0.3.0**（v0.2 让位于 Agent 接入，见 [AGENT-PLAN.md](AGENT-PLAN.md)）
> 最后更新：2026-10-28

## 0. 与宗旨的关系

按 [../PLAN.md](../PLAN.md) 第 0 节的宗旨「上下文优先于生成」，本模块的实现形态随之调整：

- 代码生成**以工具形式暴露**，界面按钮与 agent 调用走同一实现，不维护两套模板逻辑；
- 生成前仍需 `summary.json` 与 schema 就位，否则 agent 无法判断「已有什么、缺什么」；
- Agent 接入已在 v0.1 完成（21 个工具、摘要、校验、结构文档），v0.2 转向关系视图与编辑效率，
  因此本模块顺延到 v0.3；代码结构文档（`structure.json`）已为生成提供「现有注册点」上下文。

## 1. 模块职责

**负责**：

- 在插件内浏览与编辑工程源码（文件树 + 文本编辑器）；
- 由工坊数据生成规范的 Java 注册代码与资源 JSON；
- 生成物用注释标记包裹，重复生成不覆盖手写代码。

**不负责**：

- 编译、运行、调试、反编译（交给 IDEA）；
- 语法高亮的高级特性（自动补全、跳转定义）；
- 版本控制操作（git 提交等）。

## 2. 数据与文件

### 2.1 拟新增文件

| 文件 | 职责 |
| --- | --- |
| `lib/files.js` | 文件树列举、文本读写、扩展名白名单、大小限制、路径校验 |
| `lib/codegen.js` | 模板渲染、标记区块替换、生成前预览 |
| `lib/codegen/templates/<mcVersion>/<loader>/` | 按「版本 + 加载器」组织的模板 |
| `lib/versions.js` | 版本能力表（支持的字段、加载器、模板目录）；v0.3 只覆盖 1.20.1，多版本能力表随 v1.0 扩展 |

### 2.2 允许编辑的文件类型

`java`、`json`、`toml`、`gradle`、`properties`、`mcmeta`、`md`、`txt`、`yml`、`kts`

**只读打开**（需二次确认才可保存）：`build.gradle`、`build.gradle.kts`、`gradle.properties`、`settings.gradle`

**忽略目录**：`build/`、`.gradle/`、`.git/`、`run/`、`runs/`、`.idea/`

### 2.3 生成物标记

```java
// <mcstudio:generated items>
public static final RegistryObject<Item> RUBY = ITEMS.register("ruby", () -> new Item(new Item.Properties()));
// </mcstudio:generated>
```

替换规则：只替换标记之间的内容；标记缺失时在文件末尾追加；标记外内容原样保留。

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 点「代码」页签 | 加载文件树 | `files.tree` | 左侧显示目录 |
| 点文件 | 打开 | `files.read` | 右侧载入文本 |
| 编辑内容 | `onChange` | 标记 dirty | 标签页出现圆点 |
| `Ctrl+S` | 保存 | `files.write` | 写盘、清 dirty |
| 点「生成代码」 | 预览 | `codegen.preview` | 列出将新增/修改/跳过的文件 |
| 确认生成 | 写入 | `codegen.apply` | 按标记替换，返回变更清单 |
| 点「刷新」 | 重读目录 | `files.tree` | 反映外部改动 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 打开文件 | 读取前比对 `mtime` | 记录快照 | 保存时用于冲突检测 |
| 保存时 `mtime` 变化 | 文件被外部改动 | 返回冲突 | 前端提示「覆盖 / 放弃 / 另存」 |
| 生成时目标文件不存在 | 新建 | 写入完整模板 | 新文件 |
| 生成时标记缺失 | 追加 | 在文件末尾插入标记区块 | 保留原有代码 |
| 生成时加载器未支持 | 中止 | 报错 | 不写任何文件 |

### 3.3 异常事件

| 场景 | 处理 |
| --- | --- |
| 路径越界（含 `..`） | `assertInside(projectPath, target)` 抛错 |
| 扩展名不在白名单 | 拒绝打开，提示用外部编辑器 |
| 文件 > 1MB | 拒绝打开，提示用外部编辑器 |
| 非 UTF-8 文件 | 读取失败，提示可能为二进制 |
| 生成冲突（标记重复） | 报错并要求人工处理，不自动合并 |

## 4. 运行过程

### 4.1 打开并保存文件

```text
点文件
   │
   ▼
client: call('files.read', { path, relative })
   │
   ▼
api: files.read
   │  ① requireStudio(path)
   │  ② target = resolve(projectPath, relative)
   │  ③ assertInside(projectPath, target)
   │  ④ 扩展名白名单 + 大小 ≤ 1MB
   │  ⑤ 读文本 + stat.mtimeMs
   │  ⑥ 返回 { text, mtime, encoding:'utf8' }
   ▼
编辑器载入，记录 mtime 快照
   │
   ▼  用户编辑后 Ctrl+S
client: call('files.write', { path, relative, text, expectedMtime })
   │
   ▼
api: files.write
   │  ① 同样的路径与白名单校验
   │  ② 读当前 mtime，与 expectedMtime 比对
   │  ③ 不一致 → 返回 { conflict:true, mtime }
   │  ④ 一致 → writeText 原子写
   │  ⑤ 返回 { mtime }
   ▼
前端清除 dirty；冲突时弹选择框
```

### 4.2 生成注册代码

```text
点「生成代码」
   │
   ▼
client: call('codegen.preview', { path })
   │
   ▼
codegen.js preview
   │  ① readProject → items / meta
   │  ② 读版本能力表（当前仅 1.20.1）
   │  ③ 选模板目录 templates/1.20.1/<loader>/
   │  ④ 渲染片段：物品注册、创造标签、资源 JSON
   │  ⑤ 对每个目标文件：读现有内容，定位标记
   │      · 无文件 → 动作 create
   │      · 有标记 → 动作 update（算出 diff 行数）
   │      · 无标记 → 动作 append
   │  ⑥ 返回 [{file, action, additions, preview}]
   ▼
前端展示预览列表
   │  用户确认
   ▼
client: call('codegen.apply', { path, files:[...] })
   │
   ▼
codegen.js apply
   │  ⑦ 逐个替换标记区间 / 追加 / 新建
   │  ⑧ 原子写
   │  ⑨ 返回 [{file, action, ok}]
   ▼
前端提示「已更新 N 个文件」
```

### 4.3 模板组织

```text
lib/codegen/templates/
└── 1.20.1/
    ├── forge/
    │   ├── ModItems.java.tpl
    │   ├── item_model.json.tpl
    │   └── lang_zh_cn.json.tpl
    ├── neoforge/
    └── fabric/
```

模板变量：`{{modid}}`、`{{package}}`、`{{className}}`、`{{items}}`（循环）、`{{mcVersion}}`。

## 5. 接口（规划）

| action | payload | 返回 |
| --- | --- | --- |
| `files.tree` | `{path}` | `{entries:[{name,relative,type,size}]}` |
| `files.read` | `{path, relative}` | `{text, mtime, encoding}` |
| `files.write` | `{path, relative, text, expectedMtime}` | `{mtime}` 或 `{conflict:true, mtime}` |
| `codegen.preview` | `{path}` | `{files:[{file, action, additions, preview}]}` |
| `codegen.apply` | `{path, files[]}` | `{results:[{file, action, ok}]}` |

## 6. 前端组件（规划）

| 组件 | props | 职责 |
| --- | --- | --- |
| `CodeTab` | `{project, setError}` | 文件树 + 编辑器布局 |
| `FileTree` | `{entries, onOpen, selected}` | 目录折叠、懒加载 |
| `CodeEditor` | `{text, onChange, dirty}` | 行号 + 等宽 + Tab 缩进 |
| `CodegenPreview` | `{files, onApply, onCancel}` | 变更清单与确认 |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 文件被外部删除后保存 | 返回冲突，提示另存 |
| 大工程（数千文件） | 懒加载目录，只列已展开层级 |
| 生成时缺少 `project.json` | 报错「请先打开项目」 |
| 加载器未知 | 报错「不支持的加载器」，不写文件 |
| 模板占位符未替换 | 生成后自检，发现 `{{` 残留则中止 |
| 标记嵌套 | 报错，要求人工修复 |
| 编码非 UTF-8 | 读取失败，不提供编辑 |

## 8. 现状与缺口

**已实现**：无。

**缺口（即本模块全部内容）**：

- 文件树与编辑器；
- 保存冲突检测；
- 代码生成与标记区块；
- 生成前预览；
- 版本能力表；
- 模板文件。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础（新增动作）、02 项目管理（读取 meta）、12 Agent 接入（工具形态暴露生成能力） |
| 数据来源 | 06 物品管理（`items/*.json` 是生成输入）、07 素材管理（模型 JSON 生成） |
| 复用 | 10 界面外壳（组件、样式、`call()`） |
| 约束 | [PROJECT-STRUCTURE.md](../PROJECT-STRUCTURE.md) 规定生成物的落点 |
| 路线 | [PLAN.md](../PLAN.md) v0.3.0 |
