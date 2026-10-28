# 参考：催更姬插件可借鉴的实现

> 来源：`dsh-cuigengji-plugin` v0.5.0（MIT License，作者 mistnest）
> 查阅副本：`C:\Users\dfg233\.dsh\profiles\desktop\node_modules\dsh-cuigengji-plugin`
> 目的：只提炼**架构与交互模式**，不复制其业务代码；所有建议落到本项目的具体文件与版本。
> 最后更新：2026-10-28

## 0. 优先级总表

| 优先级 | 借鉴点 | 催更姬来源 | 本项目落点 | 建议版本 |
| --- | --- | --- | --- | --- |
| P0 | 原子写、文件锁、崩溃恢复 | `atomic-store.ts` | `lib/registry.js` 的 `writeJson`、设置文件、物品保存 | v0.1.x |
| P0 | 多文件事务日志 | `file-transaction.ts` | 导入 / 重新导入的多文件写入 | v0.1.x |
| P0 | 导入「预览 → 证明 → 导入」 | `transfer/service.ts` | `project.reimport`、素材导入 | v0.1.x |
| P0 | 渲染错误边界 | `WorkbenchBoundary.tsx` | `StudioPage` 外层 | v0.1.x |
| P0 | 草稿缓存与离开保护 | `drafts.js`、`state.js` | `ItemEditor`、`FeatureEditor`、项目切换 | v0.1.x |
| P0 | 版本号 / 请求幂等 | `application/store.js` | 物品、构想、导入动作 | v0.1.x |
| P1 | 设置页的分组、作用域、单项重置、自动保存 | `settings/*` | v0.2 设置页 | v0.2 |
| P1 | 图画布：相机、撤销、套索、失败回滚 | `graph.tsx` | v0.2 依赖图 | v0.2 |
| P1 | 批量管理条 | `batch-management.tsx` | v0.2 批量操作 | v0.2 |
| P1 | 项目切换门与迁移校验 | `libraries/service.ts` | 项目切换 / 导入 | v0.2 |
| P2 | 升级协调器、备份清单、维护校验 | `maintenance/upgrade.ts`、`upgrade-backup.ts` | 数据格式升级 | v0.2 / v1.0 |
| P2 | 发布前构建、宿主、安装验收 | `docs/release-process.md` | 发版检查单 | 持续 |

> 结论：最值得先借的是**数据可靠性与导入安全**，其次是**设置页交互细节**和**图/批量编辑**；
> 桌宠、MCP、技能系统与 1.1 万行单文件客户端不适合照搬。

## 0.1 本轮采纳（v0.1.2）

| 借鉴点 | 状态 | 本项目落地 |
| --- | --- | --- |
| 原子写 + fsync + 目录 barrier（第 1 节） | **部分采纳** | `writeJson` / `writeText` 改为临时文件 + fsync + rename + barrier；尚未加跨进程文件锁与 pending 恢复 |
| 多文件事务日志（第 2 节） | 暂不照搬 | 用「导入前整目录备份 + 失败回滚」达到同等用户效果，代码量更小；完整 journal 留给后续 |
| 导入「预览 → 证明 → 导入」（第 11 节） | **已采纳** | `analyzeImport` 返回 `proof`，`reimport` 校验；导入前自动备份 |
| 设置页行级交互（第 4 节） | 已写入方案 | 单项 ↺、作用域标签、自动保存状态、复制诊断；v0.2 实现 |
| 版本号 / 请求幂等（第 5 节） | 未采纳 | 物品/构想仍无 `revision`；已记入下一补丁，不与本补丁混做 |
| 草稿缓存与离开保护（第 6 节） | **已采纳** | `useDraftState`：localStorage 草稿、重新打开恢复、beforeunload、取消确认 |
| 渲染错误边界（第 10 节） | **已采纳** | `StudioRoot` 捕获渲染异常，提供重试 / 刷新 |
| 图画布 / 批量管理（第 8、9 节） | 未采纳 | 归入 v0.2 关系图与批量操作 |
| 项目切换门（第 7 节） | 未采纳 | 当前编辑器为模态，切换入口被遮挡；后续做项目级门禁 |
| 升级协调器 / 发布验收（第 3、12 节） | 未采纳 | 等第一次真正的数据格式迁移与发版自动化 |

> 下一补丁优先处理：物品 / 构想 `revision` 与 `requestId`、跨进程文件锁、项目切换门禁。

