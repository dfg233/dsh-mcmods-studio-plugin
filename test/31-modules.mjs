/**
 * 用例 31：模块与阶段（modules.json / stages.json、兼容 systems.json、任务校验）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm31') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '模块测试', modid, loader: 'forge' })
  return dir
}

async function saveModule(ws, dir, id = 'lock-core') {
  return ws.call('modules.save', {
    path: dir,
    module: { id, name: '锁核心', responsibility: '锁与钥匙', invariants: ['机械锁行为不变'] },
  })
}

const cases = [
  {
    name: '模块保存到 modules.json',
    async run(ws) {
      const dir = await newProject(ws, 'modsave')
      const result = await saveModule(ws, dir)
      equal(result.module.id, 'lock-core', '返回模块')
      const raw = JSON.parse(await readFile(join(dir, '.mcstudio', 'modules.json'), 'utf8'))
      equal(raw.modules.length, 1, 'modules.json 写入一条')
      const list = await ws.call('modules.list', { path: dir })
      equal(list.modules.length, 1, 'list 读回')
    },
  },
  {
    name: '旧 systems.json 作为回退',
    async run(ws) {
      const dir = await newProject(ws, 'modlegacy')
      await ws.write(join(dir, '.mcstudio', 'systems.json'), JSON.stringify({
        schemaVersion: 1,
        systems: [{ id: 'legacy-core', name: '旧系统', responsibility: '旧数据' }],
      }))
      const list = await ws.call('modules.list', { path: dir })
      equal(list.modules.length, 1, '回退读到 systems.json')
      equal(list.modules[0].id, 'legacy-core', '旧系统作为模块')
      const plan = await ws.call('workbench.plan', { path: dir })
      equal(plan.modules.length, 1, 'plan 也返回 modules')
    },
  },
  {
    name: '阶段保存与校验',
    async run(ws) {
      const dir = await newProject(ws, 'stagesave')
      await saveModule(ws, dir)
      const saved = await ws.call('stages.save', {
        path: dir,
        stage: { id: 'stage-1', moduleId: 'lock-core', name: '绑定', order: 1, status: 'doing' },
      })
      equal(saved.stage.moduleId, 'lock-core', '阶段保存')
      equal(saved.stage.order, 1, '顺序保存')
      const list = await ws.call('stages.list', { path: dir })
      equal(list.stages.length, 1, '阶段列表')
    },
  },
  {
    name: '阶段所属模块不存在被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'stagebad')
      let message = ''
      try {
        await ws.call('stages.save', { path: dir, stage: { id: 'stage-x', moduleId: 'missing', name: 'x' } })
      } catch (error) { message = error.message }
      must(message.includes('阶段所属模块不存在'), `应拒绝，实际「${message}」`)
    },
  },
  {
    name: '任务带模块与阶段',
    async run(ws) {
      const dir = await newProject(ws, 'taskstage')
      await saveModule(ws, dir)
      await ws.call('stages.save', { path: dir, stage: { id: 'stage-1', moduleId: 'lock-core', name: '绑定', order: 1 } })
      const saved = await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 'task-1', title: 'UUID 绑定', moduleId: 'lock-core', stageId: 'stage-1',
          allowedPaths: ['src/main/java/com/example/**'],
        },
      })
      equal(saved.task.moduleId, 'lock-core', 'moduleId 保存')
      equal(saved.task.stageId, 'stage-1', 'stageId 保存')
      equal(saved.task.systemId, 'lock-core', 'systemId 同步')
      equal(saved.task.confirmed, false, '默认未确认')
    },
  },
  {
    name: '任务阶段不属于模块被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'taskbadstage')
      await saveModule(ws, dir, 'm1')
      await saveModule(ws, dir, 'm2')
      await ws.call('stages.save', { path: dir, stage: { id: 'stage-1', moduleId: 'm1', name: 'x' } })
      let message = ''
      try {
        await ws.call('tasks.save', {
          path: dir,
          task: {
            id: 'task-2', title: 'x', moduleId: 'm2', stageId: 'stage-1',
            allowedPaths: ['src/main/java/x/**'],
          },
        })
      } catch (error) { message = error.message }
      must(message.includes('阶段不属于该模块'), `应拒绝，实际「${message}」`)
    },
  },
  {
    name: 'confirmed 与旧 systemId 兼容',
    async run(ws) {
      const dir = await newProject(ws, 'taskconfirm')
      await saveModule(ws, dir)
      await ws.call('tasks.save', {
        path: dir,
        task: { id: 'task-3', title: '旧字段', systemId: 'lock-core', allowedPaths: ['src/main/java/x/**'] },
      })
      const confirmed = await ws.call('tasks.save', {
        path: dir,
        task: { id: 'task-3', confirmed: true },
      })
      equal(confirmed.task.confirmed, true, '确认写入')
      equal(confirmed.task.moduleId, 'lock-core', '旧 systemId 同步为 moduleId')
    },
  },
  {
    name: 'workbench 工具支持模块与阶段',
    async run(ws) {
      const dir = await newProject(ws, 'tool31')
      const mod = await ws.call('agent.call', {
        tool: 'workbench',
        args: { action: 'module.save', project: dir, module: { id: 'tool-core', name: '工具模块' } },
      })
      equal(mod.module.id, 'tool-core', '工具保存模块')
      const stage = await ws.call('agent.call', {
        tool: 'workbench',
        args: { action: 'stage.save', project: dir, stage: { id: 'tool-stage', moduleId: 'tool-core', name: '阶段' } },
      })
      equal(stage.stage.moduleId, 'tool-core', '工具保存阶段')
    },
  },
  {
    name: '任务确认与取消确认',
    async run(ws) {
      const dir = await newProject(ws, 'taskconfirmflow')
      await saveModule(ws, dir)
      await ws.call('tasks.save', {
        path: dir,
        task: { id: 'task-c', title: '确认', moduleId: 'lock-core', allowedPaths: ['a.java'] },
      })
      const confirmed = await ws.call('tasks.confirm', { path: dir, id: 'task-c' })
      equal(confirmed.task.confirmed, true, '确认标记')
      equal(confirmed.task.status, 'review', '确认后进入 review')
      const unconfirmed = await ws.call('tasks.unconfirm', { path: dir, id: 'task-c' })
      equal(unconfirmed.task.confirmed, false, '取消确认')
      equal(unconfirmed.task.status, 'doing', '取消后回到 doing')
    },
  },
  {
    name: '确认不存在的任务被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'taskconfirmbad')
      let message = ''
      try { await ws.call('tasks.confirm', { path: dir, id: 'missing' }) } catch (error) { message = error.message }
      must(message.includes('任务不存在'), `应拒绝，实际「${message}」`)
    },
  },
  {
    name: '导出计划简报与接手摘要',
    async run(ws) {
      const dir = await newProject(ws, 'planexport')
      await saveModule(ws, dir)
      await ws.call('stages.save', { path: dir, stage: { id: 'stage-1', moduleId: 'lock-core', name: '绑定', order: 0 } })
      await ws.call('tasks.save', {
        path: dir,
        task: { id: 'task-1', title: 'UUID 绑定', moduleId: 'lock-core', stageId: 'stage-1', allowedPaths: ['a.java'] },
      })
      const exported = await ws.call('plan.export', { path: dir })
      must(exported.path.includes('PLAN.md'), '写入 PLAN.md')
      must(exported.markdown.includes('## 模块：锁核心'), '含模块标题')
      must(exported.markdown.includes('### 阶段 1：绑定'), '含阶段标题')
      must(exported.markdown.includes('- [ ] UUID 绑定'), '含未确认任务')
      const handoff = await ws.call('plan.handoff', { path: dir })
      equal(handoff.plan.modules, 1, 'handoff 模块数')
      equal(handoff.plan.stages, 1, 'handoff 阶段数')
      equal(handoff.plan.tasks, 1, 'handoff 任务数')
      equal(handoff.plan.pending, 1, 'handoff 待确认数')
    },
  },
  {
    name: '确认后导出任务打勾',
    async run(ws) {
      const dir = await newProject(ws, 'plancheck')
      await saveModule(ws, dir)
      await ws.call('tasks.save', { path: dir, task: { id: 'task-x', title: '任务', moduleId: 'lock-core', allowedPaths: ['a.java'] } })
      await ws.call('tasks.confirm', { path: dir, id: 'task-x' })
      const exported = await ws.call('plan.export', { path: dir })
      must(exported.markdown.includes('- [x] 任务'), '已确认任务打勾')
      const handoff = await ws.call('plan.handoff', { path: dir })
      equal(handoff.plan.pending, 0, '确认后无待确认')
    },
  },
]

process.exitCode = await runSuite('31 · 模块与阶段', cases)
