/**
 * 用例 46：路径策略（normalizeProjectPath / matchesPath）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, rejects, runSuite } from './helpers.mjs'
import { normalizeProjectPath, normalizePathText } from '../lib/paths.js'
import { matchesPath } from '../lib/checks.js'

const cases = [
  {
    name: '拒绝父级跳转与绝对路径',
    async run(ws) {
      const dir = ws.path('pathmod')
      await ws.call('project.create', { path: dir, name: 'Path', modid: 'pathmod', loader: 'forge', authors: 'Besson' })
      for (const bad of ['src/../protected.txt', '../outside.txt', '/abs.txt', 'C:/abs.txt']) {
        let code = ''
        try { await normalizeProjectPath(dir, bad) } catch (error) { code = error.code }
        equal(code, 'PATH_OUTSIDE', `应拒绝 ${bad}`)
      }
    },
  },
  {
    name: '接受项目内路径并规范化',
    async run(ws) {
      const dir = ws.path('pathok')
      await ws.call('project.create', { path: dir, name: 'Path', modid: 'pathok', loader: 'forge', authors: 'Besson' })
      equal(await normalizeProjectPath(dir, 'src/main.js'), 'src/main.js', '正常相对路径')
      equal(await normalizeProjectPath(dir, 'a/./b.txt'), 'a/b.txt', '折叠 . 段')
      equal(normalizePathText('src\\a\\..\\b'), 'src/b', '文本规范化')
    },
  },
  {
    name: 'guard 命中折叠后的路径',
    async run() {
      equal(matchesPath('protected.txt', 'src/../protected.txt'), true, 'guard 应命中折叠路径')
      equal(matchesPath('src/**', 'src/../protected.txt'), false, 'allowed 不应命中折叠路径')
    },
  },
  {
    name: '任务 apply 拒绝越界路径',
    async run(ws) {
      const dir = ws.path('pathapply')
      await ws.call('project.create', { path: dir, name: 'Path', modid: 'pathapply', loader: 'forge', authors: 'Besson' })
      const plan = await ws.call('workbench.plan', { path: dir })
      const module = await ws.call('modules.save', { path: dir, module: { id: 'm1', name: 'M1' } })
      const stage = await ws.call('stages.save', { path: dir, stage: { id: 's1', name: 'S1', moduleId: 'm1' } })
      const task = await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', name: 'T1', moduleId: 'm1', stageId: 's1',
          allowedPaths: ['src/**'], guardPaths: ['protected.txt'],
          verify: [],
        },
      })
      await ws.call('task.start', { path: dir, id: 't1' })
      let code = ''
      try {
        await ws.call('tasks.confirm', { path: dir, id: 't1' })
        await ws.call('task.apply', {
          path: dir,
          id: 't1',
          files: [{ path: 'src/../protected.txt', content: 'x' }],
        })
      } catch (error) { code = error.code || '' }
      equal(code, 'PATH_OUTSIDE', 'apply 应拒绝父级跳转')
      const exists = await fsp.stat(join(dir, 'protected.txt')).then(() => true).catch(() => false)
      equal(exists, false, '被拒绝后不应写入文件')
      void plan
      void module
      void stage
      void task
    },
  },
]

process.exitCode = await runSuite('46 · 路径策略', cases)