## 1. 原子写与文件锁（P0）

**催更姬做法**（`src/infrastructure/persistence/atomic-store.ts`）：

- 用 `mkdir` 创建 `.lock` 目录，写入 owner PID，实现跨进程互斥；
- 抢锁时处理 Windows 删除挂起导致的 `EPERM/EACCES`，给一段宽限而不是立即判失败；
- 只有确认 owner PID 已不存在（`ESRCH`）才回收死锁，且用 `reclaim` 目录保证只有一个回收者；
- `load()` 先尝试读取 `store.pending.json`，存在则完成上次中断的提交；
- `save()` 写临时文件 → `fsync` → `rename` 到 pending → 目录 barrier → `rename` 到正式文件；
- Windows 不支持目录 `fsync` 时，把 `EPERM/EISDIR/ENOTSUP` 当尽力而为，其他错误照常抛出。

**本项目现状（v0.1.2）**：`writeJson` / `writeText` 已改为「临时文件 + fsync + rename + 目录 barrier」，随机临时名避免并发相撞。仍缺：

- 没有跨进程锁，两个窗口或「界面保存 + Agent 工具」同时写 `project.json` / `items/<id>.json` 仍可能后写覆盖；
- 没有 pending 恢复，rename 前崩溃留下的临时文件需人工判断；
- 导入这种多文件写入靠备份回滚，不靠事务日志（见第 2 节）。

**建议（下一步）**：把当前实现抽成 `lib/atomic.js`，补上锁与 pending：

```js
export async function writeJsonDurable(file, value)   // 已有，建议抽离
export async function withFileLock(dir, fn, options)  // 待补：单文件/单目录锁
export async function readJsonWithPending(file, pending) // 待补：崩溃恢复
```

用在：`registry.json`、`settings.json`、`project.json`、`items/*.json`、`features.json`。
导入这种多文件场景当前用「备份 + 回滚」，不靠单文件锁硬拼；以后需要单文件级恢复时再引入事务日志。

**不照搬的部分**：它把整个工作库放在一个 `store.json` 里，本项目是分文件存储，锁粒度应是「项目目录」或「单文件」，不需要全局大锁。

## 2. 多文件事务日志（P0）

**催更姬做法**（`file-transaction.ts`）：

- 每次批量修改先写 `transaction.pending.json` 日志，记录每个目标的暂存文件、sha256；
- 提交前做完整 preflight：路径必须在根目录内、无重复、无 `..`、不覆盖迁移/删除中的目录；
- 恢复时逐个校验暂存文件哈希，全部通过才提升到目标；失败保留原文件与日志；
- 删除文件排在写入之前，避免同名文件互相覆盖；
- 支持目录移动与删除，且把目录整体暂存到事务目录，恢复可跨 rename。

**本项目现状（v0.1.2）**：`importProject` / `reimportProject` 已用 `runWithProjectBackup` 在操作前备份 `.mcstudio/` 与快照，失败自动恢复；没有引入 journal，因此恢复粒度是整目录，而不是单文件事务。

**建议**：

1. 导入前在 `<项目>/.mcstudio/backups/before-import-<时间>/` 做一份完整快照（可用简单文件复制 + 清单）；
2. 把本次要写的文件先写入 `.mcstudio/transaction.pending/`，全部成功后再逐个 rename；
3. 启动/下次导入时若发现 pending，按清单继续完成或回滚；
4. 清单记录每个文件的 sha256，恢复时校验。

第一版不必实现目录移动/删除，只覆盖「导入写文件」即可；代码量可控，收益直接。

## 3. 升级协调器与备份清单（P2）

**催更姬做法**（`src/application/maintenance/upgrade.ts`、`upgrade-backup.ts`）：

- 启动时先做**数据根旁**的完整原始快照，再解析旧数据；
- 快照有 `manifest.json`，逐文件记录 `bytes` / `sha256` / 软链接目标；`verify` 全量核对；
- 迁移前后对完整逻辑工作库做 canonical digest，比较一致才放行；
- 状态写入 `runtime/upgrade.json`：`running / ready / failed`、阶段、备份路径、前后摘要；
- 失败时保留现场与维护查询，阻止正常写入，避免「空库掩盖丢失」；
- 提供 `maintenance.status` / `verify`，可核对实际版本、数据根、作品 ID。

