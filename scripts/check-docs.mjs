/**
 * 文档数字校验（v0.6.1 P7/Q15）。
 *
 * 校验 INDEX / STATUS 中的动作数、工具数、测试文件数与实际一致；
 * 不一致时以非 0 退出，纳入发版门禁。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { listActions } from '../lib/api.js'
import { listTools } from '../lib/tools.js'

const root = join(import.meta.dirname, '..')

async function countTestFiles() {
  const dir = join(root, 'test')
  const entries = await fsp.readdir(dir).catch(() => [])
  return entries.filter((name) => /^\d{2}-.+\.mjs$/.test(name)).length
}

function findNumber(text, pattern) {
  const match = text.match(pattern)
  return match ? Number(match[1]) : null
}

const actions = listActions().length
const tools = listTools().length
const testFiles = await countTestFiles()

const indexText = await fsp.readFile(join(root, 'docs', 'INDEX.md'), 'utf8').catch(() => '')
const statusText = await fsp.readFile(join(root, 'docs', 'STATUS.md'), 'utf8').catch(() => '')
const combined = `${indexText}\n${statusText}`

const checks = [
  ['动作数（INDEX）', 'lib/api.js', findNumber(indexText, /(\d+) 个动作/), actions],
  ['工具数（INDEX）', 'lib/tools.js', findNumber(indexText, /(\d+) 个 agent 工具/), tools],
  ['测试文件数（INDEX/STATUS）', 'test', findNumber(combined, /(\d+) 个文件、\d+ 项/), testFiles],
]

const mismatches = checks.filter(([, , found, expected]) => found !== null && found !== expected)
for (const [label, source, found, expected] of checks) {
  const mark = found === null ? '未找到' : found === expected ? 'ok' : '不一致'
  console.log(`${label}: 文档 ${found ?? '—'} / 实际 ${expected} (${mark})`)
}
if (mismatches.length) {
  console.error(`\n文档数字不一致：${mismatches.map(([label]) => label).join('、')}`)
  process.exit(1)
}
console.log('\n文档数字校验通过')
