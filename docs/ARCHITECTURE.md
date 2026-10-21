# 架构说明

## 1. 总体结构

```text
┌──────────────────────────────────────────────────────────┐
│ DSH Web UI（浏览器）                                      │
│   sidebar.panellist: mc-mod-studio  →  侧栏图标           │
│   main: key = mc-mod-studio        →  「模组工坊」页面     │
│      ├─ 项目      （项目列表 / 新建 / 扫描 / 导入）        │
│      ├─ 功能列表  （功能条目 CRUD）                        │
│      ├─ 物品      （列表 / 画布 / 属性编辑）               │
│      ├─ 贴图与模型（上传 / 预览 / 模型 JSON）              │
│      └─ 构建教程  （内置 markdown）                        │
└───────────────────────┬──────────────────────────────────┘
                        │ POST /mcmods-studio/api
                        ▼
┌──────────────────────────────────────────────────────────┐
│ DSH Host（Node 进程）                                     │
│   index.js  →  webServer.register('/mcmods-studio/api')     │
│   lib/api.js → 动作分派                                   │
│      ├─ registry.js   注册表（$DSH_HOME/mcmods-studio）     │
│      ├─ project.js    项目数据 / 扫描 / 导入              │
│      ├─ assets.js     贴图 / 模型                        │
│      └─ docs.js       Markdown 导出                       │
└───────────────────────┬──────────────────────────────────┘
                        ▼
              文件系统（用户的项目目录）
```

## 2. 为什么走 HTTP 路由而不是 Remote

- `webServer.register` 是 Host 已提供的稳定能力，注册与清理都跟随插件生命周期；
- Client 只做同源 `fetch`，不依赖 Typert / Remote 的生成物；
- 数据量小（JSON + base64 贴图），请求/响应模型足够；
- 后续若要接入 Agent 工具，只需在 `lib/api.js` 之上再包一层 `ctx.tools.register`。

## 3. 生命周期

- `apply(ctx)` 中通过 `ctx.inject(['webServer'], child => child.effect(...))` 注册路由；
- `child.effect` 返回的 disposer 会在插件卸载时移除路由，避免热重载后残留旧处理器；
- Client 的 `apply(ctx)` 中 `ctx.slots.inject(slotName, () => ctx.slots.register(...))`，
  座位随插件卸载自动回收。

## 4. 数据分层

| 层 | 位置 | 是否进 git | 说明 |
| --- | --- | --- | --- |
| 插件代码 | `D:\program\dsh-mcmods-studio-plugin` | 是 | 本仓库 |
| 插件注册表 | `$DSH_HOME/mcmods-studio/registry.json` | 否 | 本机项目索引与默认根目录 |
| 项目设计数据 | `<项目>/.mcstudio/` | 建议是 | 元数据、功能、物品 |
| 项目素材 | `<项目>/src/main/resources/assets/` | 是 | 贴图与模型（标准路径） |
| 导出文档 | `<项目>/docs/` | 是 | 人读的 Markdown |

`$DSH_HOME` 默认是 `C:\Users\<用户>\.dsh`，可用环境变量覆盖。

## 5. 边界与安全

- 所有写操作都要求目标目录是已存在的工坊项目（`project.create` 与 `project.import` 例外）；
- `project.create` / `project.import` 限制在「扫描根目录」内，防止误写到任意路径；
- 贴图上传限制：PNG 魔数校验、必须正方形、单文件 ≤ 2MB；
- 物品 id / modid 使用白名单正则，避免路径穿越；
- JSON 写入采用「临时文件 + rename」的原子写入。

## 6. 扩展点

| 需求 | 扩展位置 |
| --- | --- |
| 新属性字段 | `lib/project.js` 的 `ITEM_FIELDS` |
| 新页面视图 | `client.js` 的 `Tabs` 与 `StudioPage` |
| 新数据文件 | `lib/project.js` + `lib/api.js` |
| 新导出文档 | `lib/docs.js` |
| AI 工具 | `index.js` 中 `ctx.tools.register`，复用 `lib/api.js` 动作 |
