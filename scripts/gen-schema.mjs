/**
 * 从 `lib/schema.js` 生成 `data/schema.json`。
 *
 * `lib/schema.js` 是唯一的代码来源，`data/schema.json` 是给 agent
 * 和外部工具读的副本。改动字段定义后运行本脚本刷新副本：
 *
 *   node scripts/gen-schema.mjs
 *
 * `test/10-schema-sync.mjs` 会校验两者一致，CI 或提交前跑测试即可发现问题。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const { LOADERS, FEATURE_STATUS, FEATURE_PRIORITY, ITEM_TYPES, ITEM_FIELDS, MC_VERSION } =
  await import(`file:///${join(root, 'lib', 'schema.js').replace(/\\/g, '/')}`)

const payload = {
  schemaVersion: 1,
  mcVersion: MC_VERSION,
  loaders: LOADERS,
  featureStatus: FEATURE_STATUS,
  featurePriority: FEATURE_PRIORITY,
  itemTypes: ITEM_TYPES,
  itemFields: ITEM_FIELDS,
}

const target = join(root, 'data', 'schema.json')
await mkdir(dirname(target), { recursive: true })
await writeFile(target, JSON.stringify(payload, null, 2) + '\n', 'utf8')

console.log('已生成 data/schema.json')
console.log(
  `  加载器 ${LOADERS.length} · 构想状态 ${FEATURE_STATUS.length} · 优先级 ${FEATURE_PRIORITY.length}`,
)
console.log(`  物品类型 ${ITEM_TYPES.length} · 属性字段 ${ITEM_FIELDS.length}`)
