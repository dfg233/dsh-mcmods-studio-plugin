/**
 * 用例 23：任务上下文包（组成、codeRefs、预算裁剪、工具）。
 */

import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'ctxmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '上下文测试', modid, loader: 'forge' })
  await ws.call('systems.save', {
    path: dir,
    system: { id: 's1', name: '系统一', responsibility: '测试职责', invariants: ['不能改机械锁'] },
  })
  return dir
}

async function saveTask(ws, dir, patch = {}) {
  const task = {
    id: 't1',
    title: '任务一',
    systemId: 's1',
    goal: '测试上下文',
    allowedPaths: ['src/main/java/com/example/ctxmod/item/Ruby.java'],
    acceptance: ['可编译'],
    verify: ['allowed-paths'],
    status: 'todo',
    ...patch,
  }
  await ws.call('tasks.save', { path: dir, task })
  return task
}

const cases = [
  {
    name: '打包基本任务上下文',
    async run(ws) {
      const dir = await newProject(ws)
      await saveTask(ws, dir)
      const context = await ws.call('context.pack', { path: dir, taskId: 't1' })
      equal(context.task.id, 't1', '应包含任务')
      equal(context.system.id, 's1', '应包含系统卡')
      equal(context.invariants[0], '不能改机械锁', '应包含不变量')
      equal(context.allowedPaths[0].mode, 'modify', '允许路径应归一化')
      equal(context.apiUnknown, true, '无索引时应标记 apiUnknown')
      equal(context.budget.files, 10, '默认文件预算')
    },
  },
  {
    name: '模板合并 apiRefs 与资源',
    async run(ws) {
      const dir = await newProject(ws, 'ctxtpl')
      await saveTask(ws, dir, {
        templateRefs: [{ id: 'simple-item', version: 1, parameters: { id: 'ruby' } }],
      })
      const context = await ws.call('context.pack', { path: dir, taskId: 't1' })
      equal(context.templates.length, 1, '应包含模板摘要')
      equal(context.templates[0].id, 'simple-item', '模板 id 正确')
      must(context.templates[0].files.some((item) => item.includes('/models/item/')), '模板摘要应含模型路径')
      equal(context.resources.length, 0, '模板文件不再重复计入 resources')
    },
  },
  {
    name: 'codeRefs 解析到结构与摘录',
    async run(ws) {
      const dir = await newProject(ws, 'ctxref')
      await ws.write(
        join(dir, 'src/main/java/com/example/ctxref/Thing.java'),
        'package com.example.ctxref;\n\npublic class Thing {\n    public void run() {}\n}\n',
      )
      await ws.call('structure.refresh', { path: dir })
      await saveTask(ws, dir, { codeRefs: ['Thing'] })

      const context = await ws.call('context.pack', { path: dir, taskId: 't1' })
      equal(context.classes.length, 1, '应解析到一个类')
      must(context.classes[0].path.endsWith('Thing.java'), '应带文件路径')
      must(context.classes[0].excerpt.includes('class Thing'), '应带摘录')
      equal(context.missingRefs.length, 0, '不应有缺失引用')
    },
  },
  {
    name: '缺失 codeRefs 标记为 missingRefs',
    async run(ws) {
      const dir = await newProject(ws, 'ctxmissing')
      await saveTask(ws, dir, { codeRefs: ['NotExists'] })
      const context = await ws.call('context.pack', { path: dir, taskId: 't1' })
      equal(context.classes.length, 0, '没有可解析的类')
      must(context.missingRefs.includes('NotExists'), '应记录缺失引用')
    },
  },
  {
    name: '文件数预算裁剪资源',
    async run(ws) {
      const dir = await newProject(ws, 'ctxbudget')
      await saveTask(ws, dir, {
        contextRefs: Array.from({ length: 15 }, (_, index) => `resource:assets/ctxbudget/file${index}.json`),
      })
      const context = await ws.call('context.pack', { path: dir, taskId: 't1', budget: { files: 10 } })
      equal(context.resources.length, 10, '资源应裁到 10 个')
      equal(context.budget.truncated.length, 5, '应记录 5 条裁剪')
    },
  },
  {
    name: '字节预算清空摘录',
    async run(ws) {
      const dir = await newProject(ws, 'ctxbytes')
      await ws.write(
        join(dir, 'src/main/java/com/example/ctxbytes/Thing.java'),
        `package com.example.ctxbytes;\n\npublic class Thing {\n${'  // padding padding padding\n'.repeat(40)}}\n`,
      )
      await ws.call('structure.refresh', { path: dir })
      await saveTask(ws, dir, { codeRefs: ['Thing'] })

      const context = await ws.call('context.pack', { path: dir, taskId: 't1', budget: { bytes: 900 } })
      equal(context.classes[0].excerpt, '', '摘录应被清空')
      must(context.budget.truncated.some((item) => item.reason === 'byte-budget'), '应记录字节裁剪')
    },
  },
  {
    name: 'context 工具调用',
    async run(ws) {
      const dir = await newProject(ws, 'ctxtool')
      await saveTask(ws, dir)
      const context = await ws.call('agent.call', {
        tool: 'context',
        args: { project: dir, taskId: 't1' },
      })
      equal(context.task.id, 't1', '工具应返回上下文')
    },
  },
]

process.exitCode = await runSuite('23 · 任务上下文', cases)
