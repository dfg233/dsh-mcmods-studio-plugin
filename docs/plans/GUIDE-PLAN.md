# 构建教程模块计划

> 模块编号：09
> 适用插件版本：v0.1.1
> 代码位置：`lib/api.js` 的 `readGuide`/`guide` 动作与 `boot` 的 `guide` 字段；`client.js` 的 `GuideTab`、`Markdown`、`renderInline`；内容文件 `docs/BUILD-GUIDE.md`
> 状态：已实现
> 最后更新：2026-10-28

## 1. 模块职责

**负责**：

- 在插件内展示 Minecraft 1.20.1 三种加载器的 IDEA 构建流程；
- 把插件自带的 Markdown 文件读出来给前端渲染；
- 前端提供一个轻量 Markdown 渲染器，不引入第三方库。

**不负责**：

- 实际执行构建（不调用 gradlew、不编译）；
- 校验用户的 JDK / Gradle 环境；
- 生成工程骨架。

## 2. 数据与文件

### 2.1 内容来源

| 候选路径 | 说明 |
| --- | --- |
| `<插件目录>/docs/BUILD-GUIDE.md` | 首选 |
| `<插件目录>/docs/构建教程.md` | 兼容旧命名 |

读取失败返回空字符串，不抛错。

### 2.2 传输方式

| 场景 | 字段 |
| --- | --- |
| 首屏 `boot` | `data.guide`（字符串） |
| 单独刷新 | `guide` 动作 → `{text}` |

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 点「构建教程」页签 | `GuideTab` 渲染 | 使用 `boot.guide` | 显示 Markdown |
| 点击文档内链接 | 浏览器默认行为 | 外链新窗口打开 | 离开插件页面 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 插件加载 | `setPluginRoot(here)` | 记录插件目录 | 后续可定位文档 |
| `boot` 执行 | `readGuide()` | 读文件 | 内容随首屏返回 |
| 文件缺失 | `fsp.readFile` 失败 | 返回 `''` | 页面显示空内容 |
| 更新文档后 | 刷新页面 | 重新 `boot` | 新内容生效（无需重装） |

## 4. 运行过程

```text
用户点「构建教程」
   │  boot.guide 已在首屏拿到
   ▼
GuideTab({ guide })
   │  guide 为空 → 显示「暂无教程」
   │  否则 → h(Markdown, { text: guide })
   ▼
Markdown 渲染
   │  ① 按行扫描
   │  ② 识别标题（# / ## / ###）
   │  ③ 识别列表（- / 1.）
   │  ④ 识别代码块（``` 包裹，等宽字体）
   │  ⑤ 识别表格（| 分隔，渲染为 table）
   │  ⑥ 识别引用（>）
   │  ⑦ 其余按段落，行内交给 renderInline
   ▼
renderInline
   │  · `code` → <code>
   │  · **粗体** → <strong>
   │  · 链接 [文字](地址) → <a target=_blank>
```

### 4.1 读取链路

```text
index.js  setPluginRoot(dirname(fileURLToPath(import.meta.url)))
   │
   ▼
api.js    readGuide()
   │  join(pluginRoot, 'docs', 'BUILD-GUIDE.md')
   │  失败则 join(pluginRoot, 'docs', '构建教程.md')
   ▼
返回文本（可能为空串）
```

## 5. 接口

| action | payload | 返回 |
| --- | --- | --- |
| `guide` | — | `{text}` |
| `boot`（内含） | — | `data.guide` |

## 6. 前端组件

| 组件 | props | 职责 |
| --- | --- | --- |
| `GuideTab` | `{guide}` | 容器，空态处理 |
| `Markdown` | `{text}` | 块级渲染（标题/列表/代码/表格/引用/段落） |
| `renderInline` | `(text)` | 行内 code、粗体、链接 |

支持的语法有限，仅覆盖 `BUILD-GUIDE.md` 实际用到的部分；不支持嵌套列表、图片、HTML 片段。

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 两个候选文件都不存在 | 返回 `''`，页面显示空态 |
| 文件编码非 UTF-8 | 可能乱码（按 utf8 读取） |
| 文档含未支持的语法 | 按普通段落显示，不报错 |
| 文档过大 | 无限制（当前约 4KB） |
| 插件目录变化（重装） | `setPluginRoot` 每次加载重新注入 |

## 8. 现状与缺口

**已实现**：内置 Markdown 读取、双路径兼容、轻量渲染、首屏携带。

**已知缺口**：

- 渲染器不支持图片、嵌套列表、脚注、HTML；
- 不支持多份教程（只有一份 `BUILD-GUIDE.md`）；
- 不检测用户环境（JDK 版本、Gradle 是否存在）；
- 无「按加载器切换」的分段视图，三种加载器混在一篇里；
- 无搜索与目录锚点。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础（`setPluginRoot`、`boot`） |
| 内容 | `docs/BUILD-GUIDE.md` |
| 展示 | 10 界面外壳（页签与 Markdown 组件） |
| 相关 | 11 代码工作区（将来生成工程后可在此给出针对性步骤） |
