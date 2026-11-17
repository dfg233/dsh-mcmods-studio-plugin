/**
 * 用例 51：事实数据损坏 fail-closed（Q05）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, rejects, runSuite } from './helpers.mjs'

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Corrupt', modid, loader: 'forge', authors: 'Besson' })
  return dir
}

const cases = [
  {
    name: '损坏的任务文件抛 DATA_CORRUPT 且不被覆盖',
    async run(ws) {
      const dir = await makeProject(ws, 'corrupttasks')
      const file = join(dir, '.mcstudio', 'tasks.json')
      await fsp.mkdir(join(dir, '.mcstudio'), { recursive: true })
      await fsp.writeFile(file, '{ broken json', 'utf8')
      await rejects(() => ws.call('tasks.list', { path: dir }), '损坏', '应抛出损坏错误')
      const text = await fsp.readFile(file, 'utf8')
      equal(text, '{ broken json', '损坏文件不应被改写')
    },
  },
  {
    name: '损坏的模块文件抛错',
    async run(ws) {
      const dir = await makeProject(ws, 'corruptmodules')
      const file = join(dir, '.mcstudio', 'modules.json')
      await fsp.mkdir(join(dir, '.mcstudio'), { recursive: true })
      await fsp.writeFile(file, 'not json', 'utf8')
      await rejects(() => ws.call('modules.list', { path: dir }), '损坏', '应抛出损坏错误')
    },
  },
  {
    name: '缺失文件仍按空数据读取',
    async run(ws) {
      const dir = await makeProject(ws, 'missingtasks')
      const result = await ws.call('tasks.list', { path: dir })
      equal(Array.isArray(result.tasks), true, '缺失时返回空列表')
      equal(result.tasks.length, 0, '空列表')
    },
  },
  {
    name: '派生缓存仍允许回退',
    async run(ws) {
      // summary 属于派生物：损坏时应可重建，不阻塞
      const dir = await makeProject(ws, 'derivedmod')
      await fsp.mkdir(join(dir, '.mcstudio'), { recursive: true })
      await fsp.writeFile(join(dir, '.mcstudio', 'summary.json'), '{ bad', 'utf8')
      const summary = await ws.call('agent.summary', { path: dir })
      must(summary && typeof summary.counts === 'object', '摘要应可重建')
    },
  },
]

process.exitCode = await runSuite('51 · 数据损坏 fail-closed', cases)
