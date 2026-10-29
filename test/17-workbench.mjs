/**
 * 用例 17：工作台计划数据（系统卡、任务包）。
 */

import { equal, must, rejects, runSuite } from './helpers.mjs'

async function makeProject(ws, name = 'plan') {
  const dir = ws.path(name)
  await ws.call('project.create', { path: dir, name: '计划测试', modid: 'planmod', loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '系统卡保存、读取与字段归一',
    async run(ws) {
      const dir = await makeProject(ws, 'sys')
      await ws.call('systems.save', {
        path: dir,
        system: {
          id: 'lock-core', name: '锁核心', responsibility: '锁状态',
          invariants: ['服务端权威'], resources: ['data/lock/tags/blocks/lockable.json'],
          dependsOn: ['key-binding'], status: 'stable',
        },
      })
      const { systems } = await ws.call('systems.list', { path: dir })
      const system = systems.find((item) => item.id === 'lock-core')
      equal(system.name, '锁核心', '应保存名称')
      equal(system.resources[0].kind, 'other', '字符串资源应归一为对象')
      equal(system.resources[0].path, 'data/lock/tags/blocks/lockable.json', '资源路径应保留')
      must(system.updatedAt, '应写入更新时间')
    },
  },
  {
    name: '任务包保存、默认值与引用校验',
    async run(ws) {
      const dir = await makeProject(ws, 'task')
      await ws.call('systems.save', { path: dir, system: { id: 'lock-core', name: '锁核心' } })
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't_electronic_01', title: '新增电子锁', systemId: 'lock-core',
          allowedPaths: ['src/main/java/com/example/ElectronicLock.java'],
          verify: ['allowed-paths'], status: 'todo',
        },
      })
      const { tasks } = await ws.call('tasks.list', { path: dir })
      const task = tasks.find((item) => item.id === 't_electronic_01')
      equal(task.allowedPaths[0].mode, 'modify', '字符串路径默认 modify')
      equal(task.verify[0].runner, 'host', '字符串检查默认 host')
      equal(task.status, 'todo', '状态应保留')
    },
  },
  {
    name: '任务缺少系统或允许路径时拒绝',
    async run(ws) {
      const dir = await makeProject(ws, 'invalid')
      await rejects(
        () => ws.call('tasks.save', { path: dir, task: { id: 't_a', title: '无系统', systemId: 'missing', allowedPaths: ['a.java'] } }),
        '所属系统不存在',
        '不存在的系统应拒绝',
      )
      await ws.call('systems.save', { path: dir, system: { id: 'lock-core', name: '锁核心' } })
      await rejects(
        () => ws.call('tasks.save', { path: dir, task: { id: 't_b', title: '无路径', systemId: 'lock-core' } }),
        '至少需要一个允许修改的路径',
        '空允许路径应拒绝',
      )
    },
  },
  {
    name: '计划读取同时返回想法、系统与任务',
    async run(ws) {
      const dir = await makeProject(ws, 'plan-all')
      await ws.call('features.save', { path: dir, feature: { id: 'f_1', name: '想法' } })
      await ws.call('systems.save', { path: dir, system: { id: 'lock-core', name: '锁核心' } })
      await ws.call('tasks.save', { path: dir, task: { id: 't_1', title: '任务', systemId: 'lock-core', allowedPaths: ['a.java'] } })
      const plan = await ws.call('workbench.plan', { path: dir })
      equal(plan.ideas.length, 1, '应返回想法')
      equal(plan.systems.length, 1, '应返回系统')
      equal(plan.tasks.length, 1, '应返回任务')

      const viaTool = await ws.call('agent.call', { tool: 'workbench', args: { action: 'plan', project: dir } })
      equal(viaTool.systems.length, 1, 'workbench 工具应能读取计划')
    },
  },
  {
    name: '删除系统与任务',
    async run(ws) {
      const dir = await makeProject(ws, 'delete')
      await ws.call('systems.save', { path: dir, system: { id: 'lock-core', name: '锁核心' } })
      await ws.call('tasks.save', { path: dir, task: { id: 't_1', title: '任务', systemId: 'lock-core', allowedPaths: ['a.java'] } })
      await ws.call('tasks.delete', { path: dir, id: 't_1' })
      await ws.call('systems.delete', { path: dir, id: 'lock-core' })
      const plan = await ws.call('workbench.plan', { path: dir })
      equal(plan.tasks.length, 0, '任务应删除')
      equal(plan.systems.length, 0, '系统应删除')
    },
  },
]

process.exitCode = await runSuite('17 · 工作台计划数据', cases)
