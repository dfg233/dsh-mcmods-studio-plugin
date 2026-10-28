# 设置与偏好模块计划

> 模块编号：13
> 适用插件版本：v0.1.1
> 目标版本：v0.2.0（讨论稿，尚未实现）
> 代码位置：拟新增 `lib/settings.js`；修改 `client.js`（`GearIcon`、`Tabs`、`SettingsTab`）、`lib/api.js`、`lib/entries.js`、`lib/tools.js`
> 状态：**规划中（未实现）**
> 最后更新：2026-10-28

## 0. 一句话结论

在页签栏最右侧增加一个齿轮按钮，打开一个**全局设置页**：管理启动行为、物品页默认视图、删除物品时的素材策略，以及 Agent 工具默认项目；页脚提供版本与运行数据等只读「关于」信息。

设置存放在 `$DSH_HOME/mcmods-studio/settings.json`，不属于任何模组工程，不写入 `.mcstudio/`。

## 1. 模块职责

**负责**：

- 提供页签栏最右侧的齿轮入口；
- 读写插件级全局偏好，并校验非法值；
- 把偏好应用到启动流程、物品页、删除物品与 Agent 工具；
- 提供「恢复默认」；
- 展示只读的插件版本、数据目录、项目数、工具数、动作数等诊断信息。

**不负责**：

- 项目级配置（项目名、modid、加载器等仍属于 `project.json`）；
- 主题编辑、快捷键、国际化（后续版本再议）；
- 导入、校验、代码生成规则本身；
- 多用户、权限与云同步（本插件是单机单用户工具）；
- 修改 DSH 自身的配置（那是 DSH 设置页的职责）。

## 2. 数据与文件

### 2.1 文件位置

```text
$DSH_HOME/mcmods-studio/
├── registry.json          # 已有：项目注册表、默认扫描根目录、上次打开
├── settings.json          # 新增：插件级全局偏好
└── ...
```

- `$DSH_HOME` 未设置时回退 `~/.dsh`，与注册表一致；
- 不写入模组工程目录，不污染 `.mcstudio/`；
- 文件不存在 = 全部使用默认值，不视为错误。

### 2.2 文件格式

```json
{
  "schemaVersion": 1,
  "restoreLastProject": true,
  "defaultTab": "project",
  "defaultItemsView": "list",
  "deleteAssetsWithItem": true,
  "defaultProject": "",
  "updatedAt": "2026-10-28T07:40:00.000Z"
}
```

### 2.3 字段与默认值

| 字段 | 类型 | 默认值 | 生效位置 | 说明 |
| --- | --- | --- | --- | --- |
| `restoreLastProject` | boolean | `true` | `useStudioData` 启动流程 | 启动时恢复上次项目；关掉后启动停在项目列表，不自动打开任何项目 |
| `defaultTab` | enum | `"project"` | `StudioPage` 启动自动打开后 | 可选 `project` / `features` / `items` / `assets` / `guide`；只在启动自动打开时应用，手动打开项目不跳页 |
| `defaultItemsView` | enum | `"list"` | `ItemsTab` 初始状态 | 可选 `list` / `canvas`；只影响首次进入物品页，切换后的视图不写回设置 |
| `deleteAssetsWithItem` | boolean | `true` | 删除物品动作与工具 | `true` 保持现状，同时删贴图/模型/blockstate；`false` 只删物品条目，素材留在磁盘 |
| `defaultProject` | string | `""` | `resolveProject`（Agent 工具） | 空字符串表示「自动」：注册表第一个可用项目；非空必须是已登记项目路径 |
| `schemaVersion` | number | `1` | 读取/迁移 | 设置文件结构版本，与插件版本、项目 `schemaVersion` 都无关 |
| `updatedAt` | string | — | 写入时自动 | ISO 时间，仅供诊断，不参与比较 |

**为什么默认值与现状一致**：升级到带设置页的版本后，用户不打开设置页也应保持原有行为，不产生「升级后项目不自动打开了」这类意外。

### 2.4 读取与校验

读取顺序：

1. 文件不存在 → 返回全部默认值；
2. JSON 解析失败或根不是对象 → 返回全部默认值，不抛错；
3. 逐字段校验：类型或枚举不合法 → 该字段回退默认值；
4. `defaultProject` 做 `~` 展开与绝对路径化；`settings.js` 本身不读注册表，「是否已登记」由 `settings.save` 路由写盘前校验（见 5.2）。

写入时（`settings.save`）：

