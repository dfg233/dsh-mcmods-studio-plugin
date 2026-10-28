# 重构日志 02：整理 client.js

> **历史存档（2026-10-28 标注）**：本文记录 2026-10-24 的重构状态，文中版本号、工具数与动作数为当时结果，不随当前版本回改。当前版本见 [VERSION-PLAN.md](../VERSION-PLAN.md)，当前能力见 [STATUS.md](../STATUS.md)。

> 阶段：重构计划 阶段 2
> 日期：2026-10-24
> 状态：**部分完成**（分节索引已完成，组件拆分经评估后未执行）
> 影响范围：`client.js` 顶部注释与 `test/` 新增用例，运行时行为零变化

## 1. 目的

`client.js` 是 1946 行的单文件浏览器模块，包含 17 个组件与全部页面逻辑。
目标是让人能快速定位组件，而不是每改一处都通读全文。

计划中阶段 2 有两个动作：

| 动作 | 结果 |
| --- | --- |
| A. 保持单文件，按分节物理排序 + 统一索引 | **已执行** |
| B. 把最大的三个组件拆成子组件（`ItemsTab` → `ItemRow` / `CanvasView` / `ListView`） | **经评估后未执行**，理由见第 5 节 |

## 2. 安全措施（改动前）

| 措施 | 内容 |
| --- | --- |
| 完整备份 | `D:\program\_refactor-backup\pre-stage2-20261024-155903\` |
| 文件校验和 | `client.js` 改动前 SHA256 `7ee160e1…5157c4d` |
| 加载基线 | 新增 `test/08-client-load.mjs`，改动前先跑通作为基线 |

## 3. 新增的验证能力

`client.js` 跑在浏览器里，Node 端无法渲染，之前完全没有自动化保护。
本次补了一个**静态加载检查** `test/08-client-load.mjs`：

在 Node 里构造最小环境（假 `window.__ModuleLoader__`、假 React、假 `document`），执行整个文件并检查：

| 检查项 | 说明 |
| --- | --- |
| 文件可执行 | 语法与顶层代码无误 |
| factory 无异常 | 组件定义阶段的闭包与常量可用 |
| 模块 id | 必须等于包名 `dsh-mcmods-studio-plugin` |
| `inject` 声明 | 必须包含 `slots` |
| `apply` 可执行 | 在最小 `ctx` 下不抛错 |
| 注册的槽位 | 实际用到的三个座位都被注册 |

当前输出：

```text
✓ factory 执行无异常
✓ 调用了 __ModuleLoader__.load
✓ 模块 id 正确：dsh-mcmods-studio-plugin
✓ factory 是函数
✓ inject 声明包含 slots
✓ apply 是函数
✓ apply 在最小上下文下可执行
✓ 注册的槽位：main, register:main, sidebar.panellist,
  register:sidebar.panellist, sidebar.right.pane.tab, register:sidebar.right.pane.tab
```

**能力边界**：它能拦住「加载即崩」「座位漏注册」这类问题，**不能验证渲染结果**。
样式错误、交互逻辑错误仍需在页面上人工确认。

## 4. 实际改动

### 4.1 文件头补充结构索引

原文件头只说明注册两个座位（实际是三个，右侧栏标签已遗漏），本次修正并加入完整索引：

```text
基础工具          call / ensureStyles / 格式化
通用组件          Icon Modal Field TextInput … InfoRow
极简 markdown     renderInline / Markdown
状态与数据        useStudioData
跨面板共享状态    studioState / get / set / subscribe
项目页            ProjectTab / CreateProjectModal / ImportProjectModal
构想页            FeaturesTab / FeatureEditor
物品页            ItemsTab / ItemEditor / renderField / 画布常量
素材页            AssetsTab
教程页            GuideTab
主页面            StudioPage
目录选择          pickFolder / PathField
项目详情/重新导入  ProjectDetailModal / ImportConfirmModal
右侧栏面板        SidebarStudioPanel
注册              apply(ctx)
```

同时写明：查找时搜索 `// ──`；组件间通过 props 与 `studioState` 通信，不共享可变模块状态
（`appCtx`、`studioState` 是显式设计的跨组件通道）。

### 4.2 验证分节顺序

现有 15 个分节顺序已符合计划要求的「基础工具 → 通用组件 → 共享状态 → 页面 → 弹窗 → 注册」，
无需移动代码：

| 顺序 | 分节 | 起始行 |
| --- | --- | --- |
| 1 | 基础工具 | 94 |
| 2 | 通用组件 | 201 |
| 3 | 极简 markdown 渲染 | 329 |
| 4 | 状态与数据 | 429 |
| 5 | 跨面板共享状态 | 431 |
| 6 | 项目页 | 493 |
| 7 | 构想页 | 693 |
| 8 | 物品页 | 798 |
| 9 | 素材页 | 1171 |
| 10 | 教程页 | 1330 |
| 11 | 主页面 | 1340 |
| 12 | 目录选择 | 1466 |
| 13 | 项目详情 / 重新导入 | 1625 |
| 14 | 右侧栏面板 | 1810 |
| 15 | 注册 | 1924 |

## 5. 为什么没有拆 ItemsTab

计划中 B 项建议把 `ItemsTab`（241 行）拆成 `ItemRow` / `CanvasView` / `ListView`。
实测后判断**收益低于风险**，未执行。

### 5.1 依赖密度

统计 `ItemsTab` 渲染层实际引用的符号：

| 符号 | 引用次数 |
| --- | --- |
| `project` | 14 |
| `setError` | 10 |
| `images` | 10 |
| `schema` | 9 |
| `items` | 5 |
| `view` / `filtered` | 3 / 3 |
| `removeItem` / `positions` / `editing` / `drag` | 各 2 |
| `query` | 1 |

三个子视图共享 8 个状态与 3 个回调。拆开后每个子组件需要 5–6 个 props，
`ItemsTab` 本身变成 props 中转站，总行数不降反增。

### 5.2 没有测试兜底

`ItemsTab` 包含拖拽、批量取图、坐标持久化等交互，当前**没有任何自动化测试覆盖**
（`08-client-load.mjs` 只验证加载，不验证渲染）。在这种前提下大幅改动组件结构，
一旦出错只能靠人工在页面上发现。

### 5.3 结论

分节索引已经解决「找不到组件」的核心问题。真正的可维护性瓶颈不在组件粒度，
而在**缺少渲染层测试**——这需要引入浏览器测试环境，属于计划之外，未擅自进行。

若后续要推进组件拆分，建议先补齐渲染测试，再动手。

## 6. 验证

| 项目 | 结果 |
| --- | --- |
| 语法检查 | `node --check client.js` 通过 |
| 客户端加载检查 | 8 项全部通过 |
| 完整测试套件 | **8 个用例文件全部通过**（原 7 个 + 新增 `08-client-load`） |
| 行数 | 1946 → 1971（+25，全部为注释） |

## 7. 未改动的内容

- 组件实现、状态管理、样式常量：未改动；
- `lib/` 下全部文件：未触碰；
- `package.json`：未改动（测试脚本已能自动发现 `08-client-load.mjs`）。

## 8. 回滚方式

```bash
cd /d/program/dsh-mcmods-studio-plugin
cp "/d/program/_refactor-backup/pre-stage2-20261024-155903/client.js" ./
rm -f test/08-client-load.mjs
npm test
```

## 9. 后续

阶段 2 已把「能快速定位」和「能验证加载」两件事做完。下一步按计划是
阶段 3（`api.js` 声明式改造），它与 Agent 工具化直接相关，且可用现有测试完整覆盖，
风险低于阶段 2 的组件拆分。
