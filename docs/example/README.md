# 示例模组：红宝石（完整简单模组）

> 版本：v0.5.0；加载器：Forge 1.20.1
> 用途：演示「按资料库分类覆盖」的完整流程（构想 → 模块/阶段/任务 → 内容 → 模板 → 渲染）。

## 1. 目标内容

| 分类 | 示例 |
| --- | --- |
| 物品/方块 | 红宝石、红宝石剑、红宝石盔甲、红宝石块 |
| 生物/实体 | 红宝石傀儡（属性/刷怪蛋/生成） |
| 群系/群落 | 红宝石洞窟（特征 + modifier） |
| 自然生成 | 洞窟结构（structure-basic） |
| 世界/维度 | 红宝石维度（dimension-basic） |
| 附魔/魔咒 | 红宝石亲和 |
| BUFF/DEBUFF | 红宝石增益 |
| 多方块结构 | 红宝石祭坛（multiblock-basic） |
| 游戏设定 | 术语「红宝石」、命令 `/ruby` |
| 绑定热键 | `R` 打开红宝石界面 |
| 支撑内容 | 切石/锻造配方、战利品表、标签、语言、模型、创造标签成员 |

## 2. 流程（agent 在 DSH 对话中操作）

```text
1. 规划：workbench module.save（红宝石核心）→ stage.save（内容/世界）→ task.save（逐项）
2. 内容：content.entity.save / content.biome.save / content.worldgen.save /
        content.dimension.save / content.multiblock.save / content.setting.save /
        content.keybind.save / content.enchantment.save / content.effect.save /
        content.sound.save / content.particle.save
3. 生成：template.render（entity-basic / biome-basic / structure-basic / dimension-basic /
        multiblock-basic / keybind-basic / enchantment-basic / effect-basic /
        stonecutting-recipe / loot-table）
4. 支撑：content.loot.save、content.tab.add、content.apply（语言/配方/模型）
5. 验收：plan.export（docs/plan/PLAN.md）、gradlew compileJava、runClient 查看内容
```

## 3. 关键工具

- `workbench`：模块 / 阶段 / 任务；
- `content`：catalog、entity、biome、worldgen、dimension、multiblock、setting、keybind、enchantment、effect、sound、particle、loot、tab；
- `template`：list / render / apply；
- `plan.export` / `plan.handoff`：交接与验收。

## 4. 验收

- 真实 Forge 1.20.1 工程 `gradlew compileJava` 通过（人工）；
- `runClient` 能看到红宝石物品、方块、生物、群系与维度（人工）。

> 说明：模板为骨架级，实体 AI、生成规则、维度传送等留有 TODO，需要在示例项目中补全。
