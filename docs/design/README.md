# 产品设计规格

> 状态：**目标设计，尚未实现**
> 当前主线：[../PLAN.md](../PLAN.md)
> 已实现事实：[../STATUS.md](../STATUS.md)、[../ARCHITECTURE.md](../ARCHITECTURE.md)、[../DATA-FORMAT.md](../DATA-FORMAT.md)
> 最后更新：2026-10-29

这里放“准备做、但代码里还没有”的设计。不要把未实现的字段写进 `DATA-FORMAT` 或 `INDEX`，等代码落地后再回填。

## 文档

| 文档 | 内容 |
| --- | --- |
| [IDEA-MODEL.md](IDEA-MODEL.md) | 想法卡：用户意图、假设、未决问题、验收 |
| [SYSTEM-MODEL.md](SYSTEM-MODEL.md) | 系统卡：边界、不变量、关键类/资源、依赖 |
| [TEMPLATE-SPEC.md](TEMPLATE-SPEC.md) | 模板：参数、文件、注册点、检查、版本 |
| [TASK-SPEC.md](TASK-SPEC.md) | 任务包：范围、允许路径、上下文、验收、回滚 |
| [CONTENT-EDIT.md](CONTENT-EDIT.md) | 图形化数据编辑：三层数据、MVP、应用管线 |

## 约定

- schema 字段以本文为准，定稿后再进入 `DATA-FORMAT`；
- 所有写操作必须有预览、备份、回滚；
- 所有 AI 写操作必须有任务包与验收，不允许“直接改工程”；
- 模板与任务不替代代码审查，只缩小 AI 的犯错空间。
