/**
 * 用例 10：`data/schema.json` 与 `lib/schema.js` 保持同步。
 *
 * data/schema.json 是给 agent 与外部工具读的副本，schema.js 是代码来源。
 * 两者漂移会让 agent 读到错误的字段定义，因此必须有测试守住。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, must, runSuite } from './helpers.mjs'

const root = 'D:/program/dsh-mcmods-studio-plugin'

const cases = [
  {
    name: 'data/schema.json 与 schema.js 一致',
    async run() {
      const { LOADERS, FEATURE_STATUS, FEATURE_PRIORITY, ITEM_TYPES, ITEM_FIELDS, MC_VERSION } =
        await import(`file:///${root}/lib/schema.js`)

      const raw = await readFile(join(root, 'data', 'schema.json'), 'utf8')
      const json = JSON.parse(raw)

      equal(json.schemaVersion, 1, 'schemaVersion 应为 1')
      equal(json.mcVersion, MC_VERSION, 'mcVersion 应一致')
      equal(json.loaders.length, LOADERS.length, '加载器数量应一致')
      equal(json.itemTypes.length, ITEM_TYPES.length, '物品类型数量应一致')
      equal(json.itemFields.length, ITEM_FIELDS.length, '字段数量应一致')
      equal(json.featureStatus.length, FEATURE_STATUS.length, '构想状态数量应一致')
      equal(json.featurePriority.length, FEATURE_PRIORITY.length, '优先级数量应一致')

      must(
        JSON.stringify(json.itemFields) === JSON.stringify(ITEM_FIELDS),
        '字段定义逐项一致（若有改动请运行 scripts/gen-schema.mjs 重新生成）',
      )
      must(JSON.stringify(json.itemTypes) === JSON.stringify(ITEM_TYPES), '物品类型逐项一致')
      must(JSON.stringify(json.loaders) === JSON.stringify(LOADERS), '加载器逐项一致')
    },
  },
  {
    name: 'schema.json 体积适合 agent 读取',
    async run() {
      const raw = await readFile(join(root, 'data', 'schema.json'), 'utf8')
      must(raw.length < 12000, `schema.json 应小于 12KB，实际 ${raw.length} 字节`)
    },
  },
]

process.exitCode = await runSuite('10 · Schema 同步', cases)
