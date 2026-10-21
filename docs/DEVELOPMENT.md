# 开发文档

## 1. 插件形态

本插件是一个 DSH **持久化 bundle**，由两半组成：

| 半 | 入口 | 运行环境 | 职责 |
| --- | --- | --- | --- |
| Host | `index.js` | Node（DSH 进程内） | 文件读写、项目数据、文档导出、HTTP API |
| Client | `client.js` | 浏览器（Web UI） | 页面渲染、表单交互 |

`package.json` 声明：

- `dsh.bundle.patch` → `cordis.patch.yml`：安装时把插件行插入 Loader 配置；
- `dsh.client` → `./client.js`：Web 端加载浏览器模块。

## 2. 安装与调试

在 DSH 中用插件管理器安装本地目录：

```text
plugin_manager install_bundle  target: D:\program\dsh-mcmods-studio-plugin
```

安装后：

- 侧栏出现「模组工坊」图标，点击打开中央页面；
- Host 路由 `POST /mcmods-studio/api` 生效；
- 改动代码前先查 [代码索引](INDEX.md)，按「文件 → 函数 → 参数 → 返回」定位；
- 若修改了 Host 代码，需要重装 bundle（或重启 DSH）才能加载新的 JavaScript 模块代；
- 若只改 Client 代码，通常刷新页面即可；开发时建议同时运行 `pnpm run dev:web` 以获得 HMR。

## 3. 代码结构

```text
dsh-mcmods-studio-plugin/
├── package.json          # 清单：bundle patch + client 声明
├── cordis.patch.yml      # Loader 补丁：插入 mc-mod-studio 行
├── index.js              # Host 入口：注册 HTTP 路由
├── client.js             # Client 入口：注册侧栏图标与主页面
├── lib/
│   ├── registry.js       # 注册表、路径工具、原子写文件
│   ├── project.js        # 项目数据、字段定义、扫描与导入
│   ├── assets.js         # 贴图 PNG 校验、模型 JSON
│   ├── docs.js           # Markdown 导出
│   └── api.js            # 动作分派（HTTP 的唯一入口）
├── locale/
│   ├── zh.json           # 插件显示名与描述（中文）
│   └── en.json           # 英文回退
├── docs/                 # 本项目文档（本文件即在此）
└── icon.svg              # 插件图标
```

## 4. 数据流

```text
浏览器页面
   │  fetch POST /mcmods-studio/api  { action, payload }
   ▼
index.js（Host 路由）
   │  dispatch(action, payload)
   ▼
lib/api.js ──► lib/project.js / lib/assets.js / lib/docs.js
   │
   ▼
<project>/.mcstudio/  与  <project>/src/main/resources/assets/
```

- Host 半不缓存状态，所有数据以文件为准；
- Client 半只保存界面状态（当前项目、当前页签、编辑中的草稿）。

## 5. 如何扩展

### 新增一个物品属性字段

1. 在 `lib/project.js` 的 `ITEM_FIELDS` 中增加一条定义（`key`、`label`、`type`、`group`、`default`、`hint`）；
2. 若需要新的输入控件类型，在 `client.js` 的 `renderField()` 中加分支；
3. 文档导出会自动包含新字段（`lib/docs.js` 按 `ITEM_FIELDS` 遍历）。

### 新增一个 API 动作

1. 在 `lib/api.js` 的 `actions` 对象里增加 `'域.动作'(payload) { ... }`；
2. 在 `client.js` 中用 `call('域.动作', payload)` 调用；
3. 动作返回可 JSON 序列化的数据，抛错会被统一包装为 `{ ok: false, error }`。

### 修改页面

`client.js` 是单文件 React（`createElement`）实现，组件划分：

- `StudioPage`：页面框架与状态；
- `ProjectTab` / `FeaturesTab` / `ItemsTab` / `AssetsTab` / `GuideTab`：五个视图；
- `ItemEditor` / `FeatureEditor` / `CreateProjectModal` / `ImportProjectModal`：弹窗。

样式全部使用 DSH 主题变量（`--dsw-alias-*`），不硬编码颜色，自动适配明暗主题。

## 6. 约定

- 所有文件读写都在 Host 侧完成，Client 不直接触碰文件系统；
- 项目路径必须存在且是工坊项目，才允许读写业务数据；
- 新建/导入项目会被限制在「扫描根目录」以内；
- 所有界面文案为中文，不引入 i18n 运行时；
- v0.1.0 不生成 gradle / Java 代码；v0.2 起通过 `lib/codegen.js` 生成带注释标记的 Java 与资源 JSON，只替换标记区间，不覆盖手写代码（见 [PLAN.md](PLAN.md)）；
- 侧栏入口只注册图标区：`sidebar.panellist`（与「插件市场」「费用统计」「上下文洞察」同一区域，`order: 2`），点击后由侧栏按同名 key 打开 `main` 里的 `mc-mod-studio` 面板；不再注册底部 `sidebar.footer.action`。
- 右侧栏标签页：`ctx.inject(['sidebarRightTabs'], ...)` 注册 `id/kind = mc-mod-studio` 的标签类型（含「开始」页引导卡片），并注册 `sidebar.right.pane.tab`（key 同名）渲染 `SidebarStudioPanel`；面板通过模块级 `studioState`（`projectPath` / `itemId`）与主面板联动，数据用 `project.open` 读取。

## 7. 本地测试

Host 层可以脱离 DSH 直接测试：设置 `DSH_HOME` 到临时目录，
动态 `import()` `lib/api.js`，然后调用 `dispatch(action, payload)`。
示例脚本见开发记录（`docs/` 之外，避免污染发布物）。

Client 侧可在已连接的页面里通过 `cordis_inspect_query` 的 `Slots` 提供者检查座位：
`{ root: "sidebar.panellist" }`、`{ root: "main" }`。

排查客户端模块是否被登记时，可调用 `POST /mcmods-studio/api` 的 `debug.clientGraph` 动作，
它只返回客户端模块图中与本插件相关的条目名，不涉及任何用户数据。
