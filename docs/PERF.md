# 性能基线（v0.5.0）

> 脚本：`node scripts/benchmark.mjs`
> 环境：Windows 本机（Node 24），fixture **100 物品 / 20 模块 / 50 任务**
> 记录日期：2026-11-15

| 操作 | 目标 | 实测（本机） |
| --- | --- | --- |
| `workbench.plan` | < 100 ms | 0.68 ms |
| `plan.export` | < 300 ms | 1.2 ms |
| `plan.handoff` | — | 0.8 ms |
| `summary.rebuild` | < 300 ms | 62.93 ms |
| `structure.refresh` | < 2 s | 6.27 ms |
| `context.pack` | < 200 ms | 2.1 ms |

结论：全部低于目标；`summary.rebuild` 是主要耗时项（全量重算 100 物品），后续可做增量。

复跑方式：

```bash
node scripts/benchmark.mjs
```

脚本在系统临时目录创建 fixture，结束后删除，不写入项目仓库。
