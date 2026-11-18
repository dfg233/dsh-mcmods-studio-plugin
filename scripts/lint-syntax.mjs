/**
 * 语法门禁（v0.6.1 P7/Q14）：对入口、客户端与 lib 下所有 JS 执行 node --check。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(import.meta.dirname, '..')
const files = ['index.js', 'client.js', 'scripts/check-docs.mjs', 'scripts/lint-syntax.mjs']

for (const name of await fsp.readdir(join(root, 'lib'))) {
  if (name.endsWith('.js')) files.push(`lib/${name}`)
}

const failures = []
for (const rel of files) {
  const result = spawnSync(process.execPath, ['--check', join(root, rel)], { encoding: 'utf8' })
  if (result.status !== 0) failures.push({ rel, error: (result.stderr || '').split('\n').slice(0, 3).join('\n') })
}

for (const file of files) {
  console.log(failures.some((item) => item.rel === file) ? `✗ ${file}` : `✓ ${file}`)
}
if (failures.length) {
  for (const failure of failures) console.error(`\n${failure.rel}\n${failure.error}`)
  process.exit(1)
}
console.log(`\n语法检查通过（${files.length} 个文件）`)
