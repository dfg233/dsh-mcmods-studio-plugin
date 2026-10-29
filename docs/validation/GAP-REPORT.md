# M0 文档验证报告

> 对象：Lock（Forge 1.20.1）、API 索引、想法/系统/任务样张
> 结论：方向成立，但规格需要 6 处补强；补强后再进入 M1/M2 实现
> 最后更新：2026-10-29

## 1. 验证方式

- 读 Lock 的 31 个 Java 文件、资源和构建配置；
- 用真实 `forge-1.20.1-47.4.16` 的 Parchment jar 跑 `javap`；
- 按现有规格填 1 张想法卡、7 张系统卡、1 个任务包、1 份 API 样例；
- 记录哪里填不下去、哪里会误导 AI。

## 2. 总体结论

- 7 个系统足以覆盖 Lock，不需要为 31 个类逐类建卡；
- 想法卡能表达玩法循环与验收，但需要区分“已有内容/计划新增”；
- 任务包能把修改限制在 8 个文件内，方向正确；
- API 索引能从真实 classpath 取到签名，明显优于模型记忆；
- 现有模板清单偏物品，缺少“给已有方块加行为”的模板；
- 检查器清单缺少 `structure-diff` 与文件版本保护。

## 3. 发现与影响

### P0-1 模板偏物品，缺少“锁/交互”模板

任务样张需要 `lock-type`，但现有第二批只有 `uuid-key-item`、`lockable-interaction`，没有“新增锁类型并接入 `AbstractLock.create`”的模板。

**影响**：AI 仍要自己设计类型分支、注册、语言、模型，模板价值下降。

**调整**：新增 `lock-type` 模板，或在 `lockable-interaction` 中提供 `lockType` 参数与 `AbstractLock.create` 接线。

### P0-2 系统卡的 `resources` 只是字符串

样张里资源路径带 `kind`（model/texture/lang/gui/sound/data），但规格只写了“资源数组”。任务上下文无法按类型筛选，检查器也无法判断“语言/模型/贴图”是否齐全。

**调整**：`resources` 改为对象：

```json
{ "kind": "lang", "path": "assets/lock/lang/zh_cn.json", "required": true }
```

### P0-3 任务允许路径缺少“只新增/禁止修改/版本”语义

样张的 `allowedPaths` 只能表示“可改”，不能表达：

- 新文件只能创建，不能覆盖已有；
- 某些文件只读，禁止修改；
- 目标文件有并行编辑，写入前要核对 revision/哈希。

**调整**：

- `allowedPaths` 支持 `{path, mode: "create"|"modify"|"readonly"}`；
- 任务记录 `baseRevisions` 或 `baseHashes`；
- 新增 `structure-diff` 检查：只改允许系统/文件。

### P0-4 API 索引不能只用 `javap -public`

样例发现：

- `BlockEntity.saveAdditional` 是 protected，模组经常重写；
- `MenuProvider.createMenu` 继承自 `MenuConstructor`，本类输出没有；
- `Item.Properties` 在字节码里是 `Item$Properties`；
- Parchment/official 映射不同，签名和参数名会变。

**调整**：

- 索引包含 protected；
- 合并父类/接口方法（或标记 `inheritedFrom`）；
- 嵌套类保留 `$` 与点号双键；
- `meta.json` 记录 `mappings`、`loaderVersion`、`classpathHash`；
- 查询结果标注来源 jar。

### P0-5 想法卡 content 缺少“已有/计划新增”

Lock 的 `mechanical_lock` 已存在，电子锁是计划新增；当前 `content` 只有 `kind/id`，AI 无法判断哪些要创建。

**调整**：`content[]` 增加 `status: "existing"|"planned"|"deprecated"`。

### P1-1 系统卡缺少“验证时间/代码版本”

系统卡是意图，代码会变。没有 `lastVerified`/`codeRevision`，读者不知道卡片是否过期。

**调整**：增加 `lastVerifiedAt` 与可选 `codeHash`/`commit`；不强制。

### P1-2 任务 `verify` 混用“检查 id”和“命令”

样张同时写了 `compile-java` 与 `structure-diff`，但没有说明哪些由插件执行、哪些由 AI 执行。命令需要超时、退出码与输出摘要。

