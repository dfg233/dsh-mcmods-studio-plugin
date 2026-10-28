# 界面外壳模块计划

> 模块编号：10
> 适用插件版本：v0.1.3
> 代码位置：`client.js` 全文件（主题常量、通用组件、`StudioPage`、`SidebarStudioPanel`、`PathField`、`ensureStyles`、`studioState`、座位注册）
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 把插件挂到 DSH 的三个位置：左侧图标区、中央主面板、右侧栏标签；
- 提供统一视觉（主题变量、按钮悬停、卡片样式）；
- 提供通用表单组件与轻量 Markdown 渲染；
- 维护跨面板共享状态，让主面板与右侧栏联动；
- 提供目录选择器入口。

**不负责**：

- 业务数据读写（全部走 `call()` 到 Host）；
- 路由与页面切换（DSH 负责）；
- 国际化（当前仅中文）。

## 2. 数据与文件

### 2.1 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `API` | `/mcmods-studio/api` | 接口地址 |
| `KEY` | `mc-mod-studio` | 主面板 key / 侧栏 id / 右侧栏 tab id |
| `STYLE_ID` | `mcmods-studio-styles` | 注入样式的唯一 id |
| `CANVAS_COLUMNS/CELL_W/CELL_H` | 4 / 172 / 152 | 画布布局 |

### 2.2 主题常量

| 常量 | 内容 |
| --- | --- |
| `C` | `bg`、`layer`、`layer2`、`border`、`border2`、`text`、`muted`、`brand`、`danger`、`success`、`warn` |
| `S` | `page`、`header`、`title`、`subtitle`、`tabs`、`tab(active)`、`body`、`card`、`sectionTitle`、`row`、`btn(kind)`、`input`、`label`、`hint`、`badge(tone)`、`empty`、`table`、`th`、`td`、`overlay`、`modal*` |

全部映射到 DSH 的 `--dsw-alias-*` 变量，自动适配明暗主题。

### 2.3 跨面板状态（`studioState`）

```js
{ projectPath: string|null, itemId: string|null }
```

| 函数 | 作用 |
| --- | --- |
| `getStudioState()` | 读当前值 |
| `setStudioState(patch)` | 合并并通知所有订阅者 |
| `subscribeStudioState(fn)` | 订阅，返回取消函数 |

写入点：

| 位置 | 写入内容 |
| --- | --- |
| `useStudioData.open()` 成功后 | `{projectPath, itemId:null}` |
| 物品列表点「编辑」 | `{itemId}` |
| 画布卡片点击 | `{itemId}` |
| 关闭项目 | `{projectPath:null, itemId:null}` |

## 3. 事件

### 3.1 座位事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| DSH 加载插件 | `apply(ctx)` | 保存 `appCtx`、注入样式、注册三个座位 | 入口出现 |
| 点左侧「模组工坊」图标 | 侧栏按同名 key 派发 | 渲染 `main` 的 `StudioPage` | 进入主面板 |
| 打开右侧栏「开始」页 | `guide` 卡片渲染 | 显示「模组工坊」卡片 | 可点击打开标签 |
| 点右侧栏卡片 | 打开 tab | 渲染 `SidebarStudioPanel` | 显示项目概览 |
| 主面板选中物品 | `setStudioState({itemId})` | 通知订阅者 | 右侧栏更新 |
| 插件卸载 | disposer 执行 | 取消座位注册 | 入口消失 |

### 3.2 交互事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 鼠标悬停按钮 | `:hover` | 叠加 22% 中性灰 + 边框变亮 | 与 DSH 原生按钮一致 |
| 按下按钮 | `:active` | 灰 32% + 下沉 1px | 点击反馈 |
| 键盘 Tab 聚焦 | `:focus-visible` | 品牌色焦点环 | 无障碍 |
| 点「浏览…」 | `pickFolder()` | `uiWorkspace.pickDirectory()` | 返回路径或 `null` |
| 选择器取消 | 返回 `null` | `PathField` 显示提示 | 引导手动填写 |

### 3.3 异常事件

| 场景 | 处理 |
| --- | --- |
| `slots` 服务不可用 | `apply` 直接返回，不注册任何座位 |
| `sidebarRightTabs` 不可用 | 右侧栏注册块 try/catch，回滚已注册项 |
| `uiWorkspace` 不可用 | `pickFolder` 返回 `null`，提示手动输入 |
| 组件渲染抛错 | 由 DSH 的错误边界处理（插件不做兜底） |

## 4. 运行过程

### 4.1 注册与卸载

```text
DSH 加载插件
   │
   ▼
window.__ModuleLoader__.load({ id, factory })
   │  factory(require) 执行：定义组件、返回 { inject:['slots'], apply }
   ▼
apply(ctx)
   │  ① appCtx = ctx
   │  ② ensureStyles() —— 注入 <style id="mcmods-studio-styles">
   │  ③ slots = ctx.slots || ctx.get('slots')；无则 return
   │  ④ slots.inject('main', () => slots.register({name:'main', key:KEY}, StudioPage))
   │  ⑤ slots.inject('sidebar.panellist', () => slots.register({name, id:KEY, order:2, label:'模组工坊'}, Icon))
   │  ⑥ ctx.inject(['sidebarRightTabs'], sub => {
   │        tabs.register({ id:KEY, kind:KEY, title, guide:[{order:30,title,description,icon}] })
   │        sub.slots.inject('sidebar.right.pane.tab', () => register({key:KEY}, SidebarStudioPanel))
   │      })
   ▼
卸载时：各 inject/register 返回的 disposer 依次执行
```