- 只接受白名单字段，未知字段忽略；
- `boolean` 只接受真正的布尔值；
- `defaultTab` / `defaultItemsView` 只接受枚举值，非法值直接报错；
- `defaultProject` 非空时必须能在注册表里找到，否则报错：「默认项目必须是已登记项目」；
- 合并写入，未提供的字段保持当前值；
- 写入失败返回错误，不静默吞掉。

### 2.5 为什么不放注册表 / 项目 / DSH Config

| 方案 | 不采用的原因 |
| --- | --- |
| 塞进 `registry.json` | 注册表语义是「有哪些项目」，偏好混进去会让迁移与备份边界不清楚 |
| 写进 `.mcstudio/project.json` | 偏好是全局的，换项目后不该变化；而且没有项目时也要能改 |
| 用 DSH 插件 Config | 那是 Cordis 启动配置，改一次通常要重载插件；不适合运行期频繁切换的界面偏好 |
| 浏览器 `localStorage` | 换浏览器/换 DSH 端口就丢，Agent 侧也读不到；且与「事实只有一份」冲突 |

独立 `settings.json` 最小、可备份、可手改，也方便 Host 与 Agent 共用同一份事实。

### 2.6 关于/诊断数据（只读）

`settings.get` 额外返回：

```json
{
  "about": {
    "pluginVersion": "0.1.1",
    "pluginRoot": "D:\\program\\dsh-mcmods-studio-plugin",
    "dataDir": "C:\\Users\\<user>\\.dsh\\mcmods-studio",
    "registryPath": "...\\registry.json",
    "projectCount": 3,
    "toolCount": 21,
    "actionCount": 37,
    "mcVersion": "1.20.1"
  }
}
```

- `pluginVersion` 运行时读 `package.json`，不硬编码，避免出现第二份版本真相；
- 项目数取注册表长度，工具/动作数取 `listTools()` / `listActions()` 的长度；
- 这些值只展示，不允许通过设置页修改。

## 3. 事件

### 3.1 用户事件

| 触发 | 处理 | 结果 |
| --- | --- | --- |
| 点页签栏最右侧齿轮 | `setTab('settings')` | 内容区显示设置页，齿轮高亮，普通页签全部非激活 |
| 在设置页切换开关/下拉 | `settings.save({patch})` | 立即写入并更新本地状态，显示「已保存」 |
| 点「恢复默认」 | 二次确认后 `settings.reset()` | 回到默认值，页面同步刷新 |
| 从设置页点任意普通页签 | `setTab(对应 id)` | 齿轮取消高亮，进入对应页面 |
| 设置页内切换「默认页签」 | 只写设置 | 不立即跳页，下次启动生效；界面用提示说明 |
| 设置页内切换「默认项目」 | 下拉选择已登记项目或「自动」 | 只影响后续 Agent 工具调用，不影响当前打开的项目 |

### 3.2 系统事件

| 事件 | 处理 |
| --- | --- |
| 插件 `boot` | 读取 settings 并随 boot 返回，客户端不再额外请求一次 |
| 打开设置页 | `settings.get` 拉取 about 与最新设置（防止多窗口/手改文件后过期） |
| 启动时 `restoreLastProject=true` | 优先上次项目，失效则第一个可用项目 |
| 启动时 `restoreLastProject=false` | 不自动打开，`project=null`，停在项目页 |
| 启动自动打开成功 | 按 `defaultTab` 切页；该页需要项目但项目为空时回退 `project` |
| 删除物品 | 按 `deleteAssetsWithItem` 决定是否连带删除素材，确认框文案同步变化 |
| Agent 工具未传 `project` | 优先 `defaultProject`，失效或为空时回退注册表第一个可用项目 |
| 设置文件被手改 | 下次 `settings.get` / 重启后按文件内容生效，不做文件监听 |

### 3.3 异常事件

| 场景 | 行为 |
| --- | --- |
| `settings.json` 损坏 | 读取按默认值继续，设置页顶部提示「设置文件解析失败，当前使用默认值」 |
| 写盘失败（权限/磁盘） | 页面保留旧值并显示错误，不假装保存成功 |
| 枚举值非法 | `settings.save` 报错，文件不写 |
| `defaultProject` 不在注册表 | 保存报错；读取时该值仍保留在文件里，但 `resolveProject` 视为空并回退 |
| 默认项目目录被删除 | 工具回退第一个可用项目；设置页下拉显示「自动（原项目不可用）」 |
| 两个窗口同时保存 | 最后写入者生效，无冲突检测；设置项少、单用户，暂不引入 revision |