**调整**：`verify[]` 改为对象：

```json
{ "id": "compile-java", "runner": "host", "timeoutMs": 120000 }
```

或至少区分 `checks[]` / `commands[]`。

### P1-3 检查器缺少统一目录

`allowed-paths`、`resource-exists`、`nbt-roundtrip`、`structure-diff` 等只在样张里出现，没有注册表。AI 可能写不存在的检查 id。

**调整**：建立 `checks.json`/内置检查目录，任务只能引用已注册 id。

### P1-4 模板与 API 索引需要 profile 绑定

样张模板 `lock-type` 依赖 Forge 1.20.1 + Parchment，但模板 manifest 只有 `loaders`/`mcVersion`，没有 mapping。不同 mapping 下签名不同。

**调整**：模板增加可选 `mappings` 约束，或引用 `profileId`。

### P2-1 上下文预算需要“按类型”而不是只按文件数

样张 8 个文件符合 10 个预算，但 API 4 个类、语言 2 个文件、系统卡 2 张。只按文件数会低估 token。

**调整**：预算按 `files` + `bytes` + `apiClasses` 三个维度。

## 4. 规格调整清单

| 文档 | 调整 |
| --- | --- |
| `design/IDEA-MODEL.md` | `content[]` 增加 `status` |
| `design/SYSTEM-MODEL.md` | `resources` 改为 `{kind,path,required}`；增加 `lastVerifiedAt?` |
| `design/TASK-SPEC.md` | `allowedPaths` 增加 `mode`；增加 `baseRevisions`；`verify` 区分检查/命令；预算三维度 |
| `design/TEMPLATE-SPEC.md` | 新增 `lock-type`；模板增加 `profileId`/`mappings` |
| `design/API-INDEX-SPEC.md` | 包含 protected、继承方法、嵌套类、mappings、来源 jar |
| `PLAN.md` | M2 验收加入“真实 classpath 签名、protected/继承、structure-diff” |
| `STATUS.md` | M2 目标同步 |
| `VERSION-PLAN.md` | v0.3.0 内容同步 |

## 5. 下一步

1. 按清单修改 5 份设计规格（仍然只改文档）；
2. 用修改后的规格重填一次任务包，确认字段够用；
3. 再决定 M1/M2 的实现顺序。

> 不建议现在写代码：这次验证已经证明，先补字段和检查比先写模板引擎更划算。

## 6. 已应用调整（2026-10-29）

| 调整 | 状态 |
| --- | --- |
| 想法内容区分 existing/planned/deprecated | 已写入 IDEA-MODEL |
| 系统资源改为 `{kind,path,required}`，增加 `lastVerifiedAt` | 已写入 SYSTEM-MODEL |
| 任务允许路径增加 `mode`，增加 `baseRevisions`，检查/命令区分 | 已写入 TASK-SPEC |
| 新增 `lock-type` 模板，模板绑定 `profileId`/`mappings` | 已写入 TEMPLATE-SPEC |
| API 索引包含 protected、继承、嵌套类、mappings | 已写入 API-INDEX-SPEC |
| 计划/状态/版本路线同步 | 已更新 PLAN、STATUS、VERSION-PLAN |

> 下一轮验证：用修改后的任务包重填一次，确认 `allowedPaths` 的 `mode` 与 `verify` 对象是否够用。

## 7. 第二轮确认（ROUND2-TASK）

用修正后的规格重填「新增电子锁」后，结论：

| 方法 | 结果 |
| --- | --- |
| `allowedPaths` 只写 create/modify | 成立 |
| 只读保护拆为 `guardPaths` | 成立，避免把“禁止修改”混进“允许修改” |
| 源码 base 用 sha256 | 成立，Java 文件没有业务 revision |
| `verify` 增加 runner/evidence | 成立，host/agent/manual 可区分 |
| `structure-diff` 带 `baseStructureHash` | 成立 |
| `apiRefs` 与 `codeRefs` 分离 | 成立，项目类不混入依赖 API 索引 |
| 模板缺失时阻塞 | 成立，`lock-type` 未实现前任务不能执行 |

样张见 [ROUND2-TASK.md](ROUND2-TASK.md)。已把对应字段写回 TASK-SPEC、API-INDEX-SPEC 与 PLAN。
