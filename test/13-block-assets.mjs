/**
 * 用例 13：方块素材解析。
 *
 * 方块的贴图不按文件名对应，需要沿 blockstate → 模型 → parent 链 → textures 解析。
 * 这里用真实工程结构验证：多面贴图、cube_all、parent 继承、缺失情况。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, must, runSuite, makePngBase64 } from './helpers.mjs'

/** 在工程里写一个文件。 */
async function put(root, rel, content) {
  const file = join(root, rel)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content)
}

/** 写一张 PNG。 */
async function putPng(root, rel) {
  await put(root, rel, Buffer.from(makePngBase64(), 'base64'))
}

/** 建一个带标准资源目录的工坊项目。 */
async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: modid, modid, loader: 'neoforge' })
  const res = join(dir, 'src', 'main', 'resources')
  await mkdir(res, { recursive: true })
  return { dir, assets: join(res, 'assets', modid) }
}

const cases = [
  {
    name: '六个面不同贴图的方块全部解析出来',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'sixface')
      // 六个面各一张贴图
      for (const face of ['up', 'down', 'north', 'south', 'east', 'west']) {
        await putPng(assets, `textures/block/stone_${face}.png`)
      }
      await put(assets, 'blockstates/altar.json', JSON.stringify({
        variants: { '': { model: 'sixface:block/altar' } },
      }))
      await put(assets, 'models/block/altar.json', JSON.stringify({
        textures: {
          up: 'sixface:block/stone_up',
          down: 'sixface:block/stone_down',
          north: 'sixface:block/stone_north',
          south: 'sixface:block/stone_south',
          east: 'sixface:block/stone_east',
          west: 'sixface:block/stone_west',
        },
        elements: [{
          from: [0, 0, 0], to: [16, 16, 16],
          faces: {
            up: { texture: '#up' }, down: { texture: '#down' },
            north: { texture: '#north' }, south: { texture: '#south' },
            east: { texture: '#east' }, west: { texture: '#west' },
          },
        }],
      }))

      await ws.call('items.save', { path: dir, item: { id: 'altar', displayName: '祭坛', type: 'block' } })
      const result = await ws.call('assets.list', { path: dir })

      const block = result.blocks.find((entry) => entry.id === 'altar')
      must(block, '应解析出 altar 方块')
      equal(block.faces.length, 6, '应有 6 个面')
      equal(block.uniform, false, '六个面不同时应标记为非统一')
      equal(block.textures.length, 6, '应去重出 6 张贴图')

      const up = block.faces.find((face) => face.face === 'up')
      equal(up.label, '上面', '面应有中文名')
      equal(up.texture, 'block/stone_up', '应解析出实际贴图路径')
    },
  },
  {
    name: '六面相同贴图标记为 uniform 且只算一张',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'allface')
      await putPng(assets, 'textures/block/marble.png')
      await put(assets, 'blockstates/marble.json', JSON.stringify({
        variants: { '': { model: 'allface:block/marble' } },
      }))
      await put(assets, 'models/block/marble.json', JSON.stringify({
        parent: 'minecraft:block/cube_all',
        textures: { all: 'allface:block/marble' },
        elements: [{
          from: [0, 0, 0], to: [16, 16, 16],
          faces: {
            up: { texture: '#all' }, down: { texture: '#all' },
            north: { texture: '#all' }, south: { texture: '#all' },
            east: { texture: '#all' }, west: { texture: '#all' },
          },
        }],
      }))

      await ws.call('items.save', { path: dir, item: { id: 'marble', displayName: '大理石', type: 'block' } })
      const result = await ws.call('assets.list', { path: dir })
      const block = result.blocks.find((entry) => entry.id === 'marble')

      equal(block.uniform, true, '六面相同应标记为统一')
      equal(block.textures.length, 1, '只应算一张贴图')
      equal(block.primary, 'block/marble', '应给出主贴图用于缩略图')
      equal(block.faces.length, 6, '仍应记录 6 个面')
      must(block.faces.every((face) => face.texture === 'block/marble'), '每个面都指向同一张贴图')
    },
  },
  {
    name: '沿 parent 链继承贴图',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'inherit')
      await putPng(assets, 'textures/block/base.png')
      await putPng(assets, 'textures/block/top.png')
      // 子模型只覆盖 top，side 来自父模型
      await put(assets, 'models/block/column_base.json', JSON.stringify({
        textures: { side: 'inherit:block/base', top: 'inherit:block/base' },
        elements: [{
          from: [0, 0, 0], to: [16, 16, 16],
          faces: { up: { texture: '#top' }, north: { texture: '#side' }, east: { texture: '#side' } },
        }],
      }))
      await put(assets, 'models/block/column.json', JSON.stringify({
        parent: 'inherit:block/column_base',
        textures: { top: 'inherit:block/top' },
      }))
      await put(assets, 'blockstates/column.json', JSON.stringify({
        variants: { '': { model: 'inherit:block/column' } },
      }))

      await ws.call('items.save', { path: dir, item: { id: 'column', displayName: '石柱', type: 'block' } })
      const result = await ws.call('assets.list', { path: dir })
      const block = result.blocks.find((entry) => entry.id === 'column')

      const up = block.faces.find((face) => face.face === 'up')
      const north = block.faces.find((face) => face.face === 'north')
      equal(up.texture, 'block/top', '上面应被子模型覆盖')
      equal(north.texture, 'block/base', '侧面应继承父模型')
      equal(block.textures.length, 2, '应去重出两张贴图')
    },
  },
  {
    name: '没有 blockstate 时回退到同名方块模型',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'nofallback')
      await putPng(assets, 'textures/block/plain.png')
      await put(assets, 'models/block/plain.json', JSON.stringify({
        textures: { all: 'nofallback:block/plain' },
        elements: [{
          from: [0, 0, 0], to: [16, 16, 16],
          faces: { up: { texture: '#all' }, down: { texture: '#all' } },
        }],
      }))

      await ws.call('items.save', { path: dir, item: { id: 'plain', displayName: '素块', type: 'block' } })
      const result = await ws.call('assets.list', { path: dir })
      const block = result.blocks.find((entry) => entry.id === 'plain')

      must(block, '无 blockstate 也应能解析')
      equal(block.hasBlockstate, false, '应标记为没有 blockstate')
      equal(block.textures.length, 1, '应解析出贴图')
    },
  },
  {
    name: '普通物品不受影响',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'itemsok')
      await putPng(assets, 'textures/item/ruby.png')
      await put(assets, 'models/item/ruby.json', JSON.stringify({
        parent: 'minecraft:item/generated', textures: { layer0: 'itemsok:item/ruby' },
      }))

      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' } })
      const result = await ws.call('assets.list', { path: dir })

      equal(result.textures.length, 1, '物品贴图应被收集')
      equal(result.textures[0].kind, 'item', '应标记为 item 类型')
      equal(result.models.length, 1, '物品模型应被收集')
      equal(result.blocks.length, 0, '不应误判为方块')
      equal(result.missing.length, 0, '素材齐全时 missing 应为空')
    },
  },
  {
    name: '方块缺贴图时进入 missing',
    async run(ws) {
      const { dir } = await makeProject(ws, 'blockmiss')
      await ws.call('items.save', { path: dir, item: { id: 'ghost_block', displayName: '幽灵方块', type: 'block' } })

      const result = await ws.call('assets.list', { path: dir })
      must(result.missing.includes('ghost_block'), '缺贴图的方块应出现在 missing')
    },
  },
  {
    name: 'multipart 方块能收集全部模型',
    async run(ws) {
      const { dir, assets } = await makeProject(ws, 'multi')
      await putPng(assets, 'textures/block/post.png')
      await putPng(assets, 'textures/block/cap.png')
      await put(assets, 'models/block/post.json', JSON.stringify({
        textures: { all: 'multi:block/post' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }],
      }))
      await put(assets, 'models/block/cap.json', JSON.stringify({
        textures: { all: 'multi:block/cap' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#all' } } }],
      }))
      await put(assets, 'blockstates/multi.json', JSON.stringify({
        multipart: [
          { apply: { model: 'multi:block/post' } },
          { when: { north: 'true' }, apply: { model: 'multi:block/cap' } },
        ],
      }))

      await ws.call('items.save', { path: dir, item: { id: 'multi', displayName: '多部件', type: 'block' } })
      const result = await ws.call('assets.list', { path: dir })
      const block = result.blocks.find((entry) => entry.id === 'multi')

      equal(block.models.length, 2, '应收集 multipart 的两个模型')
      equal(block.textures.length, 2, '应去重出两张贴图')
      must(block.textures.includes('block/post'), '应含 post 贴图')
      must(block.textures.includes('block/cap'), '应含 cap 贴图')
    },
  },
]

process.exitCode = await runSuite('13 · 方块素材解析', cases)
