/**
 * 用例 34：创造标签成员。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm34') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '创造标签测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '添加成员并生成片段',
    async run(ws) {
      const dir = await newProject(ws, 'tab_add')
      const added = await ws.call('content.tab.add', { path: dir, id: 'ruby_tab', itemId: 'ruby' })
      equal(added.members.length, 1, '成员写入')
      must(added.snippet.includes('output.accept'), '应返回代码片段')
      must(added.snippet.includes('RUBY'), '片段含常量')
    },
  },
  {
    name: '成员去重与移除',
    async run(ws) {
      const dir = await newProject(ws, 'tab_dedupe')
      await ws.call('content.tab.add', { path: dir, id: 'ruby_tab', itemId: 'ruby' })
      const again = await ws.call('content.tab.add', { path: dir, id: 'ruby_tab', itemId: 'ruby' })
      equal(again.members.length, 1, '重复添加应去重')
      await ws.call('content.tab.add', { path: dir, id: 'ruby_tab', itemId: 'ruby_sword' })
      const members = await ws.call('content.tab.members', { path: dir, id: 'ruby_tab' })
      equal(members.members.length, 2, '两个成员')
      const removed = await ws.call('content.tab.remove', { path: dir, id: 'ruby_tab', itemId: 'ruby' })
      equal(removed.members.length, 1, '移除后剩一个')
    },
  },
  {
    name: '标签 id 校验',
    async run(ws) {
      const dir = await newProject(ws, 'tab_bad')
      let message = ''
      try {
        await ws.call('content.tab.add', { path: dir, id: 'Bad Tab', itemId: 'ruby' })
      } catch (error) { message = error.message }
      must(message.includes('创造标签 id'), `应拒绝非法 id，实际「${message}」`)
    },
  },
]

process.exitCode = await runSuite('34 · 创造标签', cases)
