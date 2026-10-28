# 扫描发现模块计划

> 模块编号：03
> 适用插件版本：v0.1.3
> 代码位置：`lib/import.js` 的 `scanCandidates`；`lib/meta.js` 的 `isStudioProject`、`readStudioMarker`；`client.js` 的 `ProjectTab` 扫描区
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 在指定根目录下找出「可能是模组工程或工坊项目」的子目录；
- 判断每个候选是否**已被本插件导入**（读 `studio.json` 标记）；
- 展示候选列表，按状态给出「导入」或「打开」按钮。

**不负责**：

- 真正执行导入（模块 04）；
- 扫描子目录的深层嵌套（只看根目录下一级）；
- 扫描根目录之外的位置（新建/导入支持任意目录，但批量扫描只扫根目录）。

## 2. 数据与文件

### 2.1 输入

| 输入 | 说明 |
| --- | --- |
| `root` | 扫描根目录，缺省取注册表的 `root`；不存在时抛「根目录不存在」 |
| 目录结构 | 只遍历一级子目录（`readdir withFileTypes`） |

### 2.2 命中条件（任一满足即成为候选）

| 条件 | 判定方式 |
| --- | --- |
| 工坊项目 | `<目录>/.mcstudio/project.json` 存在 |
| 有构建脚本 | `build.gradle` 或 `build.gradle.kts` 存在 |
| 有描述文件 | `fabric.mod.json` / `mods.toml` / `neoforge.mods.toml` 之一存在 |

### 2.3 候选结构

```json
{
  "path": "D:\\program\\demo",
  "name": "示例模组",
  "modid": "demomod",
  "loader": "neoforge",
  "kind": "studio | mod | gradle",
  "isStudio": true,
  "imported": true,
  "legacy": false,
  "projectId": "p_xxx",
  "importedAt": "2026-10-22T12:00:00.000Z"
}
```

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `kind` | 判定结果 | `studio` 工坊项目、`mod` 有描述文件、`gradle` 只有构建脚本 |
| `isStudio` | `project.json` 是否存在 | 是否已有工坊数据 |
| `imported` | **`studio.json` 是否存在**，或 `isStudio` | 「已导入」的唯一依据 |
| `legacy` | 有 `project.json` 但无 `studio.json` | 老项目，打开后自动补标记 |
| `projectId` / `importedAt` | 标记文件 | 用于展示导入时间 |

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 点「浏览…」 | `pickFolder()` | 系统目录选择器 | 回填根目录；取消则不变 |
| 点「开始扫描」 | `scan()` | `projects.scan` | 渲染候选列表 |
| 点「保存为默认根目录」 | `saveRoot()` | `registry.setRoot` → `refreshBoot` | 根目录持久化 |
| 点候选的「导入」 | 未导入项 | 有描述文件 → `ImportProjectModal`；已有工坊数据 → `projects.add` | 导入或直接打开 |
| 点候选的「打开」 | 已导入项 | `open(path)` | 进入项目 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| `projects.scan` | 遍历子目录 | 逐个判定命中条件 | 未命中的目录跳过 |
| 命中后 | 读 `studio.json` | `readStudioMarker` | 设置 `imported`/`legacy` |
| 读标记失败 | 文件损坏 | 返回 `null` | 视为未导入（除非有 `project.json`） |
| 导入成功后 | `refreshBoot()` | 重新拉注册表 | 该行自动变为「已导入」 |

### 3.3 前端兜底事件

| 场景 | 处理 |
| --- | --- |
| 旧版后端未返回 `imported` 字段 | `isImported()` 退回注册表路径比对（规范化小写 + 去尾斜杠） |
| 扫描结果为空 | 显示「该目录下没有发现模组工程或工坊项目。」 |

## 4. 运行过程

```text
用户点「开始扫描」
   │
   ▼
client: call('projects.scan', {root})
   │
   ▼
api: projects.scan
   │  ① readRegistry() 取默认 root（payload.root 优先）
   │  ② scanCandidates(root)
   ▼
project.js scanCandidates
   │  ③ expandPath + isDirectory 校验
   │  ④ readdir(withFileTypes) 只取目录
   │  ⑤ 对每个目录：
   │      · isStudioProject → 有 project.json
   │      · readStudioMarker → 有 studio.json
   │      · 检查 build.gradle(.kts)
   │      · detectDescriptor → 读描述文件拿 name/modid/loader
   │  ⑥ 三者皆无 → 跳过
   │  ⑦ 组装候选对象（imported = 有标记 || isStudio）
   │  ⑧ 按 name 用 zh-CN 排序
   ▼
client 渲染列表
   │  · 已导入：绿色「已导入」徽章 + 导入时间 + 「打开」
   │  · 未导入： 「导入」按钮
```

### 编号步骤（导入状态判定）

1. 取候选的 `path`；
2. 读 `<path>/.mcstudio/studio.json`；
3. 文件存在且可解析 → `imported = true`，记录 `projectId`、`importedAt`；
4. 文件不存在但 `<path>/.mcstudio/project.json` 存在 → `imported = true`、`legacy = true`；
5. 两者都不存在 → `imported = false`；
6. 前端只读 `candidate.imported`，不再依赖注册表。

## 5. 接口

| action | payload | 返回 |
| --- | --- | --- |
| `projects.scan` | `{root?}` | `{root, candidates[]}` |
| `registry.setRoot` | `{root}` | `{root}` |
| `projects.add` | `{path}` | `{path, meta}` |

## 6. 前端组件

| 组件 | 相关状态 | 职责 |
| --- | --- | --- |
| `ProjectTab` | `scanning`、`scanError`、`root` | 扫描输入区与结果列表 |
| `isImported(candidate)` | — | 读 `candidate.imported`，缺失时回退路径比对 |
| `addCandidate(candidate)` | — | `projects.add` → `refreshBoot` → `open` → 清空扫描结果 |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 根目录不存在 | 抛「根目录不存在：xxx」，前端显示在扫描区 |
| 根目录无子目录 | 返回空数组，显示空态文案 |
| 子目录无权限 | `readdir` 捕获后按空处理，不中断整体扫描 |
| 深层嵌套工程（如 `root/foo/bar`） | 扫不到（只遍历一级） |
| 同一目录重复出现 | 路径唯一，不会重复 |
| 符号链接目录 | `withFileTypes` 视其为目录，可能重复扫描到同一目标 |
| 候选目录被删于扫描后 | 点「导入/打开」时报「项目目录不存在」 |

## 8. 现状与缺口

**已实现**：一级目录扫描、三类命中判定、`studio.json` 判定已导入、老项目兼容、导入时间展示、扫描结果随导入自动刷新。

**已知缺口**：

- 只扫一级目录，嵌套工程需手动指定根目录；
- 无递归深度选项；
- 无「全部导入」批量操作；
- 无忽略列表（如 `build/`、`.gradle/` 这类目录若在根目录下会被当作候选判定，只是通常不命中）；
- 扫描结果不缓存，每次点击重新遍历。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础、02 项目管理（根目录来自注册表） |
| 下游 | 04 工程导入（点「导入」进入导入流程） |
| 数据依赖 | 02 的 `studio.json` 标记语义 |
