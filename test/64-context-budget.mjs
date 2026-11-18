/**
 * 用例 64：上下文预算硬边界（P5）。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function makeTask(ws, modid, options = {}) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Budget', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('modules.save', { path: dir, module: { id: 'm1', name: 'M1' } })
  await ws.call('stages.save', { path: dir, stage: { id: 's1', name: 'S1', moduleId: 'm1' } })
  await ws.call('tasks.save', {
    path: dir,
    task: {
      id: 't1', name: 'T1', moduleId: 'm1', stageId: 's1',
      allowedPaths: ['src/**'], guardPaths: [], verify: [],
      goal: options.goal ?? '简短目标',
      acceptance: options.acceptance ?? [],
    },
  })
  return dir
}

const cases = [
  {
    name: '超长中文目标被裁剪且不超预算',
    async run(ws) {
      const dir = await makeTask(ws, 'm64long', {
        goal: '这是一个非常长的目标描述。'.repeat(400),
        acceptance: ['验收标准很长。'.repeat(200)],
      })
      const result = await ws.call('context.pack', { path: dir, taskId: 't1', budget: { bytes: 1024 } })
      equal(result.budget.bytes, 1024, '预算被采用')
      must(result.budget.used <= 1024, `实际 ${result.budget.used} 应不超过 1024`)
      must(result.budget.truncated.some((item) => item.id === 'task.goal'), '应记录目标截断')
    },
  },
  {
    name: '预算下界被夹取',
    async run(ws) {
      const dir = await makeTask(ws, 'm64clamp')
      const result = await ws.call('context.pack', { path: dir, taskId: 't1', budget: { bytes: 10 } })
      equal(result.budget.bytes, 1024, '过小的预算应夹到 1024')
    },
  },
  {
    name: '短任务仍返回摘要',
    async run(ws) {
      const dir = await makeTask(ws, 'm64short')
      const result = await ws.call('context.pack', { path: dir, taskId: 't1' })
      equal(result.task.id, 't1', '任务摘要')
      must(typeof result.budget.used === 'number', '应返回 used')
      equal(result.budget.overBudget, false, '短任务不超预算')
    },
  },
]

process.exitCode = await runSuite('64 · 上下文预算', cases)