## 4. 运行过程

### 4.1 启动时序

```text
浏览器加载 StudioPage
   │
   ▼
useStudioData.refreshBoot()
   │  POST boot
   ▼
Host: readRegistry() + readSettings()
   │  返回 { registry, schema, settings, ... }
   ▼
useStudioData 初始化
   │  settings = data.settings
   │
   ├─ restoreLastProject = false
   │     └→ 不调用 open()，project 保持 null
   │
   └─ restoreLastProject = true
         ├─ lastProject 有效且未 missing → open(last)
         ├─ 否则第一个未 missing 项目 → open(first)
         └─ 没有项目 → 不打开
   │
   ▼
open() 成功后
   │  setTab(settings.defaultTab)
   │  若 defaultTab 需要项目但 project 为空 → 'project'
   ▼
渲染对应页签
```

### 4.2 设置页保存时序

```text
用户改动控件
   │
   ▼
SettingsTab 先做本地乐观更新（可选）
   │
   ▼
call('settings.save', { patch })
   │
   ├─ 校验失败 → 回滚控件值 + 显示错误
   └─ 成功 → setSettings(result.settings) + 显示「已保存」
   │
   ▼
后续行为读取最新 settings（启动/删除/工具调用时）
```

### 4.3 偏好生效点

| 设置 | 读取方 | 生效时机 |
| --- | --- | --- |
| `restoreLastProject` | `useStudioData` | 下次启动 / 重新加载页面 |
| `defaultTab` | `StudioPage` | 下次启动自动打开项目后 |
| `defaultItemsView` | `ItemsTab` | 下次进入物品页（组件重新挂载） |
| `deleteAssetsWithItem` | `project.delete` 动作、`item_delete` 工具 | 下一次删除物品 |
| `defaultProject` | `resolveProject`（`lib/tools.js`） | 下一次未显式传 `project` 的工具调用 |

设置页本身只负责写事实，不直接改其他组件的内部状态；这样每条偏好的生效点只有一个，行为可预测。

### 4.4 删除物品时的素材策略

```text
删除物品
   │  API / 工具读取 settings.deleteAssetsWithItem
   ▼
deleteItem(projectPath, id, { deleteAssets })
   │
   ├─ true  → 删除 items/<id>.json + 贴图 + 模型 + blockstate（现状）
   └─ false → 只删除 items/<id>.json，素材文件保留
   ▼
rebuildSummary()
```

- `lib/entries.js` 的 `deleteItem` 增加可选第三参 `{ deleteAssets = true }`，默认保持旧行为，现有测试不受影响；
- 调用方（`lib/api.js`、`lib/tools.js`）负责读设置并传入，低层函数不直接读全局设置；
- 前端删除确认框文案按设置变化：「同时删除贴图/模型」或「保留素材文件」。

### 4.5 Agent 默认项目解析

```text
工具调用未传 project
   │
   ▼
resolveProject(undefined)
   │  settings.defaultProject 非空且仍登记 → 用它
   │  否则注册表第一个未 missing 项目
   ▼
执行工具
```

- 显式传 `project` 时永远优先显式值；
- `defaultProject` 只影响「省略 project」的调用，不改变工具签名；
- 这样 agent 可以固定操作一个工程，避免多项目时误写第一个。

## 5. 接口

### 5.1 动作表

新增 3 个动作，动作总数 37 → 40；均不需要项目路径，`scope: 'none'`。

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `settings.get` | `{}` | `{settings, defaults, about}` | 读设置 + 默认值 + 只读诊断 |
| `settings.save` | `{patch}` | `{settings}` | 合并保存，返回规范化后的完整设置 |
| `settings.reset` | `{}` | `{settings}` | 写回默认值 |

`boot` 返回新增 `settings` 字段（只含设置值，不含 `about`），避免客户端启动时多一次请求。

### 5.2 错误文案

| 场景 | 文案 |
| --- | --- |
| `defaultTab` 非法 | `defaultTab 只能是 project / features / items / assets / guide` |
| `defaultItemsView` 非法 | `defaultItemsView 只能是 list / canvas` |
| 布尔字段类型错 | `<字段名> 必须是布尔值` |
| 默认项目未登记 | `默认项目必须是已登记项目：<path>` |
| 写盘失败 | `设置保存失败：<系统错误>` |

