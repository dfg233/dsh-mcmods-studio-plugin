# 模块计划索引

> 本目录存放模组工坊各功能模块的详细计划，用于在改动代码前明确「这个模块做什么、什么时候触发、怎么跑」。
> 生成日期：2026-10-22（2026-10-25 更新状态）
> 配套文档：[PLAN.md](../PLAN.md)（版本路线）、[STATUS.md](../STATUS.md)（实现状态）、[INDEX.md](../INDEX.md)（代码索引）

## 模块一览

| # | 模块 | 文档 | 状态 | 主要代码 |
| --- | --- | --- | --- | --- |
| 01 | 平台基础 | [PLATFORM-PLAN.md](PLATFORM-PLAN.md) | 已实现 | `index.js`、`lib/registry.js`、`lib/api.js` |
| 02 | 项目管理 | [PROJECT-PLAN.md](PROJECT-PLAN.md) | 已实现 | `lib/meta.js`、`lib/entries.js`、`ProjectTab`、`CreateProjectModal` |
| 03 | 扫描发现 | [SCAN-PLAN.md](SCAN-PLAN.md) | 已实现 | `scanCandidates`、`ProjectTab` 扫描区 |
| 04 | 工程导入 | [IMPORT-PLAN.md](IMPORT-PLAN.md) | 已实现 | `detectDescriptor`、`scanProjectAssets`、`importProject` |
| 05 | 构想 | [FEATURES-PLAN.md](FEATURES-PLAN.md) | 已实现 | `features.*`、`FeaturesTab`、`FeatureEditor` |
| 06 | 物品管理 | [ITEMS-PLAN.md](ITEMS-PLAN.md) | 已实现 | `items.*`、`ItemsTab`、`ItemEditor` |
| 07 | 素材管理 | [ASSETS-PLAN.md](ASSETS-PLAN.md) | 已实现 | `lib/assets.js`、`AssetsTab` |
| 08 | 文档导出 | [DOCS-PLAN.md](DOCS-PLAN.md) | 已实现 | `lib/docs.js` |
| 09 | 构建教程 | [GUIDE-PLAN.md](GUIDE-PLAN.md) | 已实现 | `readGuide`、`GuideTab`、`BUILD-GUIDE.md` |
| 10 | 界面外壳 | [SHELL-PLAN.md](SHELL-PLAN.md) | 已实现 | `client.js` 全文件 |
| 11 | 代码工作区 | [CODEGEN-PLAN.md](CODEGEN-PLAN.md) | **规划中（v0.3）** | 拟新增 `lib/files.js`、`lib/codegen.js` |
| 12 | Agent 接入 | [AGENT-PLAN.md](AGENT-PLAN.md) | **已实现** | `lib/tools.js`、`lib/tool-bridge.js`、`lib/summary.js`、`lib/validate.js`、`data/schema.json` |

> 模块 12 不是独立功能，而是横切改进：它把 01–11 的能力以工具与紧凑数据的形式重新暴露给 agent。
> 方向依据见 [../PLAN.md](../PLAN.md) 第 0 节「插件宗旨」。
>
> **模块 12 落地情况**：建议 1（原生工具）、2（摘要）、3（双表示）、4（schema 外置）、5（校验器）、
> 6（导入提示）已完成；建议 7（关系视图）、8（编辑提效）、9（文档双向同步）仍在计划中，
> 归入 v0.2 与后续版本。

## 每份文档的固定结构

1. 模块职责（负责 / 不负责）
2. 数据与文件（读写的文件、字段、路径规则）
3. 事件（用户操作、系统事件、异常事件三张表）
4. 运行过程（调用链 + 编号步骤）
5. 接口（action、入参、返回、错误文案）
6. 前端组件（组件名、props、内部状态）
7. 边界与错误
8. 现状与缺口
9. 关联模块

## 模块依赖关系

```text
01 平台基础
 ├─ 02 项目管理 ── 03 扫描发现 ── 04 工程导入
 │                    │              │
 │                    └──────────────┴──→ 06 物品管理 ──→ 07 素材管理
 │                                          │              │
 │                    05 构想 ───────────┴──────────────┤
 │                                                          ▼
 │                                              08 文档导出 / 09 构建教程
 │
 └─ 10 界面外壳（承载全部页面与三个座位）
      └─ 11 代码工作区（规划，复用外壳组件，数据来自 06/07）

12 Agent 接入（横切）：复用 02–08 的业务函数，向 agent 暴露工具与紧凑数据
      依赖 02 项目、05 构想、06 物品、07 素材、08 导出
```

## 关键概念速查

| 概念 | 位置 | 说明 |
| --- | --- | --- |
| 工坊标记 `studio.json` | `<项目>/.mcstudio/` | 存在即视为已导入，扫描据此判定 |
| 项目元数据 `project.json` | `<项目>/.mcstudio/` | 名称、modid、版本、加载器 |
| 物品条目 `items/<id>.json` | `<项目>/.mcstudio/` | 19 项属性 + 画布坐标 |
| 素材根目录 | `src/main/resources/assets/<modid>/` 或 `.mcstudio/assets/<modid>/` | 有标准资源目录时优先前者 |
| 接口 | `POST /mcmods-studio/api` | 统一 `{action, payload}` → `{ok, data\|error}` |
| 主面板 key | `mc-mod-studio` | 侧栏 id、main key、右侧栏 tab id 三者一致 |

## 维护约定

- 模块职责、事件、接口发生变化时，同步更新对应 `*-PLAN.md`；
- 新增模块时在本索引追加一行，并复制固定结构；
- 状态列只有「已实现 / 规划中 / 部分实现」三种取值；
- 未实现的内容不得写入「运行过程」，只能出现在「现状与缺口」或标为规划中的模块。
