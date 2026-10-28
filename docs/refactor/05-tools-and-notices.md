# 重构日志 05：原生工具、界面消费与导入提示

> **历史存档（2026-10-28 标注）**：本文记录 2026-10-24 的重构状态，文中版本号、工具数与动作数为当时结果，不随当前版本回改。当前版本见 [VERSION-PLAN.md](../VERSION-PLAN.md)，当前能力见 [STATUS.md](../STATUS.md)。

> 阶段：后续三项（接在重构计划之后）
> 日期：2026-10-24
> 状态：三项均已完成并验证
> 影响范围：`index.js`、`lib/tool-bridge.js`（新增）、`lib/import.js`、`client.js`、`test/11-tool-bridge.mjs`（新增）

## 1. 背景

重构计划完成时，[04-agent-modules.md](04-agent-modules.md) 第 11 节列了三个后续建议。
本次按顺序全部实现。

## 2. 第一项：注册 DSH 原生工具

### 2.1 问题

阶段 4 的工具只能通过 `agent.call` 走 HTTP 调用，agent 仍需知道接口地址与信封格式。

### 2.2 做法

新增 `lib/tool-bridge.js`，把 `lib/tools.js` 的 17 个工具映射为 DSH 工具定义：

| 映射项 | 处理 |
| --- | --- |
| `name` | 加 `mcmods_` 前缀，避免与其他插件重名 |
| `parameters` | 由工具的 `input` 转成 JSON Schema，补 `additionalProperties: false` |
| `execute` | 调 `tool.run`，异常包装成 `<工具名> 失败：<原因>` |
| `output.schema` / `output.render` | 渲染为文本块，超 20000 字符截断 |

在 `index.js` 注册：

```js
ctx.inject(['tools'], (child) => {
  child.effect(() => {
    const disposers = registerTools(child)
    return () => { for (const dispose of disposers) dispose() }
  }, 'mcmods-studio: agent tools')
})
```

卸载时逐个注销；宿主没有 `tools` 服务时整段跳过，HTTP 通道不受影响。

### 2.3 验证

重装后通过 `cordis_inspect_query` 查询工具清单，**17 个 `mcmods_*` 工具全部存在**：

```text
mcmods_asset_list      mcmods_item_get        mcmods_project_scan
mcmods_doc_export      mcmods_item_list       mcmods_project_summary
mcmods_idea_delete     mcmods_item_save       mcmods_project_validate
mcmods_idea_list       mcmods_project_analyze mcmods_schema_get
mcmods_idea_save       mcmods_project_create
mcmods_item_delete     mcmods_project_import
mcmods_project_list
```

即 agent 现在可以直接调用 `mcmods_item_list` 等工具，无需自写脚本。

## 3. 第二项：界面消费 summary 与 validate

### 3.1 物品页增加校验面板

- 进入物品页与条目数量变化时调用 `agent.validate`；
- 有错误或警告时，顶部出现提示条：「N 个错误 / N 个警告 · 点击查看明细」；
- 展开后逐条列出，最多 30 条，超出提示剩余数量；
- 校验失败时静默（`setReport(null)`），不打断编辑。

### 3.2 右侧栏显示缺失素材

`SidebarStudioPanel` 增加一次 `agent.summary` 请求，在项目概览中追加「缺失素材 N 个」一行；
摘要失败不影响主内容展示。

### 3.3 未做

项目页未消费 summary（右侧栏已覆盖概览需求），避免同类信息重复展示。

## 4. 第三项：导入返回判定提示

### 4.1 问题

导入过程中系统做了多个判断（占位符解析、加载器来源），但只有结论没有说明，
用户与 agent 都不知道「为什么是这个值」。

### 4.2 做法

`resolveIdentity` 在判定过程中收集 `notices[]`，`detectDescriptor` 记录被解析的占位符：

