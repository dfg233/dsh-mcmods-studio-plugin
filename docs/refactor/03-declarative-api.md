# 重构日志 03：api.js 声明式改造

> 阶段：重构计划 阶段 3
> 日期：2026-10-24
> 状态：已完成并验证
> 影响范围：`lib/api.js` 内部结构，28 个对外动作零变化

## 1. 目的

`api.js` 原本是 28 个同构动作的平铺列表，每个都在重复三件事：
`requireStudio(path)` → 调业务函数 → 包装返回。真正有逻辑的只有 `boot`、
`items.save`（补模型）、`debug.clientGraph`。

这种写法有两个问题：新增动作要写 6–8 行样板；将来给 agent 暴露工具时还要再写一遍。

## 2. 安全措施

| 措施 | 内容 |
| --- | --- |
| 完整备份 | `D:\program\_refactor-backup\pre-stage34-20261024-171805\` |
| 文件校验和 | `api.js` 改动前 SHA256 `d6f7e0dc…9e4597` |
| 行为基线 | 改动前 8 个用例文件、75 项用例全绿 |

## 3. 变更内容

### 3.1 动作表改为声明式路由

```js
const routes = {
  'items.save': {
    scope: 'studio',        // 需要哪种路径校验
    summary: true,          // 执行后刷新摘要
    run: async ({ path, item, ensureModel: withModel }) => { ... },
  },
}
```

`scope` 三种取值：

| 值 | 含义 | 校验 |
| --- | --- | --- |
| `none` | 不需要路径（`boot`、`scan`、`create` 自己处理） | 无 |
| `project` | 目录必须存在 | `requireProjectPath` |
| `studio` | 必须是工坊项目 | `requireStudio` |

### 3.2 dispatch 统一处理横切逻辑

```js
export async function dispatch(action, payload) {
  const route = routes[action]
  if (!route) throw new Error(`未知动作：${action}`)

  const input = payload ?? {}
  let path = null
  if (route.scope === 'studio') path = await requireStudio(input.path)
  else if (route.scope === 'project') path = await requireProjectPath(input.path)

  const result = await route.run(path === null ? input : { ...input, path })

  if (route.summary && path !== null) await rebuildSummary(path).catch(() => {})
  return result
}
```

原本散落在各动作里的 `requireStudio` 调用全部移除，改由分派器统一完成。

### 3.3 新增导出

| 导出 | 用途 |
| --- | --- |
| `listActions()` | 返回全部动作名，供工具层与文档引用 |
| `agent.summary` / `agent.validate` / `agent.tools` / `agent.call` | 四个 agent 相关动作，见日志 04 |

## 4. 等价性保证

| 检查 | 结果 |
| --- | --- |
| 动作数量 | 28 → **32**（新增 4 个 agent 动作，原 28 个全保留） |
| 参数结构 | 全部保持 `{path, ...}`，未改名 |
| 错误文案 | 未改动（`requireStudio` 的提示原文保留） |
| 测试 | 8 个用例文件全绿，无回归 |

改造后第一次跑测试即通过，说明声明式改写没有改变行为。

## 5. 验证

| 项目 | 结果 |
| --- | --- |
| 语法 | `node --check` 通过 |
| 完整测试 | 8 个用例文件、77 项全绿（阶段 3 完成时） |
| 运行时 | `agent.tools` 返回 17 个工具、32 个动作 |

## 6. 回滚

```bash
cp "/d/program/_refactor-backup/pre-stage34-20261024-171805/lib/api.js" lib/
npm test
```

## 7. 收益

- 新增动作从 8 行样板降到 1 行声明；
- 路径校验与错误处理只有一份实现，不会漏写；
- 同一张表可被工具层复用，避免「HTTP 一套、工具一套」的重复维护。