**本项目现状**：插件有 `schemaVersion` 概念（`studio.json`、`summary.json`、`structure.json`），但还没有真正的迁移协调器；升级主要靠「解析器版本 / 文件哈希」触发重扫，风险较低。数据格式一旦变化（例如给物品加 `revision`），需要正式的迁移与备份。

**建议**：先借「备份清单 + 校验」用于导入/迁移；等第一次真正的数据格式升级时再引入完整协调器与 `maintenance` 工具，不要为当前 1.0 之前的小步改动过度建设。

## 4. 设置页的交互细节（P1）

**催更姬做法**（`src/client/shared/settings/`）：

- 设置是**模态框**，顶部搜索，左侧分类，右侧分组；窄屏把分类收成下拉；
- 每行统一 `SettingsRow`：标题 + 作用域标签（此设备 / 当前作品 / 作品库 / 当前会话）+ 说明 + 右侧控件 + `↺` 单项重置；
- 修改**自动保存**，底部固定显示「修改自动保存，按各项标注的范围生效」；
- 纯显示偏好（字号、行距、目录展开）用 `localStorage`，设备本地、即时生效；
- 需要 Host 事实的（数据根、版本）走 `settings.get`，维护状态走 `maintenance.status`，不混进 localStorage。

**本项目采纳**：

- 保持**整页**（用户已定），不用模态框；
- 采用「分组标题 + 行内说明 + 作用域标签 + 单项 ↺ + 底部自动保存状态」；
- 暂不做搜索与分类导航：当前只有 5 项，超过 10 项再加，避免空壳 UI；
- 「关于」区增加「复制诊断信息」按钮，复用它的剪贴板降级思路（失败时选中文本让用户复制）；
- 仍使用 Host 的 `settings.json` 而不是 localStorage：Agent 也要读默认项目，且「事实只有一份」；
- 不照搬它把「数据根」放在设置弹窗里改：本项目项目路径由项目页管理，设置页只读展示。

## 5. 版本号与请求幂等（P0）

**催更姬做法**（`src/application/store.js`）：

- 每个实体有 `revision`，写入必须带 `expectedRevision`，不匹配报 `CONFLICT` 并给出当前版本；
- 每次修改 `touch` 时 `revision++`、更新 `updatedAt`；
- 写动作可带 `requestId`：服务端保存 `{signature,result}`，重复请求直接返回原结果；
- 同一个 `requestId` 换参数会报 `REQUEST_ID_REUSED`，防止「以为重试了、其实改了另一件事」；
- 工具调用自动用 `exec.callId` 作为 `requestId`，Agent 不需要自己生成；
- 作者/Agent 边界：整书删除、批量替换等动作要求 `actor.kind === 'human'`。

**本项目现状**：`saveItem` / `saveFeature` 只写 `updatedAt`，没有 `revision`，也不校验旧版本；两个窗口或「界面 + Agent」同时改同一物品，后写者静默覆盖。删除动作也没有幂等保护。

**建议**：

1. 给物品、构想增加 `revision`（整数，缺省 1），保存时可选 `expectedRevision`；不传保持兼容；
2. 保存成功 `revision++`，冲突返回当前条目，界面提示「已被其他窗口/Agent 修改」；
3. 导入、批量操作、删除加 `requestId`，服务端记录结果（可放 `.mcstudio/requests.json` 或内存 + 文件）；
4. 工具调用用 `exec.callId` 自动补 `requestId`，与催更姬一致；
5. 这是数据格式变化，需要迁移与测试，放在 v0.1.x 的可靠性补丁里，不要和设置页混在一起。

## 6. 草稿缓存与离开保护（P0）

**催更姬做法**（`src/client/shared/drafts.js`、`state.js`）：

- 草稿保存 `{base, value}`，`base` 是服务端版本（含 revision），`value` 是本地编辑值；
- 草稿按「作品库 + 会话 + 实体」隔离，切换作品库不会串草稿；
- `beforeunload` 有未保存修改时提示；
- `activeDrafts` 让「切换作品库」知道还有未保存内容；
- 重新拉取服务端数据时用 `rebase` 保留本地修改，不直接覆盖；
- localStorage 写失败只提示「本次会话仍生效」，不阻断编辑。

