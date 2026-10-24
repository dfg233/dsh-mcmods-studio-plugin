/**
 * 测试入口：依次运行全部用例文件，汇总结果。
 *
 * 用法：
 *   node test/run.mjs          跑全部
 *   node test/run.mjs imports  只跑文件名匹配的用例（子串匹配）
 */

import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const filter = process.argv[2] ?? ''

const files = (await readdir(here))
  .filter((name) => /^\d{2}-.*\.mjs$/.test(name))
  .filter((name) => (filter ? name.includes(filter) : true))
  .sort()

if (files.length === 0) {
  console.error(`没有匹配的用例文件（筛选条件：${filter || '无'}）`)
  process.exit(1)
}

/** 逐个串行执行，避免多个用例同时改写 process.env.DSH_HOME。 */
function runFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], {
      stdio: 'inherit',
      cwd: join(here, '..'),
    })
    child.on('close', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

const results = []
for (const file of files) {
  const code = await runFile(file)
  results.push({ file, code })
}

const failed = results.filter((item) => item.code !== 0)

console.log(`\n${'═'.repeat(60)}`)
console.log(`  汇总：${results.length} 个用例文件，通过 ${results.length - failed.length}，失败 ${failed.length}`)
console.log('═'.repeat(60))

if (failed.length > 0) {
  for (const item of failed) console.log(`  ✗ ${item.file}`)
  process.exit(1)
}

console.log('  全部通过')
process.exit(0)
