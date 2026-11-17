/**
 * 用例 48：任务批次栈、回滚与幂等（Q03/Q07/Q08）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Batch', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('modules.save', { path: dir, module: { id: 'm1', name: 'M1' } })
  await ws.call('stages.save', { path: dir, stage: { id: 's1', name: 'S1', moduleId: 'm1' } })
  await ws.call('tasks.save', {
    path: dir,
    task: {
      id: 't1', name: 'T1', moduleId: 'm1', stageId: 's1',
      allowedPaths: ['src/**'], guardPaths: [], verify: [],
    },
  })
  return dir
}

const read = (dir, rel) => fsp.readFile(join(dir, rel), 'utf8').catch(() => null)

const cases = [
  {
    name: '两批 apply 后默认回滚最近一批',
    async run(ws) {
      const dir = await makeProject(ws, 'batchmod')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }], requestId: 'r1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'B2' }], requestId: 'r2' })
      equal(await read(dir, 'src/a.txt'), 'B2', '第二批内容')

      const rolled = await ws.call('task.rollback', { path: dir, id: 't1' })
      equal(rolled.rolledBack, 1, '应回滚一批')
      equal(await read(dir, 'src/a.txt'), 'A1', '回到第一批内容')
      const tasks = await ws.call('tasks.list', { path: dir })
      const task = tasks.tasks.find((item) => item.id === 't1')
      equal(task.result.batches.length, 1, '剩余一个批次')
    },
  },
  {
    name: '全部回滚清空文件',
    async run(ws) {
      const dir = await makeProject(ws, 'batchall')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }] })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/b.txt', content: 'B1' }] })
      const rolled = await ws.call('task.rollback', { path: dir, id: 't1', all: true })
      equal(rolled.rolledBack, 2, '应回滚全部批次')
      equal(await read(dir, 'src/a.txt'), null, 'a 应被撤销')
      equal(await read(dir, 'src/b.txt'), null, 'b 应被撤销')
    },
  },
  {
    name: '未回滚时同 requestId 返回缓存',
    async run(ws) {
      const dir = await makeProject(ws, 'batchcached')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }], requestId: 'r1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      const again = await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }], requestId: 'r1' })
      equal(again.cached, true, '重放应命中缓存')
    },
  },
  {
    name: '回滚后重放旧 requestId 不假报成功',
    async run(ws) {
      const dir = await makeProject(ws, 'batchreplay')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }], requestId: 'r1' })
      await ws.call('task.rollback', { path: dir, id: 't1', all: true })
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      const replay = await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A1' }], requestId: 'r1' })
      must(replay.cached !== true, '回滚后重放不应返回 cached')
      equal(await read(dir, 'src/a.txt'), 'A1', '重放应重新写入')
    },
  },
]

process.exitCode = await runSuite('48 · 任务批次与幂等', cases)