**本项目现状（v0.1.2）**：`ItemEditor` / `FeatureEditor` 已用 `useDraftState` 存 localStorage 草稿，重新打开自动恢复；关闭页面/刷新会提示，取消时确认放弃。项目切换门禁仍未做，因为编辑器是模态、切换入口被遮挡。

**建议**：

- 两个编辑器用 `localStorage` 存草稿，key 含项目路径 + 实体 id；
- 有草稿时打开编辑器自动恢复，保存/取消后清除；
- 项目关闭/切换前检查草稿，弹确认；
- 不做跨设备草稿，也不把草稿写进 `.mcstudio/`（草稿不是事实）。

## 7. 项目切换门与迁移校验（P1）

**催更姬做法**（`src/application/libraries/service.ts`）：

- `LibraryService.use()` 计读者数，`change()` 在 `changing || readers || busy()` 时直接拒绝；
- 切换前 `inspect()` 只读预览：已有库 / 空目录 / 非法目录 / 有挂起事务；
- 迁移模式先做完整备份并 `verify`，复制到目标后再比对逻辑摘要，成功才切换；
- 新旧目录不能相同或互相嵌套；目标必须为空；
- 切换后让会话绑定、桌宠、RPC 缓存一起失效，避免旧数据串新库。

**本项目现状**：`project.open` / 关闭项目没有「正在保存/正在导入」的门禁，快速切换可能让旧请求写进新项目；`project.create` / `import` 已检查空目录，但没有备份与摘要比对。

**建议**：在 Host 侧加一个轻量 `ProjectGate`：

- 记录当前项目与进行中的写操作；切换/关闭时若有写操作，返回「正在保存，请稍后」；
- 导入/重新导入前做快照，完成后比对条目数、物品数、文件数；
- 目标目录嵌套检查复用 `paths.js` 的路径归属函数；
- 前端在切换项目时先确认未保存草稿。

## 8. 图画布：相机、撤销、失败回滚（P1）

**催更姬做法**（`src/client/shared/graph.tsx`、`graph-geometry.ts`、`domain/canvas/*`）：

- 世界坐标 + 相机（x/y/zoom），相机按会话/视图存 `localStorage`，不写业务数据；
- 拖动、连线、套索、框选、自动排布共用一套 hit-test；
- 布局修改先本地乐观更新，保存失败保留失败变更，提供「重试 / 还原布局」；
- 撤销/重做栈只记布局变更（before/after/revisions），不混入节点正文；
- 自动排布用 ELK，排布结果带 revision 回写；`mode: missing` 只安放新节点，`all` 才重排；
- 文件夹是「画布范围」，节点归属与坐标分离，移动文件夹不改坐标。

**本项目 v0.2 依赖图**：构想 → 物品 → 贴图/模型。可以直接借这套分层：

1. 图数据（节点、边）与布局（坐标）分开存；
2. 相机本地存，不写 `.mcstudio`；
3. 布局保存带 `expectedRevision`，失败可还原；
4. 自动排布先只做「网格/分层」轻量版，不急着引 ELK；
5. 套索/多选为批量操作（第 9 节）服务。

## 9. 批量管理条（P1）

**催更姬做法**（`src/client/shared/batch-management.tsx`）：

- 顶部固定「批量管理」条：已选数量、全选（含 indeterminate）、清空、复制、删除；
- 「移动到」下拉按文件夹分组，目标非法时按钮禁用；
- 所有操作在 `busy` 时禁用，避免批量请求叠加；
- 选中集合会随当前过滤结果收敛，不会操作到不可见项。

**本项目 v0.2**：物品列表多选后统一改类型/标签/删除；可复用同样的「选中数量 + 全选 + 目标 + 禁用」结构，不需要照搬它的页面/画布双目标。

## 10. 前端健壮性（P0/P1）

**催更姬做法**：

- `WorkbenchBoundary` 捕获渲染错误，避免 DSH 因未捕获异常**退休整个 slot**，并提供「重新打开」；
- `createWorkbenchRPC` 只对启动读取（`novel.list`、`settings.get` 等）做有限重试，**绝不重放写请求**；
- `useResource` 用请求序号 + scope 守卫，旧响应不能覆盖新数据；
- `Modal` 用原生 `<dialog>`、恢复焦点、Esc 取消、阻止事件冒泡；
- 异步操作普遍带 `AbortSignal`，卸载即取消。

