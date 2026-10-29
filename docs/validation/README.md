# 文档验证（M0）

> 状态：验证样张，不是产品数据
> 主线：[../PLAN.md](../PLAN.md)
> 规格：[../design/](../design/README.md)
> 最后更新：2026-10-29

## 目的

不写代码，先用真实项目 Lock 填一遍新文档：

1. 想法卡能不能描述用户意图；
2. 系统卡能不能压住 31 个类；
3. 任务包能不能限定 AI 的修改范围；
4. API 索引样例能不能提供真实签名；
5. 现有规格缺什么字段/检查/模板。

## 样张

| 文档 | 验证对象 |
| --- | --- |
| [LOCK-IDEA.md](LOCK-IDEA.md) | 想法卡：目标、玩法循环、假设、未决问题、验收 |
| [LOCK-SYSTEMS.md](LOCK-SYSTEMS.md) | 系统卡：7 个系统、边界、不变量、入口、资源 |
| [LOCK-TASK.md](LOCK-TASK.md) | 任务包：新增电子锁、允许路径、上下文、验收 |
| [API-INDEX-SAMPLE.md](API-INDEX-SAMPLE.md) | API 索引：真实 classpath 签名样例 |
| [GAP-REPORT.md](GAP-REPORT.md) | 验证结论与规格调整建议 |
| [ROUND2-TASK.md](ROUND2-TASK.md) | 用修正规格重填任务包，并确认 guardPaths、codeRefs、verify runner、baseStructureHash |

## 判定标准

- 一个没读过 Lock 源码的人，能通过系统卡理解主要结构；
- 一个 AI 只读任务包，能知道该改哪些文件、不该改哪些；
- API 样例的签名来自真实 jar，不是记忆；
- 发现的缺口能落到具体规格修改，而不是“感觉不够”。
