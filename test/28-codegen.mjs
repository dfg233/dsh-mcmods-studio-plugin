/**
 * 用例 28：代码生成（整文件模板、标记替换、diff、幂等、非法标记、工具）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

const MOD_ITEMS = 'src/main/java/com/example/genmod/registry/ModItems.java'

async function newProject(ws, modid = 'genmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '生成测试', modid, loader: 'forge' })
  return dir
}

function itemRef(id = 'ruby') {
  return { id: 'simple-item', parameters: { id, displayName: 'Ruby' } }
}

const cases = [
  {
    name: '预览整文件模板',
    async run(ws) {
      const dir = await newProject(ws, 'previewgen')
      const result = await ws.call('codegen.preview', {
        path: dir,
        templateRefs: [itemRef()],
      })
      equal(result.files.length, 4, '应列出 4 个文件')
      must(result.files.every((file) => file.action === 'create'), '空目录应全部 create')
      must(result.files.some((file) => file.path.endsWith('Ruby.java')), '应包含 Java 文件')
    },
  },
  {
    name: '已存在整文件默认跳过',
    async run(ws) {
      const dir = await newProject(ws, 'skipgen')
      await ws.call('codegen.apply', { path: dir, templateRefs: [itemRef()] })
      const result = await ws.call('codegen.preview', { path: dir, templateRefs: [itemRef()] })
      must(result.files.every((file) => file.action === 'skip'), '再次预览应全部 skip')
      must(result.conflicts.length > 0, '应报告冲突')
    },
  },
  {
    name: '标记模板创建骨架并写入注册行',
    async run(ws) {
      const dir = await newProject(ws, 'markergen')
      const result = await ws.call('codegen.preview', {
        path: dir,
        templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }],
      })
      const file = result.files.find((item) => item.path.endsWith('ModItems.java'))
      must(file, '应包含 ModItems.java')
      equal(file.action, 'create', '文件不存在应 create')
      must(file.content.includes('class ModItems'), '应包含类骨架')
      must(file.content.includes('<mcstudio:generated items>'), '应包含标记')
      must(file.content.includes('ITEMS.register("ruby"'), '应写入注册行')
      must(file.content.includes('RUBY'), '常量名应大写')
    },
  },
  {
    name: '已有标记文件只更新标记区间',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('codegen.apply', {
        path: dir,
        templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }],
      })
      await ws.write(join(dir, MOD_ITEMS), (await readFile(join(dir, MOD_ITEMS), 'utf8'))
        .replace('class ModItems {', 'class ModItems {\n    // 手写注释'))

      const result = await ws.call('codegen.preview', {
        path: dir,
        templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby', stackSize: 16 } }],
      })
      const file = result.files.find((item) => item.path.endsWith('ModItems.java'))
      equal(file.action, 'update', '应更新标记内容')
      must(file.content.includes('stacksTo(16)'), '应写入新参数')
      must(file.content.includes('手写注释'), '标记外代码应保留')
    },
  },
  {
    name: '应用生成写入文件并刷新结构',
    async run(ws) {
      const dir = await newProject(ws)
      const result = await ws.call('codegen.apply', {
        path: dir,
        templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }],
      })
      must(result.backupDir, '应返回备份目录')
      must(result.created.includes(MOD_ITEMS), '应记录新文件')
      const text = await readFile(join(dir, MOD_ITEMS), 'utf8')
      must(text.includes('ITEMS.register("ruby"'), '文件应写入')
      const structure = await ws.call('structure.get', { path: dir, compact: true })
      must(structure.structure.files.some((file) => file.path.endsWith('ModItems.java')), '结构文档应包含新文件')
    },
  },
  {
    name: '重复生成幂等',
    async run(ws) {
      const dir = await newProject(ws, 'idemgen')
      const ref = [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }]
      await ws.call('codegen.apply', { path: dir, templateRefs: ref })
      const result = await ws.call('codegen.preview', { path: dir, templateRefs: ref })
      const file = result.files.find((item) => item.path.endsWith('ModItems.java'))
      equal(file.action, 'skip', '同参数再次生成应 skip')
    },
  },
  {
    name: '非法标记被拒绝',
    async run(ws) {
      const dir = await newProject(ws)
      const target = join(dir, MOD_ITEMS)
      await ws.write(target, [
        'class ModItems {',
        '// <mcstudio:generated items>',
        'a',
        '// </mcstudio:generated>',
        '// <mcstudio:generated items>',
        'b',
        '// </mcstudio:generated>',
        '}',
      ].join('\n'))
      let message = ''
      try {
        await ws.call('codegen.preview', {
          path: dir,
          templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }],
        })
      } catch (error) { message = error.message }
      must(message.includes('标记区块不合法'), `应拒绝重复标记，实际「${message}」`)
    },
  },
  {
    name: 'codegen 工具调用',
    async run(ws) {
      const dir = await newProject(ws, 'toolgen')
      const result = await ws.call('agent.call', {
        tool: 'codegen',
        args: {
          action: 'preview',
          project: dir,
          templateRefs: [{ id: 'registry-items', parameters: { id: 'ruby', displayName: 'Ruby' } }],
        },
      })
      must(result.files.some((file) => file.path.endsWith('ModItems.java')), '工具应返回生成文件')
    },
  },
]

process.exitCode = await runSuite('28 · 代码生成', cases)
