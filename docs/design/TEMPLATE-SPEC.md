# 模板（Template）规格

> 状态：目标设计，未实现
> 归属：[../PLAN.md](../PLAN.md) M2
> 最后更新：2026-10-29

## 1. 目的

模板把常见模组模式的标准做法固化下来，减少 AI 每次重新设计注册、资源、GUI、网络骨架的方差。

模板不是完整代码生成器：

- 提供骨架、注册、资源、检查；
- 业务逻辑由 AI 按任务填充；
- 生成前必须预览，生成后必须检查。

## 2. 清单格式

每个模板一个目录：

```text
templates/
  simple-item/
    template.json
    files/
      item.java.tpl
      model.json.tpl
      lang.json.tpl
    README.md
```

`template.json`：

```json
{
  "id": "simple-item",
  "name": "普通物品",
  "version": 1,
  "loaders": ["forge", "neoforge"],
  "mcVersion": "1.20.1",
  "category": "item",
  "parameters": [
    { "key": "modid", "type": "string", "required": true },
    { "key": "id", "type": "string", "required": true },
    { "key": "displayName", "type": "string", "required": true },
    { "key": "stackSize", "type": "number", "default": 64 }
  ],
  "files": [
    { "path": "src/main/java/{{package}}/item/{{ClassName}}.java", "template": "files/item.java.tpl", "when": "always" },
    { "path": "src/main/resources/assets/{{modid}}/models/item/{{id}}.json", "template": "files/model.json.tpl", "when": "always" },
    { "path": "src/main/resources/assets/{{modid}}/lang/zh_cn.json", "template": "files/lang.json.tpl", "when": "always", "merge": "json" }
  ],
  "registrations": ["items"],
  "checks": ["resource-exists", "registration-pair", "lang-key"],
  "instructions": "只填业务字段；不要改注册表和已有条目。"
}
```

字段约束：

- `version` 用于模板升级与 golden 测试；
- `loaders` / `mcVersion` 不匹配时拒绝渲染；
- `parameters` 由插件校验，不信任 AI 传入；
- `files` 的 `merge` 支持 `json`（深合并）和 `markers`（标记区块）；
- `checks` 是检查 id，不是自然语言。

## 3. 渲染规则

1. 参数校验：必填、类型、id 合法、目标路径在允许范围内；
2. 目标冲突：已存在文件时，默认不覆盖；只能走 `merge` 或标记区块；
3. 输出预览：列出新增/修改/跳过；
4. 写入前备份；
5. 写入后跑模板检查；
6. 失败回滚，保留失败报告。

模板不得：

- 覆盖整份手写 Java；
- 修改 `build.gradle` / `mods.toml`（除非模板明确声明并预览）；
- 写入 `build/`、`.gradle/`、`generated/` 之外的非白名单路径。

## 4. 模板清单

### 第一批（v0.2–v0.3）

| 模板 | 提供 |
| --- | --- |
| `simple-item` | 物品类、注册、模型、语言、贴图占位 |
| `tool-set` | 工具属性、耐久、攻击、采集等级 |
| `block-basic` | 方块、方块物品、blockstate、模型、语言 |
| `shaped-recipe` | 有序配方 JSON |
| `shapeless-recipe` | 无序配方 JSON |
| `furnace-recipe` | 熔炉配方 JSON |
| `item-tag` / `block-tag` | 标签 JSON |
| `lang-pair` | 中英文语言条目 |
| `model-select` | generated / handheld / 自定义模型 |

### 第二批（v0.4，Lock 类）

| 模板 | 提供 |
| --- | --- |
| `uuid-key-item` | 钥匙物品、KeyData、UUID 绑定、NBT |
| `lockable-interaction` | 右键/破坏/放置拦截骨架 |
| `block-entity-menu` | 方块实体 + Menu + Screen + capability |
| `s2c-sync-packet` | 包类、注册、客户端处理 |
| `saved-data-store` | SavedData 持久化 |
| `config` | Forge/NeoForge 配置 |
| `creative-tab` | 创造模式标签与成员 |

## 5. 与任务的关系

```text
任务
  → 选择 1–2 个模板
  → 渲染预览
  → AI 填充业务逻辑
  → 插件检查
  → 用户接受/回滚
```

任务包里的 `templateRefs` 记录模板 id 与版本；模板升级不自动改写已完成任务。

## 6. 测试

- 每个模板固定参数生成 golden 文件，逐字节/逐 JSON 比对；
- 参数缺失、非法 id、loader 不匹配必须有明确错误；
- 冲突文件不能被覆盖；
- 模板检查必须能拦住缺失资源与错误注册。

## 7. 验收

- 用户能在 3 分钟内用模板创建一个可编译的普通物品；
- AI 只改模板允许的文件；
- 模板生成结果可预览、可回滚；
- 新增模板不需要改核心代码。