| code | 触发条件 | 示例消息 |
| --- | --- | --- |
| `source.descriptor` | 没有 gradle.properties | 元数据取自工程描述文件 |
| `loader.gradle` | 加载器由 gradle 判定 | 加载器判定为 neoforge |
| `loader.descriptor` | 加载器取自描述文件 | 加载器取自工程描述文件：fabric |
| `descriptor.placeholder` | 描述文件含占位符 | 占位符已解析：`${mod_version}` → 2.1.0 |

`notices` 随 `project.import`、`project.reimport` 的 `imported` 字段与
`project.analyzeImport` 的顶层返回，界面在导入确认弹窗中新增「判定提示」卡片。

### 4.3 边界

身份解析失败（缺必需字段）时**不产生 notices**——此时结论尚无意义，
应直接报错说明缺什么。该行为已由测试固定。

## 5. 新增测试

`test/11-tool-bridge.mjs`，8 项：

| 用例 | 覆盖 |
| --- | --- |
| 注册全部工具且带前缀 | 17 个、无重名、全部 `mcmods_` 开头 |
| 定义结构符合 DSH 要求 | name / description / parameters / required / output |
| 执行走真实业务函数 | 调用 `mcmods_item_list` 得到真实数据 |
| 错误被包装成可读信息 | 错误信息含工具名 |
| 无 tools 服务时明确报错 | 快速失败而非静默跳过 |
| 导入返回判定提示 | 占位符与加载器提示都出现 |
| 缺 gradle.properties 时说明缺失原因 | 报错含缺失字段，notices 为空 |
| 有 gradle.properties 的 Fabric 工程可正常判定 | 不误报 |

## 6. 实施中修正的问题

### 6.1 `registerTools` 静默吞掉「无 tools 服务」

初版在 `ctx.tools` 未定义时，循环内每个工具的 `register` 都抛错并被 catch 吞掉，
函数返回空数组，调用方无法察觉注册完全失败。

改为**入口先校验**：`ctx.tools.register` 不存在时直接抛错。
单个工具注册失败仍只 warn，不影响其余工具。

### 6.2 测试用例的前提错误

初版「无 gradle.properties 时提示回退」期望拿到 `source.descriptor` 提示，
但实际 Fabric 工程缺少 gradle.properties 后连加载器版本都无从获取，
身份解析直接失败，`notices` 为空。

这是正确行为（失败时不谈判定细节），改为断言「返回 identityError 且指明缺加载器版本」，
另外补一条「有 gradle.properties 的 Fabric 工程可正常判定」保证正向路径也被覆盖。

## 7. 验证

| 项目 | 结果 |
| --- | --- |
| 语法 | 全部 `node --check` 通过 |
| 完整测试 | **11 个用例文件全部通过**（96 → 104 项） |
| 客户端加载 | 8 项检查通过 |
| 原生工具 | 重装后 17 个 `mcmods_*` 工具出现在 DSH 工具清单 |
| HTTP 通道 | `agent.tools` 仍返回 17 工具 / 32 动作 |

## 8. 未改动的内容

- 既有 32 个 HTTP 动作的参数与返回：仅在导入结果中**新增** `notices` 字段，未改动既有字段；
- `lib/api.js`、`lib/summary.js`、`lib/validate.js`、`lib/tools.js`：本次未改；
- `package.json`：未改。

## 9. 回滚

```bash
BK="/d/program/_refactor-backup/pre-stage34-20261024-171805"
rm -f lib/tool-bridge.js test/11-tool-bridge.mjs
cp "$BK/index.js" index.js
cp "$BK/lib/import.js" lib/import.js
cp "$BK/client.js" client.js
npm test
```

## 10. 与 AGENT-PLAN 的完成度变化

| 建议 | 之前 | 现在 |
| --- | --- | --- |
| 建议 1：注册原生工具 | 部分完成 | **完成**（17 个工具已注册到 DSH） |
| 建议 6：导入提示 | 未做 | **完成**（4 类 notices） |

剩余：建议 7（关系可视化）、8（编辑提效）、9（文档双向同步），均属 P2/P3。
