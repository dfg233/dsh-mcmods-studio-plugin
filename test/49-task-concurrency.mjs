/**
 * 用例 49：并发一致性（Q04/Q08）——项目级串行与幂等。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Concurrent', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('modules.save', { path: dir, module: { id: 'm1', name: 'M1' } })
  await ws.call('stages.save', { path: dir, stage: { id: 's1', name: 'S1', moduleId: 'm1' } })
  for (const id of ['t1', 't2']) {
    await ws.call('tasks.save', {
      path: dir,
      task: { id, name: id, moduleId: 'm1', stageId: 's1', allowedPaths: ['src/**'], guardPaths: [], verify: [] },
    })
  }
  return dir
}

const cases = [
  {
    name: '两个任务并发 apply 不丢更新',
    async run(ws) {
      const dir = await makeProject(ws, 'concmod')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('task.start', { path: dir, id: 't2' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't2' })
      await Promise.all([
        ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/t1.txt', content: '1' }], requestId: 'a' }),
        ws.call('task.apply', { path: dir, id: 't2', files: [{ path: 'src/t2.txt', content: '2' }], requestId: 'b' }),
      ])
      const tasks = await ws.call('tasks.list', { path: dir })
      const t1 = tasks.tasks.find((item) => item.id === 't1')
      const t2 = tasks.tasks.find((item) => item.id === 't2')
      must(t1.result.appliedAt, 't1 应记录 apply')
      must(t2.result.appliedAt, 't2 应记录 apply')
      equal(t1.revision >= 2, true, 't1 revision 应递增')
      equal(t2.revision >= 2, true, 't2 revision 应递增')
      equal(await fsp.readFile(join(dir, 'src/t1.txt'), 'utf8'), '1', 't1 文件')
      equal(await fsp.readFile(join(dir, 'src/t2.txt'), 'utf8'), '2', 't2 文件')
    },
  },
  {
    name: '同 requestId 并发只应用一次',
    async run(ws) {
      const dir = await makeProject(ws, 'concidem')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      const files = [{ path: 'src/x.txt', content: 'X' }]
      const [first, second] = await Promise.all([
        ws.call('task.apply', { path: dir, id: 't1', files, requestId: 'same' }),
        ws.call('task.apply', { path: dir, id: 't1', files, requestId: 'same' }),
      ])
      const cached = [first, second].filter((item) => item.cached === true)
      equal(cached.length, 1, '应有一次命中缓存')
      const tasks = await ws.call('tasks.list', { path: dir })
      const task = tasks.tasks.find((item) => item.id === 't1')
      equal(task.result.batches.length, 1, '只应产生一个批次')
    },
  },
  {
    name: '确认与 apply 交错不丢状态',
    async run(ws) {
      const dir = await makeProject(ws, 'concinter')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await Promise.all([
        ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/y.txt', content: 'Y' }] }),
        ws.call('tasks.list', { path: dir }),
      ])
      const tasks = await ws.call('tasks.list', { path: dir })
      const task = tasks.tasks.find((item) => item.id === 't1')
      must(task.confirmed === true, '确认状态应保留')
      must(task.result.appliedAt, 'apply 记录应保留')
    },
  },
]

process.exitCode = await runSuite('49 · 并发一致性', cases)