### 5.3 不新增 Agent 工具

- 设置是给人用的偏好，不是 agent 的高频业务动作；
- Agent 已经可以通过 `project` 参数显式指定项目；`defaultProject` 只是省略时的兜底；
- 若以后 agent 需要读设置，可复用 `settings.get` 的 HTTP 动作，或到时再加 `settings_get` 工具；
- 因此本模块**不增加工具数**（仍为 21），只增加 3 个 HTTP 动作。

## 6. 前端组件

### 6.1 入口布局

齿轮放在页签栏最右侧，与「项目 / 构想 / 物品 / 贴图与模型 / 构建教程」同一行：

```text
┌──────────────────────────────────────────────────────────────┐
│ 模组工坊  示例模组 · examplemod · neoforge · MC 1.20.1  [导出] │
├──────────────────────────────────────────────────────────────┤
│ 项目   构想   物品   贴图与模型   构建教程              ⚙ 设置 │
├──────────────────────────────────────────────────────────────┤
│ 设置页内容                                                    │
└──────────────────────────────────────────────────────────────┘
```

- 齿轮是方形图标按钮，不显示文字；`title` 与 `aria-label` 均为「设置」；
- `tab === 'settings'` 时齿轮使用激活背景（`C.layer2` + 边框），普通页签全部非激活；
- 页签多到放不下时，左侧页签区横向滚动，齿轮固定在右侧不滚动；
- 设置页不是 `tabs[]` 中的普通页签，不出现在页签列表里，只由齿轮进入。

### 6.2 `GearIcon`

```js
GearIcon({ size = 16, active })
```

- 24×24 `viewBox`，`stroke` 取 `active ? C.brand : C.muted`；
- 只用线条，不引第三方图标库；
- 与现有 `Icon` 分开：`Icon` 是插件品牌图标，`GearIcon` 是操作图标。

### 6.3 `Tabs` 改造

```js
Tabs({ tabs, value, onChange, right })
```

| prop | 说明 |
| --- | --- |
| `tabs` | 原有页签数组 |
| `value` / `onChange` | 原有选中值与回调 |
| `right` | 新增：右侧固定区域节点（设置页传齿轮按钮） |

结构调整：

```text
S.tabs（flex 行，align-items:center）
├─ S.tabList（flex:1, min-width:0, overflow-x:auto）→ 普通页签
└─ S.tabRight（flex:none, margin-left:8）→ right 节点
```

不传 `right` 时行为与现在完全一致，其他调用点无需修改。

### 6.4 `SettingsTab`

```js
SettingsTab({ boot, settings, about, onSave, onReset, onReload })
```

页面分四组卡片：

| 分组 | 控件 | 说明 |
| --- | --- | --- |
| 启动 | `Toggle` 恢复上次项目；`Select` 默认页签 | 说明「下次启动生效」 |
| 物品页 | `Select` 默认视图：列表 / 画布 | 说明「下次进入物品页生效」 |
| 数据 | `Toggle` 删除物品时同时删除素材 | 副提示说明保留素材会留下孤儿文件 |
| Agent | `Select` 默认项目：自动 / 已登记项目列表 | 说明「仅影响省略 project 的工具调用」 |
| 关于 | 只读 `InfoRow`：版本、插件目录、数据目录、注册表、项目数、工具/动作数 | 底部「恢复默认」按钮 |

交互细节：

- 开关/下拉改动即保存（防抖 300ms 可选）；保存中禁用控件，避免连点；
- 保存成功在分组标题旁显示「已保存」，2 秒后淡出；
- 保存失败回滚控件并显示页内错误条，复用现有 `S.error` 风格；
- 「恢复默认」需要 `window.confirm` 二次确认；
- 没有项目时设置页仍可打开，只有「默认项目」下拉为空并提示「暂无已登记项目」。

### 6.5 样式

新增：

| 名称 | 内容 |
| --- | --- |
| `S.tabList` | 页签容器：`flex:1, minWidth:0, overflowX:auto, display:flex, gap:4` |
| `S.tabRight` | 右侧固定区：`flexShrink:0, display:flex, alignItems:center, marginLeft:8` |
| `S.gear(active)` | 齿轮按钮：28×28、圆角 7、透明背景、激活时 `C.layer2` + `C.border` |
| `S.settingRow` | 设置行：左文右控件，`justifyContent:space-between`，底部细分割线 |
| `S.settingHint` | 行内说明：12px、`C.muted`，最多两行 |

