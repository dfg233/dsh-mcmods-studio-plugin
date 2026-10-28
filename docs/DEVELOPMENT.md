# 开发文档

> 适用版本：v0.1.1
> 更新日期：2026-10-28
> 发版与版本号规则见 [VERSION-PLAN.md](VERSION-PLAN.md)，函数级索引见 [INDEX.md](INDEX.md)。

## 1. 插件形态

本插件是一个 DSH **持久化 bundle**，由两半组成：

| 半 | 入口 | 运行环境 | 职责 |
| --- | --- | --- | --- |
| Host | `index.js` | Node（DSH 进程内） | 文件读写、项目数据、代码结构扫描、文档导出、HTTP API、原生工具 |
| Client | `client.js` | 浏览器（Web UI） | 页面渲染、表单交互 |

`package.json` 声明：

- `dsh.bundle.patch` → `cordis.patch.yml`：安装时把插件行插入 Loader 配置；
- `dsh.client` → `./client.js`：Web 端加载浏览器模块；
- `version`：插件版本，**唯一来源**，发版时只改这里。

## 2. 安装与调试

在 DSH 中用插件管理器安装本地目录：

```text
plugin_manager install_bundle  target: D:\program\dsh-mcmods-studio-plugin
```

安装后：

- 侧栏出现「模组工坊」图标，点击打开中央页面；
- Host 路由 `POST /mcmods-studio/api` 生效；
- 21 个 `mcmods_*` 原生工具注册到宿主；
- 改动代码前先查 [代码索引](INDEX.md)，按「文件 → 函数 → 参数 → 返回」定位；
- 修改 Host 代码后需要 `remove_bundle` + `install_bundle` 重装（或重启 DSH），
  才能加载新的 JavaScript 模块；
- 只改 `client.js` 时通常刷新页面即可；开发时建议同时运行 `pnpm run dev:web` 获得 HMR。

## 3. 代码结构

```text
dsh-mcmods-studio-plugin/
├── package.json          # 清单：版本、bundle patch、client 声明
├── cordis.patch.yml      # Loader 补丁：插入 mc-mod-studio 行
├── index.js              # Host 入口：HTTP 路由、原生工具注册、卸载清理
├── client.js             # Client 入口：单文件 UI 模块
├── lib/
│   ├── api.js            # 37 个动作的声明式路由表与 dispatch
│   ├── registry.js       # 注册表、路径工具、原子写文件
│   ├── paths.js          # .mcstudio/ 路径、id 校验、路径归属
│   ├── schema.js         # 加载器、状态、类型、19 个字段
│   ├── meta.js           # project.json 与 studio.json
│   ├── entries.js        # 构想与物品 CRUD、readProject
│   ├── import.js         # 工程识别、资源扫描、差异、快照
│   ├── gradle.js         # gradle.properties 解析与占位符
│   ├── assets.js         # 贴图、模型、方块面解析
│   ├── docs.js           # 五份 Markdown 导出
│   ├── summary.js        # summary.json（agent 摘要）
│   ├── structure.js      # Java 结构解析、按哈希增量、语义注解
│   ├── validate.js       # 9 类校验
│   ├── tools.js          # 21 个 agent 工具的定义与调用
│   ├── tool-bridge.js    # 把工具注册为 DSH 原生工具
│   └── project.js        # 转发层：export * 五个数据模块（不能删）
├── data/schema.json      # 字段定义对外副本（由脚本生成）
├── scripts/gen-schema.mjs
├── test/                 # 15 个回归用例文件、159 项
├── locale/               # 插件显示名与描述
└── docs/                 # 本目录
```

## 4. 数据流

```text
浏览器页面                        Agent
   │ fetch POST /mcmods-studio/api   │ ctx.tools.register
   ▼                                 ▼
index.js（Host 路由）          lib/tool-bridge.js
   │ dispatch(action, payload)      │ callTool(name, args)
   ▼                                 ▼
lib/api.js ────────────────────► lib/tools.js
   │                                 │
   └──────────► lib/ 业务函数 ◄──────┘
                    │
                    ▼
   <project>/.mcstudio/ 与 src/main/resources/assets/
```

- HTTP 与工具**共用同一批业务函数**，不维护两套实现；
- Host 半不缓存状态，所有数据以文件为准；
- Client 半只保存界面状态（当前项目、当前页签、编辑中的草稿）；
- `summary.json` 与 `structure.json` 是派生数据，可删除重建。

## 5. 如何扩展

### 新增一个物品属性字段

1. 在 `lib/schema.js` 的 `ITEM_FIELDS` 中增加定义（`key`、`label`、`type`、`group`、`default`、`hint`）；
2. 若需要新的输入控件类型，在 `client.js` 的 `renderField()` 中加分支；
3. 运行 `npm run gen:schema` 刷新 `data/schema.json`；
4. 文档导出会自动包含新字段（`lib/docs.js` 按 `ITEM_FIELDS` 遍历）。

