# 项目管理模块计划

> 模块编号：02
> 代码位置：`lib/project.js`（项目部分）、`client.js` 的 `ProjectTab`、`CreateProjectModal`、`useStudioData`
> 状态：已实现
> 最后更新：2026-10-22

## 1. 模块职责

**负责**：

- 展示已登记项目列表，标记目录缺失；
- 新建项目：在任意目录创建 `.mcstudio/` 数据骨架与 `docs/`；
- 打开 / 关闭项目，切换主面板的数据上下文；
- 维护 `project.json` 元数据（名称、modid、版本、加载器、目标 MC 版本）；
- 写入并维护工坊标记 `studio.json`。

**不负责**：

- 识别已有工程并导入（模块 04）；
- 批量扫描候选工程（模块 03）；
- 物品、功能、素材的具体编辑（模块 05–07）。

## 2. 数据与文件

### 2.1 项目元数据 `project.json`

路径：`<项目>/.mcstudio/project.json`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 固定 1 |
| `name` | string | 显示名，缺省取目录名 |
| `modid` | string | 小写字母/数字/下划线，2–64 位 |
| `version` | string | 项目版本，缺省 `0.1.0` |
| `description` | string | 简介 |
| `loader` | string | `forge` / `neoforge` / `fabric` |
| `minecraft` | string | 固定 `1.20.1` |
| `createdAt` / `updatedAt` | ISO string | 时间戳 |

### 2.2 工坊标记 `studio.json`

路径：`<项目>/.mcstudio/studio.json`

| 字段 | 说明 |
| --- | --- |
| `projectId` | 首次接管生成，之后不变 |
| `importedAt` | 首次导入时间，不覆盖 |
| `importedBy` | 固定 `dsh-mcmods-studio-plugin` |
| `source` | `create` / `import` / `add` / `open` / `migrate` |
| `path` | 最近写入时的绝对路径，仅参考 |
| `mcVersion` | 写入时的目标版本 |

### 2.3 新建项目时创建的内容

```text
<项目>/
├── .mcstudio/
│   ├── studio.json
│   ├── project.json
│   ├── features.json      # {schemaVersion:1, features:[]}
│   └── items/             # 空目录
├── docs/                  # 空目录
└── README.md              # 项目说明（含目录表）
```

## 3. 事件

### 3.1 用户操作

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| 首屏加载 | `useStudioData` 初始化 | `boot` → 取第一个未缺失项目 → `open` | 自动进入上次项目 |
| 点击项目行「打开」 | `open(path)` | `project.open` → 设置 `project`、`assets` | 主面板切到该项目 |
| 点击「新建项目」 | 打开 `CreateProjectModal` | 预填默认路径与 modid | 弹窗出现 |
| 弹窗点「浏览…」 | `pickFolder()` | 调 `uiWorkspace.pickDirectory()` | 回填路径；取消则提示手动填写 |
| 弹窗点「创建」 | 提交 | `project.create` → 校验 → 建目录 → 写元数据 → 登记 → `refreshBoot` → `open` | 进入新项目 |
| 点击「关闭项目」 | `onCloseProject` | 清空 `project`/`assets`，`setStudioState({projectPath:null,itemId:null})` | 回到未打开状态 |
| 点击「移除」 | `projects.remove` | 仅移出注册表 | 磁盘文件保留 |

### 3.2 系统事件

| 触发源 | 事件 | 处理 | 结果 |
| --- | --- | --- | --- |
| `boot` 执行 | 遍历注册表 | 检查目录是否存在、读元数据 | 项目项带 `missing`、`isStudio` |
| 打开项目 | `project.open` | 顺带 `ensureStudioMarker(path,'open')` | 老项目补写标记 |
| 任意写操作后 | `touchMeta` | 更新 `updatedAt` | 列表排序依据 |

### 3.3 异常事件

| 场景 | 处理 | 用户看到 |
| --- | --- | --- |
| 目录非空 | `createProject` 抛错 | 「目标目录非空。新建项目请选择一个空目录或尚不存在的路径。」 |
| 已是工坊项目 | 抛错 | 「该目录已经是工坊项目：xxx」 |
| modid 非法 | 抛错 | 「modid 只能包含小写字母、数字和下划线，长度 2-64」 |
| 加载器不支持 | 抛错 | 「不支持的加载器：xxx」 |
| 目录被删 | `boot` 标记 `missing` | 行内红字「目录不存在」 |

## 4. 运行过程

