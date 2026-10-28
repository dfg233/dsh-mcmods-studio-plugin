# 平台基础模块计划

> 模块编号：01
> 适用插件版本：v0.1.2
> 代码位置：`index.js`、`lib/registry.js`、`lib/api.js`（分派部分）
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 在 DSH 的 Web 服务上挂载一个 HTTP 接口 `/mcmods-studio/api`；
- 解析请求体、分发到具体动作、把结果或错误序列化为 JSON；
- 维护插件级注册表（扫描根目录 + 已登记项目列表）；
- 提供路径展开、路径归属判断、原子文件写入等基础设施。

**不负责**：

- 任何业务规则（项目如何创建、物品有哪些字段）——交给 `lib/meta.js`、`lib/schema.js`、`lib/entries.js` 等业务模块；
- 界面渲染——交给 `client.js`；
- 权限与鉴权——沿用 DSH 自身的会话与路由机制。

## 2. 数据与文件

### 2.1 注册表文件

路径：`$DSH_HOME/mcmods-studio/registry.json`（`DSH_HOME` 缺省为 `~/.dsh`）

```json
{
  "schemaVersion": 1,
  "root": "D:\\program",
  "projects": [
    {
      "path": "D:\\program\\demo",
      "name": "示例模组",
      "modid": "demomod",
      "updatedAt": "2026-10-22T12:00:00.000Z"
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `schemaVersion` | 结构版本，当前为 1，用于将来迁移 |
| `root` | 扫描根目录，只影响「扫描已有工程」，不限制项目位置 |
| `projects[]` | 已登记项目；`path` 唯一，`name`/`modid` 冗余存储便于列表展示 |

### 2.2 路径函数

| 函数 | 返回 |
| --- | --- |
| `dataDir()` | `<DSH_HOME>/mcmods-studio` |
| `registryPath()` | `<dataDir>/registry.json` |
| `expandPath(input)` | 展开 `~` 后的绝对路径；空输入返回 `''` |
| `isInside(parent, child)` | 子路径是否在父目录内（防目录穿越） |

## 3. 事件

### 3.1 HTTP 请求事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 浏览器 `call()` | `POST /mcmods-studio/api` | `readBody` 读取 ≤8MB 请求体 | 超限或非法 JSON → 400 |
| 同上 | 请求体解析成功 | 取 `action` 与 `payload` | 缺 `action` → `{ok:false,error:'缺少 action'}` |
| 同上 | 动作存在 | `dispatch(action, payload)` | `{ok:true,data}` |
| 同上 | 动作不存在 | 抛出 `未知动作：xxx` | `{ok:false,error}` |
| 任意 | 非 POST 请求 | 直接拒绝 | 405 |
| 同上 | 处理中抛异常 | 捕获并转文案 | `{ok:false,error:message}` |

### 3.2 生命周期事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| DSH 加载插件 | `apply(ctx)` | 注册 `webServer` 路由（`kind:'exact'`） | 接口可用 |
| DSH 卸载/重载插件 | 插件销毁 | `child.effect` 返回的清理函数执行 | 路由摘除，端口不再响应 |
| DSH 加载插件 | `apply(ctx)` | 注册 `clientModules` 探针 | `debug.clientGraph` 可用 |

### 3.3 文件写入事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 任意写操作 | `writeJson` / `writeText` | 写临时文件 → `rename` 覆盖 | 避免半截文件；失败时原文件不变 |
| `touchProject` | 项目已在表中 | 更新 `name`/`modid`/`updatedAt` | 不重复追加 |
| `touchProject` | 项目不在表中 | 追加新条目 | 列表变长 |

## 4. 运行过程

### 4.1 一次接口调用的完整链路

```text
浏览器 client.js
   │  call(action, payload)
   ▼
fetch POST /mcmods-studio/api
   │  body: {"action":"items.save","payload":{...}}
   ▼
index.js  handleRequest(req, res)
   │  ① 校验 method === 'POST'，否则 405
   │  ② readBody(req) —— 累积数据块，超过 8MB 立即中断
   │  ③ JSON.parse —— 失败返回 400
   ▼
