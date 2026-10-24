/**
 * 用例 06：文档导出（五个文件、内容正确、幂等）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, makePngBase64, must, runSuite } from './helpers.mjs'

async function prepared(ws) {
  const dir = ws.path('docmod')
  await ws.call('project.create', {
    path: dir, name: '文档测试', modid: 'docmod', version: '1.2.0', loader: 'neoforge',
  })
  await ws.call('features.save', {
    path: dir, feature: { name: '宝石挖掘', status: 'done', priority: 'high', description: '挖矿' },
  })
  await ws.call('items.save', {
    path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' },
  })
  await ws.call('assets.upload', { path: dir, id: 'ruby', base64: makePngBase64() })
  return dir
}

const cases = [
  {
    name: '导出五个文件',
    async run(ws) {
      const dir = await prepared(ws)
      const result = await ws.call('docs.export', { path: dir })

      const names = result.files.map((file) => file.replace(/\\/g, '/'))
      must(names.includes('docs/FEATURES.md'), '应导出 FEATURES.md')
      must(names.includes('docs/ITEMS.md'), '应导出 ITEMS.md')
      must(names.includes('docs/ASSETS.md'), '应导出 ASSETS.md')
      must(names.includes('docs/README.md'), '应导出 README.md')
      must(names.includes('docs/ITEMS/ruby.md'), '应导出单件物品文档')
    },
  },
  {
    name: 'FEATURES.md 标题使用「构想」并按状态分组',
    async run(ws) {
      const dir = await prepared(ws)
      await ws.call('docs.export', { path: dir })
      const text = await readFile(join(dir, 'docs', 'FEATURES.md'), 'utf8')

      must(text.includes('— 构想'), '标题应含「构想」')
      must(text.includes('项构想'), '统计应含「项构想」')
      must(!text.includes('功能列表'), '不应残留「功能列表」')
      must(text.includes('宝石挖掘'), '应含构想名')
      must(text.includes('已完成'), '应含状态分组')
    },
  },
  {
    name: 'ITEMS.md 与单件文档包含属性',
    async run(ws) {
      const dir = await prepared(ws)
      await ws.call('docs.export', { path: dir })

      const index = await readFile(join(dir, 'docs', 'ITEMS.md'), 'utf8')
      must(index.includes('ruby'), '总览应含 id')
      must(index.includes('红宝石'), '总览应含显示名')

      const item = await readFile(join(dir, 'docs', 'ITEMS', 'ruby.md'), 'utf8')
      must(item.includes('红宝石'), '单件文档应含显示名')
      must(item.includes('最大堆叠'), '单件文档应含字段中文名')
      must(item.includes('64'), '单件文档应含默认值')
    },
  },
  {
    name: 'ASSETS.md 列出贴图与缺失',
    async run(ws) {
      const dir = await prepared(ws)
      await ws.call('items.save', { path: dir, item: { id: 'lonely', displayName: '缺贴图' }, ensureModel: false })

      await ws.call('docs.export', { path: dir })
      const text = await readFile(join(dir, 'docs', 'ASSETS.md'), 'utf8')

      must(text.includes('ruby.png'), '应列出已有贴图')
      must(text.includes('lonely'), '应列出缺失项')
    },
  },
  {
    name: 'README.md 是文档索引',
    async run(ws) {
      const dir = await prepared(ws)
      await ws.call('docs.export', { path: dir })
      const text = await readFile(join(dir, 'docs', 'README.md'), 'utf8')

      must(text.includes('FEATURES.md'), '应链接构想文档')
      must(text.includes('构想清单'), '应使用「构想清单」措辞')
      must(text.includes('ITEMS.md'), '应链接物品文档')
      must(text.includes('ASSETS.md'), '应链接素材文档')
    },
  },
  {
    name: '重复导出结果一致（幂等）',
    async run(ws) {
      const dir = await prepared(ws)
      await ws.call('docs.export', { path: dir })
      const first = await readFile(join(dir, 'docs', 'ITEMS.md'), 'utf8')

      await ws.call('docs.export', { path: dir })
      const second = await readFile(join(dir, 'docs', 'ITEMS.md'), 'utf8')

      equal(second, first, '两次导出内容应完全一致')
    },
  },
  {
    name: '空项目也能导出',
    async run(ws) {
      const dir = ws.path('emptydoc')
      await ws.call('project.create', { path: dir, name: '空项目', modid: 'emptydoc', loader: 'forge' })

      const result = await ws.call('docs.export', { path: dir })
      must(result.files.length >= 4, '空项目也应导出基础文档')

      const items = await readFile(join(dir, 'docs', 'ITEMS.md'), 'utf8')
      must(items.includes('暂无') || items.includes('0'), '空项目应说明没有物品')
    },
  },
  {
    name: '非工坊目录拒绝导出',
    async run(ws) {
      const dir = ws.path('plaindoc')
      await ws.write(join(dir, 'a.txt'), 'x')
      let failed = false
      try {
        await ws.call('docs.export', { path: dir })
      } catch {
        failed = true
      }
      equal(failed, true, '非工坊项目应报错')
    },
  },
]

process.exitCode = await runSuite('06 · 文档导出', cases)
