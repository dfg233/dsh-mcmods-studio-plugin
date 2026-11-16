/**
 * 用例 45：失效项目清理（project.prune）。
 */

import { promises as fsp } from 'node:fs'

import { equal, must, runSuite } from './helpers.mjs'

const cases = [
  {
    name: '目录删除后标记 missing 并可清理',
    async run(ws) {
      const dir = ws.path('stale')
      await ws.call('project.create', { path: dir, name: 'Stale', modid: 'stalemod', loader: 'forge', authors: 'Besson' })
      await fsp.rm(dir, { recursive: true, force: true })

      const boot = await ws.call('boot', {})
      const entry = boot.registry.projects.find((item) => item.path.endsWith('stale'))
      must(entry, '注册表应保留条目')
      equal(entry.missing, true, '应标记 missing')

      const pruned = await ws.call('project.prune', {})
      must(pruned.removed.some((path) => path.endsWith('stale')), '应清理失效条目')

      const after = await ws.call('boot', {})
      must(!after.registry.projects.some((item) => item.path.endsWith('stale')), '清理后不应再出现')
    },
  },
  {
    name: '正常项目不被清理',
    async run(ws) {
      const dir = ws.path('alive')
      await ws.call('project.create', { path: dir, name: 'Alive', modid: 'alivemod', loader: 'forge', authors: 'Besson' })
      const pruned = await ws.call('project.prune', {})
      must(!pruned.removed.some((path) => path.endsWith('alive')), '正常项目不应被清理')
      const boot = await ws.call('boot', {})
      must(boot.registry.projects.some((item) => item.path.endsWith('alive')), '正常项目应保留')
    },
  },
]

process.exitCode = await runSuite('45 · 失效项目清理', cases)