**本项目现状（v0.1.2）**：`StudioRoot` 已加错误边界；`call()` 仍不重试写请求；列表/摘要没有请求序号守卫；Modal 仍是自绘 div，Esc 有处理但没有焦点恢复。

**建议**：

- 给 `StudioPage` 外包一层 `StudioBoundary`（class 组件，捕获后显示「重新打开」+ 错误详情）；
- `call()` 不自动重试写动作；读动作可有限重试；
- 列表/摘要加载用请求序号，项目切换后丢弃旧响应；
- Modal 增加关闭后焦点恢复，成本低。

## 11. 导入「预览 → 证明 → 导入」（P0）

**催更姬做法**（`src/application/transfer/service.ts`）：

- `preview()` 返回 `fingerprint`、`proof`（对文件指纹 + 选项 + 本地状态 + 冲突的哈希）、`conflicts`、`skipped`、`warnings`、`samples`；
- `import()` 必须带 `proof` 与 `requestId`；proof 不匹配说明预览后文件或目标变了，要求重新核对；
- 导入前自动快照，导入后返回 `backupDir`；
- 同一文件重复导入用 receipt key 防重复；
- 导入失败保留冲突清单，不部分写入。

**本项目现状（v0.1.2）**：`project.analyzeImport` 返回 `proof`，`reimport` 会校验；导入前自动备份，失败回滚，结果返回 `imported.backup`。proof 目前只覆盖扫描列表与条目状态，不覆盖素材文件内容。

**建议**：

1. `analyzeImport` 返回 `proof`（对扫描结果 + 选项 + 项目当前摘要做哈希）；
2. `reimport` 接收 `proof`，不匹配报「预览后工程已变化，请重新分析」；
3. 执行前自动写 `.mcstudio/backups/before-reimport-<时间>/`；
4. 返回 `backupDir` 与 `skipped/conflicts` 统计，前端展示。

## 12. 测试与发布（P2）

**催更姬做法**（`docs/development.md`、`release-process.md`）：

- `npm test` + `typecheck` + `build` + `check:build`；构建产物与源码一起提交，安装不跑构建钩子；
- 按修改范围选择 UI 冒烟脚本（Playwright），不每次都跑全套；
- 宿主兼容/安装验收用**临时 DSH profile + 合成作品**，不碰用户正式数据；
- 发布前检查版本、工作树、实际包清单、安装后版本与数据保留；
- 迁移/导入改动必须覆盖旧数据、备份往返、失败恢复。

**本项目可借**：

- 增加一个 `npm run check` = 语法检查 + 全量测试 + schema 生成校验；
- 发版检查单加入「重装 bundle 后实际调用一次工具」；
- 用临时目录做导入/迁移测试（现有 tests 已如此），不要碰真实工程；
- 单文件客户端不便上 Playwright，但可继续扩展 `test/12-render.mjs` 的交互断言（点击、输入、弹窗）。

## 13. 不建议照搬

| 内容 | 原因 |
| --- | --- |
| 桌宠、Windows 透明窗口 | 与模组工坊无关 |
| MCP server / client、Skill 体系 | 本项目已用 DSH 原生工具 + 文档，不需要第二套协议 |
| 多作品库切换 | 本项目是「多项目列表」，语义不同；只借切换门禁与校验 |
| localStorage 存全局设置 | Agent 读不到，且换浏览器丢失；本项目用 Host `settings.json` |
| 1.1 万行单文件客户端 | 本项目受 module loader 限制必须单文件，但应继续按节拆分、控制体积 |
| TypeScript + esbuild 构建链 | 本项目当前零构建、直接加载源码，引入构建链的收益不足 |

## 14. 建议落地顺序

1. **v0.1.x 可靠性补丁**（先于设置页）：
   - `writeJsonDurable` + 项目级锁；
   - 导入前备份 + 多文件事务；
   - `StudioBoundary`；
   - 编辑器草稿与项目切换保护；
   - 物品/构想 `revision` 与 `requestId`；
   - 导入 `proof`。
2. **v0.2 设置页**：按 [SETTINGS-PLAN.md](plans/SETTINGS-PLAN.md) 实现，采用本文第 4 节的行级交互。
3. **v0.2 关系图与批量操作**：借第 8、9 节的结构。
4. **后续**：升级协调器、维护工具、发布验收自动化。

> 以上只借模式，不复制代码；催更姬为 MIT，若直接复用少量实现需保留版权声明。