`S.tabs` 从「单层 flex + overflowX」改为「外层行 + 内层滚动」，视觉不变。

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 设置文件不存在 | 默认值，设置页正常显示，不提示错误 |
| 设置文件损坏 | 默认值 + 顶部警告；用户保存一次即可覆盖修复 |
| 旧版本设置文件缺字段 | 缺的字段用默认值补齐，不迁移、不丢已有字段 |
| 新版本设置文件多字段 | 忽略未知字段，不报错 |
| `defaultProject` 指向已移除项目 | 工具回退第一个可用项目；设置页显示「自动（原项目不可用）」 |
| `deleteAssetsWithItem=false` | 允许留下孤儿素材；缺失统计会继续把它们算作「无对应物品」的素材 |
| 无项目时打开设置页 | 允许；关于区显示项目数 0，Agent 默认项目下拉为空 |
| 快速连点开关 | 保存中禁用控件，最后一次请求为准 |
| 手动编辑 `settings.json` | 不监听；下次 `settings.get` 或重启后生效 |
| 页面刷新 | 设置保存在 Host 文件里，不丢 |
| 多窗口同时改 | 最后写入者生效；不引入 revision，避免过度设计 |
| 设置页自身报错 | 只影响设置页，不阻塞项目页/物品页 |

## 8. 现状与缺口

**当前状态**：仅规划，未写代码。动作数仍为 37，工具数仍为 21，测试数仍为 159。

**实现清单（建议顺序）**：

1. `lib/settings.js`：默认值、读写、校验、`about` 数据；
2. `lib/api.js`：`settings.get/save/reset`，`boot` 加 `settings`；
3. `lib/entries.js`：`deleteItem` 增加 `{deleteAssets}` 可选参数；
4. `lib/api.js` / `lib/tools.js`：删除物品时读设置并传参；`resolveProject` 支持 `defaultProject`；
5. `client.js`：`GearIcon`、`Tabs.right`、`SettingsTab`、启动流程接设置；
6. `test/16-settings.mjs` + `test/12-render.mjs` 补齿轮与设置页渲染用例；
7. 文档回填：动作 40、设置文件格式、INDEX 组件表、STATUS 状态。

**测试计划**：

| 用例 | 断言 |
| --- | --- |
| 文件不存在 | 返回全默认值 |
| 保存合并 | 只改一个字段，其他字段不变 |
| 非法枚举 | 报错且文件不写 |
| 默认项目未登记 | 报错 |
| 恢复默认 | 文件与返回值均为默认值 |
| 损坏文件 | 回退默认值且可再次保存 |
| `boot` | 含 `settings` |
| 删除物品保留素材 | `deleteAssetsWithItem=false` 时贴图/模型仍在 |
| 默认项目生效 | 工具未传 `project` 时使用 `defaultProject` |
| 渲染 | 页签栏存在齿轮；点击后出现「设置」与「恢复默认」 |

**待确认的决策**：

- **D1 设置项范围**：推荐先做 5 项（启动恢复、默认页签、物品默认视图、删除素材策略、Agent 默认项目）+ 关于；
  暂不做「打开项目自动刷新结构」「界面密度」「删除二次确认」等第二梯队项。
- **D2 保存方式**：推荐**改动即保存**，控件旁提示「已保存」；备选是底部统一「保存 / 放弃」按钮。
- **D3 版本归属**：设置页是用户可见新能力，按 [VERSION-PLAN.md](../VERSION-PLAN.md) 应进 **v0.2.0**。
  推荐与关系视图同属 v0.2.0，先实现设置页、后做关系视图，阶段完成后再发版；
  不建议塞进 v0.1.x 的 PATCH。
- **D4 作用域**：推荐**仅全局**；不做项目级覆盖，避免「这个项目为什么和那个项目默认页不同」的解释成本。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础（`dataDir`、`expandPath`、`readJson`/`writeJson`） |
| 承载 | 10 界面外壳（页签栏、`Tabs`、样式、`StudioPage`） |
| 影响 | 02 项目管理（启动恢复）、06 物品管理（默认视图、删除素材）、12 Agent 接入（默认项目） |
| 数据 | 新增 `settings.json`，与 `registry.json` 同目录 |
| 文档 | [SHELL-PLAN.md](SHELL-PLAN.md)、[DATA-FORMAT.md](../DATA-FORMAT.md)、[AGENT-PLAN.md](AGENT-PLAN.md)、[INDEX.md](../INDEX.md) |
