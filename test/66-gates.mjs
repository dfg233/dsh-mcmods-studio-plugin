/**
 * 用例 66：门禁脚本（P7/Q14/Q15）。
 */

import { spawnSync } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

const root = join(import.meta.dirname, '..')

function run(script) {
  return spawnSync(process.execPath, [join(root, 'scripts', script)], { encoding: 'utf8', cwd: root })
}

const cases = [
  {
    name: '语法门禁通过',
    async run() {
      const result = run('lint-syntax.mjs')
      equal(result.status, 0, `lint-syntax 应通过：${(result.stderr || '').slice(0, 200)}`)
      must(result.stdout.includes('语法检查通过'), '应输出通过信息')
    },
  },
  {
    name: '文档数字门禁能校验动作与工具',
    async run() {
      const result = run('check-docs.mjs')
      must(result.stdout.includes('动作数') && result.stdout.includes('工具数'), '应检查动作与工具')
      must(result.stdout.includes('(ok)'), '至少部分检查通过')
    },
  },
  {
    name: 'package.json 声明门禁脚本与 engines',
    async run() {
      const pkg = JSON.parse(await fsp.readFile(join(root, 'package.json'), 'utf8'))
      must(pkg.scripts['lint:syntax'], '应有 lint:syntax')
      must(pkg.scripts['check:docs'], '应有 check:docs')
      equal(pkg.engines?.node, '>=20', '应声明 Node >= 20')
    },
  },
]

process.exitCode = await runSuite('66 · 门禁脚本', cases)
