# 架构说明

> 适用版本：v0.1.3
> 更新日期：2026-10-28
> 版本规则见 [VERSION-PLAN.md](VERSION-PLAN.md)，实现状态见 [STATUS.md](STATUS.md)。

## 1. 总体结构

```text
┌──────────────────────────────────────────────────────────┐
│ 使用方                                                     │
│   用户 → DSH Web UI（浏览器）                              │
│   Agent → 21 个原生工具（mcmods_*）或 HTTP 动作             │
└───────────────────────┬──────────────────────────────────┘
                        │ POST /mcmods-studio/api
                        ▼
┌──────────────────────────────────────────────────────────┐
│ DSH Web UI                                               │
│   sidebar.panellist: mc-mod-studio  →  侧栏图标           │
│   main: key = mc-mod-studio        →  「模组工坊」页面     │
│      ├─ 项目      （项目列表 / 新建 / 扫描 / 导入）        │
│      ├─ 构想      （构想条目 CRUD）                        │
│      ├─ 物品      （列表 / 画布 / 属性编辑 / 校验提示）    │
│      ├─ 贴图与模型（上传/预览/方块面贴图/模型 JSON）       │
│      └─ 构建教程  （内置 markdown）                        │
│   sidebar.right.pane.tab: 项目概览与选中物品属性           │
└───────────────────────┬──────────────────────────────────┘
                        ▲
                        │ POST /mcmods-studio/api
                        ▼
┌──────────────────────────────────────────────────────────┐
│ DSH Host（Node 进程）                                     │
│   index.js  →  webServer.register('/mcmods-studio/api')     │
│             →  tools.register(21 个 mcmods_* 工具)        │
│   lib/api.js → 37 个动作的声明式路由表                     │
│      ├─ registry.js   注册表（$DSH_HOME/mcmods-studio）     │
│      ├─ paths.js      .mcstudio 路径与 id 校验            │
│      ├─ schema.js     加载器 / 状态 / 类型 / 19 个字段     │
│      ├─ meta.js       project.json 与 studio.json         │
│      ├─ entries.js    构想与物品 CRUD、readProject        │
│      ├─ import.js     识别 / 扫描 / 差异 / 快照 / proof    │
│      ├─ backup.js     导入前备份与失败回滚                  │
│      ├─ gradle.js     gradle.properties 解析与占位符       │
│      ├─ assets.js     贴图 / 模型 / 方块面解析            │
│      ├─ docs.js       Markdown 导出                       │
│      ├─ summary.js    summary.json（agent 用摘要）        │
│      ├─ structure.js  Java 代码结构解析与增量注解          │
│      └─ validate.js   9 类校验                           │
│   lib/tool-bridge.js → 把 lib/tools.js 的定义注册为工具    │
└───────────────────────┬──────────────────────────────────┘
                        ▼
              文件系统（用户的项目目录）
```

> 工具层与 HTTP 层**共用同一批业务函数**，不另建实现：`lib/tools.js` 直接调用
> `lib/entries.js`、`lib/meta.js`、`lib/summary.js` 等，区别只在入口形态。
> 设计依据见 [plans/AGENT-PLAN.md](plans/AGENT-PLAN.md)。

## 2. 为什么走 HTTP 路由而不是 Remote

- `webServer.register` 是 Host 已提供的稳定能力，注册与清理都跟随插件生命周期；
- Client 只做同源 `fetch`，不依赖 Typert / Remote 的生成物；
- 数据量小（JSON + base64 贴图），请求/响应模型足够；
- 后续接入 Agent 工具时，在 `lib/api.js` 之上再包一层工具注册即可，业务函数无需重写（见 [plans/AGENT-PLAN.md](plans/AGENT-PLAN.md)）。

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
| 导入前备份 | `$DSH_HOME/mcmods-studio/backups/` | 否 | `.mcstudio/` 与快照的副本，失败时回滚 |
| 项目设计数据 | `<项目>/.mcstudio/` | 建议是 | 元数据、构想、物品、工坊标记 |
| 项目素材 | `<项目>/src/main/resources/assets/` | 是 | 贴图与模型（标准路径） |
| 导出文档 | `<项目>/docs/` | 是 | 人读的 Markdown |

`$DSH_HOME` 默认是 `C:\Users\<用户>\.dsh`，可用环境变量覆盖。

## 5. 边界与安全

- 所有写操作都要求目标目录是已存在的工坊项目（`project.create` 与 `project.import` 例外）；
- `project.create` / `project.import` 允许任意目录，但要求目录为空或不存在、且工程能被识别，避免误覆盖；
- 贴图上传限制：PNG 魔数校验、必须正方形、单文件 ≤ 2MB；
- 方块贴图按 blockstate → 模型 → `parent` 链 → `textures` 解析，不依赖文件名；
- 物品 id / modid 使用白名单正则，避免路径穿越；
- JSON 写入采用「临时文件 + rename」的原子写入。

## 6. 扩展点

| 需求 | 扩展位置 |
| --- | --- |
| 新属性字段 | `lib/schema.js` 的 `ITEM_FIELDS` |
| 新页面视图 | `client.js` 的 `Tabs` 与 `StudioPage` |
| 新数据文件 | `lib/meta.js` / `lib/entries.js` + `lib/api.js` |
| 新导出文档 | `lib/docs.js` |
| AI 工具 | `index.js` 中 `ctx.tools.register`，复用 `lib/api.js` 动作 |
