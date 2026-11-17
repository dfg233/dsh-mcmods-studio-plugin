/**
 * 用例 47：确认协议（Q02）——写前批准 + 写后验收。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Confirm', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('modules.save', { path: dir, module: { id: 'm1', name: 'M1' } })
  await ws.call('stages.save', { path: dir, stage: { id: 's1', name: 'S1', moduleId: 'm1' } })
  await ws.call('tasks.save', {
    path: dir,
    task: { id: 't1', name: 'T1', moduleId: 'm1', stageId: 's1', allowedPaths: ['src/**'], guardPaths: [], verify: [] },
  })
  await ws.call('task.start', { path: dir, id: 't1' })
  return dir
}

async function codeOf(call) {
  try { await call() } catch (error) { return error.code || '' }
  return ''
}

const cases = [
  {
    name: '未确认 apply 被拒绝',
    async run(ws) {
      const dir = await makeProject(ws, 'confnoreq')
      const code = await codeOf(() => ws.call('task.apply', {
        path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }],
      }))
      equal(code, 'CONFIRMATION_REQUIRED', '应要求确认')
    },
  },
  {
    name: '确认后 apply 成功并消费凭据',
    async run(ws) {
      const dir = await makeProject(ws, 'confok')
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }] })
      equal(await fsp.readFile(join(dir, 'src/a.txt'), 'utf8'), 'A', '应写入')
      // 凭据已消费：再次 apply 需要重新确认
      const code = await codeOf(() => ws.call('task.apply', {
        path: dir, id: 't1', files: [{ path: 'src/b.txt', content: 'B' }],
      }))
      equal(code, 'CONFIRMATION_REQUIRED', '凭据应一次性消费')
    },
  },
  {
    name: '确认 A 后提交 B 被拒绝',
    async run(ws) {
      const dir = await makeProject(ws, 'confstale')
      await ws.call('tasks.confirm', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }] })
      const code = await codeOf(() => ws.call('task.apply', {
        path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'B' }],
      }))
      equal(code, 'CONFIRMATION_STALE', '内容不一致应拒绝')
    },
  },
  {
    name: '确认后文件被外部修改被拒绝',
    async run(ws) {
      const dir = await makeProject(ws, 'conffile')
      await ws.call('tasks.confirm', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }] })
      await fsp.mkdir(join(dir, 'src'), { recursive: true })
      await fsp.writeFile(join(dir, 'src/a.txt'), 'external', 'utf8')
      const code = await codeOf(() => ws.call('task.apply', {
        path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }],
      }))
      equal(code, 'CONFIRMATION_STALE', '文件基线变化应拒绝')
    },
  },
  {
    name: '任务在确认后被修改则凭据过期',
    async run(ws) {
      const dir = await makeProject(ws, 'conftask')
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('tasks.save', { path: dir, task: { id: 't1', goal: 'changed' } })
      const code = await codeOf(() => ws.call('task.apply', {
        path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }],
      }))
      equal(code, 'CONFIRMATION_STALE', '任务定义变化应拒绝')
    },
  },
  {
    name: '写后验收记录 acceptedAt',
    async run(ws) {
      const dir = await makeProject(ws, 'confaccept')
      await ws.call('tasks.confirm', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [{ path: 'src/a.txt', content: 'A' }] })
      const accepted = await ws.call('tasks.accept', { path: dir, id: 't1' })
      must(accepted.task.acceptedAt, '应记录 acceptedAt')
      equal(accepted.task.status, 'done', '验收后状态为 done')
    },
  },
]

process.exitCode = await runSuite('47 · 确认协议', cases)
