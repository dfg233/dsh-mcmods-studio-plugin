/**
 * 用例 05：素材（PNG 校验、模型读写、缺失统计）。
 */

import { equal, makePngBase64, must, rejects, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'assetmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '素材测试', modid, loader: 'neoforge' })
  return dir
}

const cases = [
  {
    name: '上传合法 PNG 并写入工程路径',
    async run(ws) {
      const dir = await newProject(ws)
      // 新建项目只有 .mcstudio/，没有 src/main/resources，因此会走回退路径
      const result = await ws.call('assets.upload', {
        path: dir, id: 'ruby', base64: makePngBase64(16, 16),
      })

      equal(result.width, 16, '宽度应为 16')
      equal(result.height, 16, '高度应为 16')
      must(result.path.includes('ruby.png'), '应写入 ruby.png')

      const assets = await ws.call('assets.list', { path: dir })
      equal(assets.standard, false, '无 src/main/resources 时应回退')
      must(assets.textures.some((item) => item.id === 'ruby'), '贴图应出现在清单里')
    },
  },
  {
    name: '有标准资源目录时写入 assets/<modid>',
    async run(ws) {
      const dir = await newProject(ws, 'stdmod')
      await ws.write(`${dir}/src/main/resources/pack.mcmeta`, '{}')

      const result = await ws.call('assets.upload', {
        path: dir, id: 'ruby', base64: makePngBase64(16, 16),
      })
      must(result.path.includes('src'), '应写入 src/main/resources')
      must(result.path.includes('assets'), '应写入 assets 目录')

      const assets = await ws.call('assets.list', { path: dir })
      equal(assets.standard, true, '有 src/main/resources 时应使用标准路径')
    },
  },
  {
    name: '非正方形 PNG 被拒绝',
    async run(ws) {
      const dir = await newProject(ws)
      await rejects(
        () => ws.call('assets.upload', { path: dir, id: 'wide', base64: makePngBase64(32, 16) }),
        '正方形',
        '非正方形应被拒绝',
      )
    },
  },
  {
    name: '非 PNG 内容被拒绝',
    async run(ws) {
      const dir = await newProject(ws)
      const fake = Buffer.from('这不是图片').toString('base64')
      await rejects(
        () => ws.call('assets.upload', { path: dir, id: 'fake', base64: fake }),
        'PNG',
        '非 PNG 应被拒绝',
      )
    },
  },
  {
    name: '空数据被拒绝',
    async run(ws) {
      const dir = await newProject(ws)
      await rejects(
        () => ws.call('assets.upload', { path: dir, id: 'empty', base64: '' }),
        '为空',
        '空 base64 应被拒绝',
      )
    },
  },
  {
    name: '读取贴图为 data URL',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('assets.upload', { path: dir, id: 'ruby', base64: makePngBase64() })

      const read = await ws.call('assets.read', { path: dir, id: 'ruby' })
      must(read.dataUrl.startsWith('data:image/png;base64,'), '应返回 PNG data URL')
    },
  },
  {
    name: '读取不存在的贴图返回 null',
    async run(ws) {
      const dir = await newProject(ws)
      const read = await ws.call('assets.read', { path: dir, id: 'none' })
      equal(read.dataUrl, null, '不存在时应返回 null')
    },
  },
  {
    name: '批量读取贴图',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('assets.upload', { path: dir, id: 'a', base64: makePngBase64() })
      await ws.call('assets.upload', { path: dir, id: 'b', base64: makePngBase64() })

      const many = await ws.call('assets.readMany', { path: dir, ids: ['a', 'b', 'c'] })
      must(many.images.a, 'a 应有 data URL')
      must(many.images.b, 'b 应有 data URL')
      equal(many.images.c, null, 'c 不存在应为 null')
    },
  },
  {
    name: '删除贴图',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('assets.upload', { path: dir, id: 'tmp', base64: makePngBase64() })
      await ws.call('assets.delete', { path: dir, id: 'tmp' })

      const assets = await ws.call('assets.list', { path: dir })
      must(!assets.textures.some((item) => item.id === 'tmp'), '贴图应被删除')
    },
  },
  {
    name: '模型保存与校验',
    async run(ws) {
      const dir = await newProject(ws)
      const saved = await ws.call('assets.model.save', {
        path: dir, id: 'ruby',
        model: JSON.stringify({ parent: 'item/generated', textures: { layer0: 'assetmod:item/ruby' } }),
      })
      must(saved.text.includes('layer0'), '应返回保存后的文本')

      const read = await ws.call('assets.model.get', { path: dir, id: 'ruby' })
      must(read.text.includes('item/generated'), '应读回模型内容')
    },
  },
  {
    name: '非法 JSON 模型被拒绝',
    async run(ws) {
      const dir = await newProject(ws)
      await rejects(
        () => ws.call('assets.model.save', { path: dir, id: 'bad', model: '{ 不是 JSON' }),
        '',
        '非法 JSON 应报错',
      )
    },
  },
  {
    name: '缺失素材统计',
    async run(ws) {
      const dir = await newProject(ws)
      // 有物品但没有贴图与模型
      await ws.call('items.save', { path: dir, item: { id: 'lonely', displayName: '孤独' }, ensureModel: false })

      const assets = await ws.call('assets.list', { path: dir })
      must(assets.missing.includes('lonely'), '应把缺素材的物品列入 missing')
    },
  },
  {
    name: '无标准资源目录时回退到 .mcstudio',
    async run(ws) {
      const dir = ws.path('fallback')
      await ws.call('project.create', { path: dir, name: '回退测试', modid: 'fallbackmod', loader: 'fabric' })

      await ws.call('assets.upload', { path: dir, id: 'gem', base64: makePngBase64() })
      const assets = await ws.call('assets.list', { path: dir })

      equal(assets.standard, false, '无 src/main/resources 时应回退')
      must(assets.root.includes('.mcstudio'), '回退路径应在 .mcstudio 下')
    },
  },
]

process.exitCode = await runSuite('05 · 素材管理', cases)
