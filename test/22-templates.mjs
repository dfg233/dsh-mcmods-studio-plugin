/**
 * 用例 22：模板（清单、渲染、参数校验、冲突、JSON 合并、应用与工具）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { must, equal, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'tplmod', loader = 'forge') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '模板测试', modid, loader })
  return dir
}

const cases = [
  {
    name: '列出内置模板',
    async run(ws) {
      const result = await ws.call('template.list', {})
      equal(result.templates.length, 9, '应有 9 个内置模板')
      const simple = result.templates.find((item) => item.id === 'simple-item')
      must(simple, '应包含 simple-item')
      equal(simple.loaders.includes('forge'), true, '应支持 forge')
      must(simple.parameters.some((item) => item.key === 'id'), '应声明 id 参数')
    },
  },
  {
    name: '读取模板清单与文件原文',
    async run(ws) {
      const template = await ws.call('template.get', { id: 'simple-item' })
      equal(template.id, 'simple-item', '应返回模板 id')
      must(template.files.some((file) => file.path.endsWith('.java')), '应包含 Java 模板')
      const java = template.files.find((file) => file.template.endsWith('.java.tpl'))
      must(java.content.includes('{{ClassName}}'), '原文应保留占位符')
    },
  },
  {
    name: '渲染 simple-item',
    async run(ws) {
      const dir = await newProject(ws)
      const result = await ws.call('template.render', {
        path: dir,
        id: 'simple-item',
        params: { id: 'ruby_sword', displayName: 'Ruby Sword', stackSize: 1 },
      })
      equal(result.files.length, 4, '应渲染 4 个文件')
      const java = result.files.find((file) => file.path.endsWith('.java'))
      equal(java.action, 'create', 'Java 应新建')
      must(java.path.includes('RubySword.java'), '类名应转 PascalCase')
      must(java.path.includes('com/example/tplmod/item/RubySword.java'), '包名应转目录路径')
      must(!java.path.includes('com.example'), '路径不应包含点号包名')
      must(java.content.includes('class RubySword extends Item'), '应生成类声明')
      must(java.content.includes('stacksTo(1)'), '应使用 stackSize')
      const model = result.files.find((file) => file.path.includes('/models/item/'))
      must(model.content.includes('tplmod:item/ruby_sword'), '模型应引用正确贴图')
    },
  },
  {
    name: '参数校验：缺失与非法 id',
    async run(ws) {
      const dir = await newProject(ws, 'tplparam')
      await mustReject(
        () => ws.call('template.render', { path: dir, id: 'simple-item', params: { displayName: '缺少 id' } }),
        '缺少模板参数',
      )
      await mustReject(
        () => ws.call('template.render', { path: dir, id: 'simple-item', params: { id: 'Bad ID', displayName: 'x' } }),
        'id 不合法',
      )
      await mustReject(
        () => ws.call('template.render', { path: dir, id: 'not-exists', params: {} }),
        '模板不存在',
      )
    },
  },
  {
    name: '加载器不匹配时拒绝渲染',
    async run(ws) {
      const dir = await newProject(ws, 'tplfabric', 'fabric')
      await mustReject(
        () => ws.call('template.render', {
          path: dir, id: 'simple-item', params: { id: 'ruby', displayName: 'Ruby' },
        }),
        '不支持加载器',
      )
    },
  },
  {
    name: '已存在文件默认跳过',
    async run(ws) {
      const dir = await newProject(ws, 'tplconflict')
      const target = join(dir, 'src/main/resources/assets/tplconflict/models/item/ruby.json')
      await ws.write(target, '{"parent":"minecraft:item/generated"}\n')

      const result = await ws.call('template.render', {
        path: dir, id: 'simple-item', params: { id: 'ruby', displayName: 'Ruby' },
      })
      const model = result.files.find((file) => file.path.includes('/models/item/'))
      equal(model.action, 'skip', '已存在文件应跳过')
      must(result.conflicts.some((item) => item.path.includes('/models/item/')), '应报告冲突')
    },
  },
  {
    name: 'JSON 文件深合并',
    async run(ws) {
      const dir = await newProject(ws, 'tplmerge')
      const langFile = join(dir, 'src/main/resources/assets/tplmerge/lang/zh_cn.json')
      await ws.write(langFile, JSON.stringify({ 'item.other.key': '旧键' }, null, 2))

      const result = await ws.call('template.render', {
        path: dir, id: 'simple-item', params: { id: 'ruby', displayName: '红宝石' },
      })
      const lang = result.files.find((file) => file.path.endsWith('zh_cn.json'))
      equal(lang.action, 'modify', '语言文件应合并')
      must(lang.content.includes('item.other.key'), '应保留旧键')
      must(lang.content.includes('item.tplmerge.ruby'), '应写入新键')
      must(lang.content.includes('红宝石'), '应写入显示名')
    },
  },
  {
    name: '应用模板写入文件并备份',
    async run(ws) {
      const dir = await newProject(ws, 'tplapply')
      const result = await ws.call('template.apply', {
        path: dir, id: 'simple-item', params: { id: 'ruby', displayName: 'Ruby' },
      })
      must(result.backupDir, '应返回备份目录')
      equal(result.files.length, 4, '应写入 4 个文件')
      const javaFile = result.files.find((file) => file.path.endsWith('Ruby.java'))
      must(javaFile, '应写入 Java 文件')
      const java = await readFile(join(dir, javaFile.path), 'utf8')
      must(java.includes('class Ruby extends Item'), 'Java 文件应写入')
      const structure = await ws.call('structure.get', { path: dir, compact: true })
      must(Array.isArray(structure.structure.files), '结构文档应包含文件列表')
      must(structure.structure.files.some((file) => file.path.endsWith('Ruby.java')), '结构文档应包含新类')
    },
  },
  {
    name: 'template 工具调用',
    async run(ws) {
      const dir = await newProject(ws, 'tpltool')
      const rendered = await ws.call('agent.call', {
        tool: 'template',
        args: {
          action: 'render',
          project: dir,
          id: 'lang-pair',
          params: { id: 'ruby', displayName: '红宝石', enName: 'Ruby' },
        },
      })
      equal(rendered.files.length, 2, '工具应返回两个语言文件')
      const applied = await ws.call('agent.call', {
        tool: 'template',
        args: {
          action: 'apply',
          project: dir,
          id: 'lang-pair',
          params: { id: 'ruby', displayName: '红宝石', enName: 'Ruby' },
        },
      })
      equal(applied.files.length, 2, '工具应写入两个文件')
    },
  },
  {
    name: 'apply 后再次渲染返回 skip 且可序列化',
    async run(ws) {
      const dir = await newProject(ws, 'tplskip')
      await ws.call('template.apply', {
        path: dir, id: 'simple-item', params: { id: 'ruby', displayName: 'Ruby' },
      })
      const result = await ws.call('template.render', {
        path: dir, id: 'simple-item', params: { id: 'ruby', displayName: 'Ruby' },
      })
      equal(result.files.length, 4, '应返回 4 个文件')
      must(result.files.every((file) => file.action === 'skip' || file.action === 'modify'), '不应再 create')
      must(result.files.filter((file) => file.action === 'skip').every((file) => !('content' in file)), 'skip 条目不应包含 content 字段')
      must(typeof JSON.stringify(result) === 'string', '结果应可序列化')
    },
  },
]

async function mustReject(fn, needle) {
  let message = ''
  try {
    await fn()
  } catch (error) {
    message = error.message
  }
  must(message.includes(needle), `应报错「${needle}」，实际「${message}」`)
}

process.exitCode = await runSuite('22 · 模板', cases)