### 4.2 主面板渲染

```text
StudioPage()
   │  useStudioData() → boot / project / assets / settings
   │  tab 状态（project / features / items / assets / guide / settings）
   ▼
头部：图标 + 标题 + 项目摘要（名称 · modid · 加载器 · MC 版本）
   │
   ▼
Tabs（左侧页签 + 最右侧齿轮）→ 对应 Tab 组件
   │  project → ProjectTab
   │  features → FeaturesTab
   │  items → ItemsTab
   │  assets → AssetsTab
   │  guide → GuideTab
   │  settings → SettingsTab（规划，v0.2）
   ▼
弹窗层：CreateProjectModal / ImportProjectModal / ImportConfirmModal / ProjectDetailModal / FeatureEditor / ItemEditor
```

### 4.3 右侧栏联动

```text
主面板 open(path)
   │  setStudioState({projectPath:path, itemId:null})
   ▼
SidebarStudioPanel 订阅回调
   │  setState({...getStudioState()})
   ▼
useEffect([state.projectPath])
   │  call('project.open', {path}) → setData
   ▼
渲染：项目概览卡（名称/modid/加载器/版本/物品数/功能数）
   │  若 state.itemId 有值 → 选中物品卡（ID/堆叠/耐久/画布/标签/描述）
   │  否则 → 「在主面板点选一个物品」
```

## 5. 接口

外壳本身不定义接口，只封装 `call(action, payload)`：

| 行为 | 说明 |
| --- | --- |
| 统一 POST | `Content-Type: application/json` |
| 统一解包 | `ok:true` 返回 `data`；否则抛 `Error(error)` |
| 解析失败 | 抛「响应解析失败」 |

## 6. 前端组件

### 6.1 通用组件

| 组件 | props |
| --- | --- |
| `Icon` | `{size, active}` |
| `GearIcon` | `{size, active}`（规划，设置入口） |
| `Modal` | `{title, onClose, footer, children}` |
| `Field` | `{label, required, hint, children}` |
| `TextInput` / `NumberInput` / `Textarea` | `{value, onChange, placeholder}` |
| `Select` | `{value, onChange, options[]}` |
| `Toggle` | `{value, onChange}` |
| `TagsInput` | `{value, onChange, placeholder}` |
| `Tabs` | `{tabs, value, onChange, right?}` |
| `Markdown` / `renderInline` | `{text}` / `(text)` |
| `PathField` | `{label, value, onChange, required, hint, placeholder}` |
| `InfoRow` | `{label, value}` |

### 6.2 页面组件

| 组件 | 职责 |
| --- | --- |
| `StudioRoot` | `StudioBoundary` + `StudioPage`；渲染异常时显示重试 / 刷新 |
| `StudioPage` | 页面框架、页签、弹窗挂载 |
| `ProjectTab` / `FeaturesTab` / `ItemsTab` / `AssetsTab` / `GuideTab` | 五个页签 |
| `SettingsTab` | 设置页（规划，v0.2）：启动、物品页、数据、Agent、关于 |
| `CreateProjectModal` / `ImportProjectModal` | 项目新建 / 导入弹窗 |
| `ImportConfirmModal` / `ProjectDetailModal` | 导入差异确认 / 项目详情 |
| `FeatureEditor` / `ItemEditor` | 内容编辑弹窗 |
| `SidebarStudioPanel` | 右侧栏面板（项目概览、选中物品、缺失素材数） |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 重复加载 | 样式按 id 去重，不会重复注入 |
| 座位 key 冲突 | 同 key 注册会替换原占用者（DSH 语义） |
| 右侧栏服务缺失 | 只跳过右侧栏，主面板与图标区照常 |
| 极窄侧栏 | 图标区按 `size` 缩放，文字不显示 |
| 主题切换 | 全部颜色来自 CSS 变量，自动跟随 |
| 订阅未清理 | `subscribeStudioState` 返回取消函数，组件卸载时调用 |

## 8. 现状与缺口

**已实现**：三处座位注册与卸载、主题化样式、按钮悬停/按下/聚焦、跨面板状态、目录选择器、路径字段组件、轻量 Markdown、导入两步确认与项目详情弹窗、物品页校验条与右侧栏缺失素材统计、`StudioRoot` 错误边界、物品/构想编辑器草稿恢复与离开提示。

**已知缺口**：

- 无移动端/窄屏适配（画布与表格在窄屏会溢出）；
- 无快捷键（如 Ctrl+S 保存）；
- 无全局 toast，错误只在页内错误条显示；
- 无加载骨架屏，`boot` 期间只显示「正在加载…」；
- 右侧栏不提供操作按钮（只能看，不能改）；
- 无主题内自定义（用户无法调整插件配色）；
- 无设置页（规划中，见 [SETTINGS-PLAN.md](SETTINGS-PLAN.md)）；
- `studioState` 只在内存，刷新后右侧栏需等主面板重新打开项目。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础（接口与 `dispatch`） |
| 承载 | 02–09 的全部页面与交互 |
| 协同 | 11 代码工作区（将来新增「代码」页签，复用本模块的组件与样式） |
| 协同 | 13 设置与偏好（规划：页签栏齿轮入口 + `SettingsTab`，复用 `Tabs.right` 与样式） |