### 新增一个 API 动作

1. 在 `lib/api.js` 的 `routes` 中加一条 `'域.动作': { scope, run }`；
2. `run` 直接调 `lib/` 下的业务函数，不重写逻辑；
3. 写操作需要刷新摘要时加 `summary: true`；
4. 前端用 `call('域.动作', payload)` 调用；需要暴露给 agent 时在 `lib/tools.js` 增加工具。

### 新增一个 agent 工具

1. 在 `lib/tools.js` 的 `TOOLS` 中加 `{ name, description, input, run }`；
2. 名称不带 `mcmods_` 前缀，`lib/tool-bridge.js` 会统一加；
3. 写操作后自行刷新 `summary.json`（与 HTTP 动作的 `summary: true` 对齐）。

### 修改页面

`client.js` 是单文件 React（`createElement`）实现，组件划分：

- `StudioPage`：页面框架与状态；
- `ProjectTab` / `FeaturesTab` / `ItemsTab` / `AssetsTab` / `GuideTab`：五个视图；
- `ItemEditor` / `FeatureEditor` / `CreateProjectModal` / `ImportProjectModal` /
  `ImportConfirmModal` / `ProjectDetailModal`：弹窗；
- `SidebarStudioPanel`：右侧栏概览。

样式全部使用 DSH 主题变量（`--dsw-alias-*`），不硬编码颜色，自动适配明暗主题。

### 修改结构扫描

1. `lib/structure.js` 的 `parseJava` 与相关正则负责解析；
2. 改完运行 `node test/15-structure.mjs`，并用真实工程跑一次 `structure_refresh` 核对；
3. 字段解析采用「单行声明 + 初始化续行」两种路径，新增语法请同时补测试；
4. 不在扫描阶段调用模型，保证同一份源码两次扫描结果一致。

## 6. 约定

- 所有文件读写都在 Host 侧完成，Client 不直接触碰文件系统；
- 项目路径必须存在且是工坊项目，才允许读写业务数据；
- 新建与导入的项目**可以位于任意目录**；「扫描根目录」只用于批量扫描候选工程；
- 是否「已导入」以项目目录内的 `.mcstudio/studio.json` 为准，不依赖注册表路径；
- 所有界面文案为中文，不引入 i18n 运行时；
- `lib/project.js` 是兼容转发层，`api.js`、`assets.js`、`docs.js`、`tools.js` 仍从它导入，**不能删除**；
- `client.js` 是 `window.__ModuleLoader__.load` 的单文件模块，不能拆成多个 ES 模块，
  只能做文件内分节；
- 当前版本不生成 gradle / Java 代码；v0.3 起通过 `lib/codegen.js` 生成带注释标记的
  Java 与资源 JSON，只替换标记区间，不覆盖手写代码，且以工具形式暴露；
- 侧栏入口只注册图标区：`sidebar.panellist`（`order: 2`），点击后由侧栏按同名 key
  打开 `main` 里的 `mc-mod-studio` 面板；
- 右侧栏注册 `sidebarRightTabs` 与 `sidebar.right.pane.tab`，通过模块级 `studioState`
  与主面板联动；
- **每次优化或修复 bug 都要按 [VERSION-PLAN.md](VERSION-PLAN.md) 升 PATCH 版本，
  并同步全部文档。**

## 7. 本地测试

Host 层可以脱离 DSH 直接测试：设置 `DSH_HOME` 到临时目录，
动态 `import()` `lib/api.js`，然后调用 `dispatch(action, payload)`。
测试基础设施见 `test/helpers.mjs`，每个用例使用独立临时目录。

```bash
# 语法
for f in index.js client.js lib/*.js; do node --check "$f"; done

# 全部测试（15 个文件、159 项）
npm test

# 只跑某一组
node test/15-structure.mjs
```

Client 侧可在已连接的页面里通过 `cordis_inspect_query` 的 Slots 提供者检查座位：
`{ root: "sidebar.panellist" }`、`{ root: "main" }`。

排查客户端模块是否被登记时，可调用 `POST /mcmods-studio/api` 的 `debug.clientGraph` 动作，
它只返回客户端模块图中与本插件相关的条目名，不涉及任何用户数据。

## 8. 发版

完整流程见 [VERSION-PLAN.md](VERSION-PLAN.md) 第 3 节。最小检查单：

1. `npm test` 全绿；
2. 改 `package.json` 版本；
3. 写 `CHANGELOG.md` 新版本段；
4. 更新全部文档的「适用版本」与「更新日期」；
5. 更新 `VERSION-PLAN.md` 版本历史；
6. 提交并（Host 有改动时）重装 bundle 验证。