### 4.1 新建项目

```text
用户填表 → 点「创建」
   │
   ▼
client: call('project.create', {path,name,modid,version,description,loader})
   │
   ▼
api: project.create
   │  ① expandPath(path)
   │  ② createProject({...})
   ▼
project.js createProject
   │  ③ 校验 path 非空
   │  ④ 校验 modid 正则、loader 在 LOADERS 内
   │  ⑤ 目录存在且非空 → 抛错
   │  ⑥ mkdir .mcstudio/、.mcstudio/items、docs/
   │  ⑦ writeJson project.json
   │  ⑧ writeJson features.json
   │  ⑨ writeStudioMarker(source:'create')
   │  ⑩ writeText README.md
   │  ⑪ 返回 readProject(path)
   ▼
api: touchProject(path,{name,modid})   ← 写入注册表
   │
   ▼
client: refreshBoot() → open(path) → setTab('project')
```

### 4.2 打开项目

1. 前端 `open(path)` 置 `busy=true`；
2. `project.open` → `requireProjectPath`（目录必须存在）；
3. `readProject` 读 `project.json`、`features.json`、`items/*.json`；
4. `ensureStudioMarker(path,'open')` 补标记（老项目迁移）；
5. `touchProject` 更新注册表时间；
6. 前端并行取 `assets.list`，填充素材页；
7. `setStudioState({projectPath, itemId:null})` 通知右侧栏。

### 4.3 关闭项目

1. 前端置 `project=null`、`assets=null`；
2. `setStudioState({projectPath:null,itemId:null})`；
3. 主面板各页显示「请先在项目中打开一个项目」的空态。

## 5. 接口

| action | payload | 返回 | 说明 |
| --- | --- | --- | --- |
| `project.create` | `{path,name,modid,version,description,loader}` | `{path,meta,features,items}` | 目录可位于任意位置 |
| `project.open` | `{path}` | `{path,meta,features,items}` | 顺带补标记、更新注册表 |
| `project.saveMeta` | `{path,patch}` | `meta` | 合并字段 |
| `projects.add` | `{path}` | `{path,meta}` | 必须是工坊项目，补标记 |
| `projects.remove` | `{path}` | `{path}` | 只移登记，不删文件 |

## 6. 前端组件

| 组件 | props | 内部状态 | 职责 |
| --- | --- | --- | --- |
| `useStudioData()` | — | `boot/error/busy/project/assets` | 首屏数据、项目切换 |
| `ProjectTab` | `{boot,project,refreshBoot,open,onCreate,onImport,onCloseProject,setError}` | `scanning/scanError/root` | 列表、扫描区、操作按钮 |
| `CreateProjectModal` | `{defaultRoot,onClose,onCreated,setError}` | `draft/submitting` | 新建表单 |
| `PathField` | `{label,value,onChange,required,hint,placeholder}` | `picking/note` | 路径输入 + 浏览按钮 |

## 7. 边界与错误

| 场景 | 行为 |
| --- | --- |
| 路径为空 | `createProject` 抛「项目路径为空」 |
| 目录不存在 | 新建时允许（会创建）；打开时抛「项目目录不存在」 |
| 同名 modid 不同项目 | 允许，项目以路径区分 |
| 两个项目指向同一目录 | 注册表按路径去重，第二次 `touchProject` 只更新 |
| 关闭后再次打开 | 重新读盘，不复用内存缓存 |
| 元数据被手工改坏 | `readProjectMeta` 返回 `null`，项目显示为「非工坊项目」 |

## 8. 现状与缺口

**已实现**：列表与缺失标记、任意目录新建、打开/关闭、元数据读写、标记补写、README 生成。

**已知缺口**：

- 无删除项目功能（只有「移除登记」）；
- 无项目重命名 / 修改 modid 的独立入口（只能改 `project.json` 或走 `saveMeta`，前端未暴露）；
- 无项目复制/模板；
- 无「最近打开」排序，列表按注册表顺序；
- 关闭项目不持久化「上次打开的项目」，靠 `boot` 取第一个。

## 9. 关联模块

| 方向 | 模块 |
| --- | --- |
| 上游 | 01 平台基础（`dispatch`、注册表） |
| 下游 | 05 构想、06 物品管理、07 素材管理、08 文档导出（都要求先有 `project.path`） |
| 协同 | 03 扫描发现（列表与扫描区同页）、04 工程导入（导入后走同一 `open` 流程）、10 界面外壳（`studioState` 联动） |
