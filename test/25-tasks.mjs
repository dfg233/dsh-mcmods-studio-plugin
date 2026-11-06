/**
 * 用例 25：任务执行（开始、应用、幂等、验证、回滚、工具）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

const JAVA = 'src/main/java/com/example/taskmod/item/Ruby.java'
const MODEL = 'src/main/resources/assets/taskmod/models/item/ruby.json'

async function newProject(ws, modid = 'taskmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '任务测试', modid, loader: 'forge' })
  await ws.call('systems.save', {
    path: dir,
    system: { id: 's1', name: '系统一', responsibility: '测试' },
  })
  await ws.call('tasks.save', {
    path: dir,
    task: {
      id: 't1',
      title: '新增 Ruby',
      systemId: 's1',
      goal: '生成 Ruby 物品',
      allowedPaths: [JAVA, MODEL],
      acceptance: ['可编译'],
      verify: ['allowed-paths', 'resource-exists'],
      status: 'todo',
    },
  })
  return dir
}

const changes = [
  { path: JAVA, content: 'package com.example.taskmod.item;\npublic class Ruby extends Item {}\n' },
  { path: MODEL, content: '{"parent":"minecraft:item/generated"}\n' },
]

const cases = [
  {
    name: 'task.start 保存结构快照并进入 doing',
    async run(ws) {
      const dir = await newProject(ws)
      const result = await ws.call('task.start', { path: dir, id: 't1' })
      equal(result.task.status, 'doing', '状态应为 doing')
      must(result.task.baseStructureHash, '应生成结构快照')
      equal(result.context.task.id, 't1', '应返回上下文摘要')
    },
  },
  {
    name: 'task.apply 写入变更集并备份',
    async run(ws) {
      const dir = await newProject(ws, 'taskapply')
      await ws.call('task.start', { path: dir, id: 't1' })
      const result = await ws.call('task.apply', { path: dir, id: 't1', files: changes, requestId: 'r1' })
      must(result.backupDir, '应返回备份目录')
      equal(result.files.length, 2, '应记录两个文件')
      const java = await readFile(join(dir, JAVA), 'utf8')
      must(java.includes('class Ruby'), 'Java 文件应写入')
    },
  },
  {
    name: 'task.apply 拒绝越界路径',
    async run(ws) {
      const dir = await newProject(ws, 'taskguard')
      await ws.call('task.start', { path: dir, id: 't1' })
      let message = ''
      try {
        await ws.call('task.apply', {
          path: dir,
          id: 't1',
          files: [{ path: 'src/main/java/com/example/taskguard/lock/Key.java', content: 'x' }],
        })
      } catch (error) {
        message = error.message
      }
      must(message.includes('越界修改'), `应拒绝越界路径，实际「${message}」`)
    },
  },
  {
    name: 'task.apply 同 requestId 幂等',
    async run(ws) {
      const dir = await newProject(ws, 'taskidem')
      await ws.call('task.start', { path: dir, id: 't1' })
      const first = await ws.call('task.apply', { path: dir, id: 't1', files: changes, requestId: 'same' })
      await ws.write(join(dir, JAVA), 'changed\n')
      const second = await ws.call('task.apply', { path: dir, id: 't1', files: changes, requestId: 'same' })
      equal(second.cached, true, '应返回缓存结果')
      equal(first.backupDir, second.backupDir, '不应重复备份')
      const content = await readFile(join(dir, JAVA), 'utf8')
      equal(content, 'changed\n', '重放请求不应再写入')
    },
  },
  {
    name: 'task.verify 通过后进入 review',
    async run(ws) {
      const dir = await newProject(ws, 'taskpass')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: changes, requestId: 'r1' })
      const result = await ws.call('task.verify', { path: dir, id: 't1' })
      equal(result.task.status, 'review', '全部通过应进入 review')
      const allowed = result.checks.find((item) => item.id === 'allowed-paths')
      equal(allowed.status, 'pass', 'allowed-paths 应通过')
    },
  },
  {
    name: 'task.verify 失败后 blocked',
    async run(ws) {
      const dir = await newProject(ws, 'taskfail')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1',
          title: '新增 Ruby',
          systemId: 's1',
          goal: '测试失败',
          allowedPaths: [JAVA, MODEL],
          acceptance: ['可编译'],
          verify: ['allowed-paths'],
          status: 'doing',
          result: { files: [{ path: 'src/main/java/com/example/taskfail/Other.java' }] },
        },
      })
      const result = await ws.call('task.verify', { path: dir, id: 't1' })
      equal(result.task.status, 'blocked', '失败应进入 blocked')
      equal(result.failed, 1, '应有一个失败检查')
    },
  },
  {
    name: 'task.rollback 恢复任务文件',
    async run(ws) {
      const dir = await newProject(ws, 'taskrollback')
      await ws.write(join(dir, JAVA), 'original\n')
      await ws.call('task.start', { path: dir, id: 't1' })
      await ws.call('task.apply', { path: dir, id: 't1', files: [changes[0]], requestId: 'r1' })
      let content = await readFile(join(dir, JAVA), 'utf8')
      must(content.includes('class Ruby'), '应用后应覆盖')

      const result = await ws.call('task.rollback', { path: dir, id: 't1' })
      equal(result.task.status, 'doing', '回滚后回到 doing')
      content = await readFile(join(dir, JAVA), 'utf8')
      equal(content, 'original\n', '应恢复原内容')
    },
  },
  {
    name: 'task.start 遇到缺失 codeRefs 时标记 blocked',
    async run(ws) {
      const dir = await newProject(ws, 'taskblocked')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', title: '新增 Ruby', systemId: 's1', goal: '测试缺失引用',
          allowedPaths: [JAVA, MODEL], acceptance: ['可编译'],
          verify: ['allowed-paths'], status: 'todo', codeRefs: ['NotExists'],
        },
      })
      const result = await ws.call('task.start', { path: dir, id: 't1' })
      equal(result.blocked, true, '应在结果中标记 blocked')
      equal(result.task.status, 'blocked', '任务状态应为 blocked')
      must(result.missingRefs.includes('NotExists'), '应返回缺失引用')
    },
  },
  {
    name: 'task.verify 未声明检查时不假装通过',
    async run(ws) {
      const dir = await newProject(ws, 'tasknospec')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', title: '新增 Ruby', systemId: 's1', goal: '无检查',
          allowedPaths: [JAVA], acceptance: ['可编译'], verify: [], status: 'doing',
        },
      })
      const result = await ws.call('task.verify', { path: dir, id: 't1' })
      equal(result.task.status, 'doing', '无检查时应保持 doing')
      must(result.warning.includes('未声明检查'), '应给出未声明检查的警告')
    },
  },
  {
    name: 'task.apply 记录新建与修改的 action',
    async run(ws) {
      const dir = await newProject(ws, 'taskaction')
      await ws.call('task.start', { path: dir, id: 't1' })
      const first = await ws.call('task.apply', { path: dir, id: 't1', files: [changes[0]], requestId: 'a1' })
      equal(first.files[0].action, 'create', '首次写入应为 create')
      const second = await ws.call('task.apply', { path: dir, id: 't1', files: [changes[0]], requestId: 'a2' })
      equal(second.files[0].action, 'modify', '再次写入应为 modify')
    },
  },
  {
    name: 'guardPaths 优先于 allowedPaths 报错',
    async run(ws) {
      const dir = await newProject(ws, 'taskguardorder')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', title: '新增 Ruby', systemId: 's1', goal: '保护路径优先',
          allowedPaths: [JAVA, MODEL],
          guardPaths: ['src/main/java/com/example/taskguardorder/lock/**'],
          acceptance: ['可编译'], verify: ['allowed-paths'], status: 'todo',
        },
      })
      let message = ''
      try {
        await ws.call('task.apply', {
          path: dir, id: 't1',
          files: [{ path: 'src/main/java/com/example/taskguardorder/lock/Locked.java', content: 'x' }],
        })
      } catch (error) {
        message = error.message
      }
      must(message.includes('修改保护路径'), `guard 应优先报保护路径，实际「${message}」`)
    },
  },
  {
    name: 'task 工具调用',
    async run(ws) {
      const dir = await newProject(ws, 'tasktool')
      const started = await ws.call('agent.call', {
        tool: 'task',
        args: { action: 'start', project: dir, id: 't1' },
      })
      equal(started.task.status, 'doing', '工具应启动任务')
      const verified = await ws.call('agent.call', {
        tool: 'task',
        args: { action: 'verify', project: dir, id: 't1' },
      })
      must(Array.isArray(verified.checks), '工具应返回检查结果')
    },
  },
  {
    name: 'task.save 局部更新与状态不降级',
    async run(ws) {
      const dir = await newProject(ws, 'taskpartial')
      await ws.call('task.start', { path: dir, id: 't1' })
      const saved = (await ws.call('tasks.save', {
        path: dir,
        task: { id: 't1', goal: '只改目标' },
      })).task
      equal(saved.systemId, 's1', '应保留 systemId')
      equal(saved.goal, '只改目标', '应更新 goal')
      equal(saved.status, 'doing', '不应回退到 todo')

      const started = await ws.call('task.start', { path: dir, id: 't1' })
      equal(started.context.task.status, 'doing', '上下文中的任务状态应同步')
    },
  },
  {
    name: 'task.codegen 预览与应用',
    async run(ws) {
      const dir = await newProject(ws, 'taskcodegen')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', title: '生成注册', systemId: 's1', goal: '生成物品注册',
          templateRefs: [{ id: 'registry-items', version: 1, parameters: { id: 'ruby', displayName: 'Ruby' } }],
          allowedPaths: ['src/main/java/com/example/taskcodegen/registry/**'],
          acceptance: ['生成'], verify: ['allowed-paths'], status: 'todo',
        },
      })
      const preview = await ws.call('task.codegen.preview', { path: dir, id: 't1' })
      must(preview.files.some((file) => file.path.endsWith('ModItems.java')), '应预览到 ModItems.java')

      const applied = await ws.call('task.codegen.apply', { path: dir, id: 't1' })
      must(applied.created.some((file) => file.endsWith('ModItems.java')), '应创建文件')
      const text = await readFile(join(dir, 'src/main/java/com/example/taskcodegen/registry/ModItems.java'), 'utf8')
      must(text.includes('ITEMS.register("ruby"'), '应写入注册行')
    },
  },
  {
    name: 'task.codegen 越界拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'taskcodegenbad')
      await ws.call('tasks.save', {
        path: dir,
        task: {
          id: 't1', title: '越界', systemId: 's1', goal: '越界',
          templateRefs: [{ id: 'registry-items', version: 1, parameters: { id: 'ruby', displayName: 'Ruby' } }],
          allowedPaths: ['src/main/java/com/example/other/**'],
          acceptance: ['x'], verify: ['allowed-paths'], status: 'todo',
        },
      })
      const preview = await ws.call('task.codegen.preview', { path: dir, id: 't1' })
      must(preview.violations.length > 0, '应报告越界文件')
      let message = ''
      try {
        await ws.call('task.codegen.apply', { path: dir, id: 't1' })
      } catch (error) { message = error.message }
      must(message.includes('越界修改'), `应用应拒绝越界，实际「${message}」`)
    },
  },
]

process.exitCode = await runSuite('25 · 任务执行', cases)