lib/api.js  dispatch(action, payload)
   │  ④ actions[action] 查找，未命中抛错
   │  ⑤ requireStudio(path) —— 校验目录存在且是工坊项目
   ▼
lib/meta.js / entries.js / import.js / assets.js / docs.js
   │  ⑥ 执行业务逻辑，读写 .mcstudio/ 或工程资源
   ▼
返回 data
   │
   ▼
index.js  sendJson(res, 200, {ok:true,data})
```

### 4.2 编号步骤

1. 浏览器侧 `call()` 组装 `{action, payload}` 并 `fetch`；
2. `handleRequest` 校验方法与体积；
3. 解析 JSON，取出 `action`；
4. `dispatch` 查表，未注册动作立即抛错（不静默失败）；
5. 动作内部先用 `requireStudio` 或 `requireProjectPath` 校验路径；
6. 业务函数读写文件，失败抛中文错误；
7. `handleRequest` 统一包装为 `{ok,data|error}` 并回写响应。

## 5. 接口

平台层本身不暴露业务动作，只提供分派器：

| 项目 | 说明 |
| --- | --- |
| `dispatch(action, payload)` | 查表执行；未知动作抛 `未知动作：xxx` |
| `setPluginRoot(dir)` | 注入插件目录，供读取内置教程 |
| `setGraphProvider(fn)` | 注入客户端模块图读取器，仅诊断用 |

动作清单（共 37 个）按前缀归属：

| 前缀 | 动作 |
| --- | --- |
| `projects.` | `scan`、`add`、`remember`、`remove` |
| `registry.` | `setRoot` |
| `project.` | `create`、`open`、`import`、`analyzeImport`、`reimport`、`saveMeta` |
| `features.` | `list`、`save`、`delete` |
| `items.` | `list`、`save`、`delete` |
| `assets.` | `list`、`upload`、`read`、`readMany`、`delete`、`model.get`、`model.save`、`root` |
| `structure.` | `refresh`、`get`、`find`、`annotate` |
| `agent.` | `summary`、`validate`、`tools`、`call` |
| 其他 | `boot`、`docs.export`、`guide`、`debug.clientGraph` |

## 6. 前端组件

平台层没有专属组件；所有页面都通过 `client.js` 顶部的 `call(action, payload)` 访问：

```js
async function call(action, payload) {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload: payload || {} }),
  })
  const json = await response.json().catch(() => ({ ok: false, error: '响应解析失败' }))
  if (!json.ok) throw new Error(json.error || '请求失败')
  return json.data
}
```

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 请求体超过 8MB | 中断读取并返回错误，不写入磁盘 |
| JSON 格式错误 | 返回 400 与解析错误信息 |
| 动作名拼错 | `未知动作：xxx`，便于定位 |
| `DSH_HOME` 未设置 | 回退到 `~/.dsh` |
| 注册表文件损坏 | `readJson` 返回 fallback，按空注册表继续 |
| 并发写同一注册表 | 依赖原子 rename，最后一次写入生效（无锁） |
| 路径含 `..` | `isInside` / `assertInside` 拦截（用于曾经的根目录限制；现已不限制项目位置，但仍用于素材路径） |

## 8. 现状与缺口

**已实现**：路由挂载与卸载、8MB 限制、统一响应格式、注册表读写、原子写入、路径展开与归属判断、客户端模块图诊断。

**已知缺口**：

- 无请求鉴权（依赖 DSH 自身的会话边界）；
- 无并发写锁，多窗口同时改注册表可能互相覆盖；
- 无接口版本号，动作签名变更时旧前端会报错；

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 下游 | 02 项目管理、03 扫描发现、04 工程导入、05 构想、06 物品管理、07 素材管理、08 文档导出、09 构建教程 |
| 被依赖方式 | 所有模块都通过 `dispatch` 暴露动作 |
| 前端依赖 | 10 界面外壳（`call()` 封装） |
