# 测试

插件的自动化回归测试。全部用例通过 `dispatch` 直接调用 Host 业务函数，
**不依赖 DSH 运行时，也不占用 HTTP 端口**。

## 运行

```bash
npm test                 # 跑全部
node test/run.mjs 03     # 只跑文件名含 03 的用例
node test/04-entries.mjs # 单跑某个文件（输出更详细）
```

退出码 0 表示全部通过，可直接用于提交前检查或 CI。

## 目录

| 文件 | 覆盖范围 | 用例数 |
| --- | --- | --- |
| `helpers.mjs` | 工作区、断言、PNG 生成、工程骨架、运行器 | — |
| `01-registry.mjs` | 注册表、扫描根目录、项目登记、损坏回退 | 8 |
| `02-project.mjs` | 新建、打开、元数据、工坊标记、任意目录 | 11 |
| `03-import.mjs` | gradle.properties 解析、三分支、占位符、资源分类 | 13 |
| `04-entries.mjs` | 构想与物品 CRUD、字段纠偏、画布坐标、素材清理 | 10 |
| `05-assets.mjs` | PNG 校验、模型读写、缺失统计、路径回退 | 13 |
| `06-docs.mjs` | 五个导出文件、内容正确性、幂等 | 8 |
| `07-scan.mjs` | 扫描、已导入判定、差异分析、重新导入 | 12 |
| `08-client-load.mjs` | 客户端模块加载、座位注册 | 8 |
| `09-agent.mjs` | 工具清单、摘要、校验、筛选 | 19 |
| `10-schema-sync.mjs` | schema.json 与 schema.js 一致 | 2 |
| `11-tool-bridge.mjs` | DSH 工具定义、执行、导入提示 | 8 |
| `12-render.mjs` | 客户端渲染结构（空态、条目、按钮、差异展示） | 15 |
| `13-block-assets.mjs` | 方块贴图按 blockstate → 模型 → parent 链 → 面解析 | 7 |
| `14-persist.mjs` | 上次打开项目持久化、恢复、清理与旧格式兼容 | 10 |
| `15-structure.mjs` | Java 结构解析、注册反查、跨行字段、泛型方法、缓存失效、注解 | 15 |
| `16-reliability.mjs` | 持久写入、导入前备份与回滚、首次导入清理、导入 proof 失效 | 5 |
| `render-harness.mjs` | 渲染测试装置（假 React + 元素树查询） | — |

合计 **164 项**。

## 设计要点

### 隔离

每个用例通过 `createWorkspace()` 拿到独立临时目录：

```text
<tmp>/mcstudio-test-xxxx/
├── home/       ← DSH_HOME，注册表写在这里
└── projects/   ← 项目根目录
```

用例结束（无论成败）都会删除整个目录，**不会残留**、不会碰真实注册表。

### 直接调业务函数

```js
const boot = await ws.call('boot', {})
```

`ws.call` 就是 `dispatch(action, payload)`。跳过 HTTP 层的好处：
端口变化不影响测试，失败信息直接指向业务函数。

### 断言

| 函数 | 用途 |
| --- | --- |
| `must(cond, msg)` | 条件为假即失败 |
| `equal(actual, expected, msg)` | 值相等，失败时打印期望与实际 |
| `rejects(fn, snippet, msg)` | 必须抛错，且信息包含片段 |

失败时抛出带中文说明的错误，由运行器汇总打印。

### 素材构造

`makePngBase64(w, h)` 用 `zlib` 现场生成合法 PNG（含 IHDR/IDAT/IEND 与 CRC），
不依赖外部图片文件。传不同宽高可测试"非正方形被拒绝"。

### 工程骨架

`writeNeoForgeProject(ws, dir, opts)` / `writeFabricProject(ws, dir, opts)`
按 `docs/PROJECT-STRUCTURE.md` 的标准路径生成最小工程，可指定 modid、版本、
资源清单，或直接传自定义 `mods.toml` 内容（用于测试占位符与冲突）。

## 编写新用例

```js
import { equal, must, runSuite } from './helpers.mjs'

const cases = [
  {
    name: '用例说明（中文，说清验证什么）',
    async run(ws) {
      const dir = ws.path('demo')
      // ... 准备、执行、断言
    },
  },
]

process.exitCode = await runSuite('08 · 新模块', cases)
```

约定：

- 文件名用 `NN-名称.mjs`，`run.mjs` 按名称排序执行；
- 一个用例只验证一件事，失败信息要能直接看出哪里不对；
- 准备数据用 `ws.write` / `ws.call`，不要写死绝对路径；
- 断言失败时不要吞异常，交给运行器处理。

## 渲染测试

`12-render.mjs` 通过 `render-harness.mjs` 在 Node 里渲染组件：

1. 用假 React 执行 `client.js`，`useState` 可写、`useEffect` 同步执行；
2. 设置 `window.__MCMODS_TEST__` 让模块暴露组件（仅测试时，运行时不暴露）；
3. 用 `texts` / `hasText` / `buttons` / `countTag` 对元素树做结构断言。

`renderSettled()` 会放行一轮微任务与宏任务再重渲染，用于覆盖「`useEffect` 里
异步取数后更新界面」这类场景。

**能验证**：空态文案、条件渲染分支、按钮存在性、列表条目、差异展示。
**不能验证**：样式数值、鼠标交互、真实 DOM 布局。

## 已知边界

- 不测试真实 HTTP 路由（`index.js` 的 `handleRequest`），只测 `dispatch`；
- 不测试 DSH 座位注册（`ctx.slots`），那是运行时行为，属于手动验证范围；
- 渲染测试不执行 CSS，样式问题仍需人工确认。

## 历史

安全网建立时（2026-10-24）通过首轮运行发现并修复了三个缺陷：

| 缺陷 | 表现 | 修复 |
| --- | --- | --- |
| `readJson` 未按文档回退 | 注册表 JSON 损坏时抛错而非返回默认值 | 解析失败也走 fallback |
| `listFeatures` 未排序 | INDEX 文档承诺"按更新时间倒序"，实际原样返回 | 按 `updatedAt` 倒序 |
| `deleteItem` 未清理素材 | 文档与计划写明"同时清理贴图与模型"，实际只删 JSON | 删除条目后尽力清理素材文件 |
