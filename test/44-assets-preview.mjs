/**
 * 用例 44：素材预览（assets.preview）。
 *
 * 物品返回 item model 的 layer 列表；方块返回 blockstate 解析出的面贴图。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, makePngBase64, must, runSuite } from './helpers.mjs'

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Preview', modid, loader: 'forge', authors: 'Besson', scaffold: true })
  return dir
}

async function writePng(root, rel) {
  const file = join(root, rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, Buffer.from(makePngBase64(), 'base64'))
}

const cases = [
  {
    name: '物品按 item model layer 返回',
    async run(ws) {
      const dir = await makeProject(ws, 'previewitem')
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: 'Ruby', type: 'item' } })
      const result = await ws.call('assets.preview', { path: dir, ids: ['ruby'] })
      const preview = result.previews.find((entry) => entry.id === 'ruby')
      equal(preview.kind, 'item', '物品类型')
      must(preview.layers.length >= 1, '应返回 layer')
      equal(preview.layers[0].kind, 'item', 'layer 类型')
      equal(preview.layers[0].id, 'ruby', 'layer 贴图 id')
    },
  },
  {
    name: '方块返回面贴图',
    async run(ws) {
      const dir = await makeProject(ws, 'previewblock')
      await ws.call('items.save', { path: dir, item: { id: 'ruby_block', displayName: 'Ruby Block', type: 'block' } })
      const assets = join(dir, 'src/main/resources/assets/previewblock')
      await ws.write(join(assets, 'blockstates/ruby_block.json'), JSON.stringify({ variants: { '': { model: 'previewblock:block/ruby_block' } } }))
      await ws.write(join(assets, 'models/block/ruby_block.json'), JSON.stringify({ parent: 'minecraft:block/cube_all', textures: { all: 'previewblock:block/ruby_block' } }))
      await writePng(assets, 'textures/block/ruby_block.png')
      const result = await ws.call('assets.preview', { path: dir, ids: ['ruby_block'] })
      const preview = result.previews.find((entry) => entry.id === 'ruby_block')
      equal(preview.kind, 'block', '方块类型')
      must(preview.faces.some((face) => face.face === 'up'), '应有上面贴图')
      must(preview.faces.every((face) => face.kind === 'block'), '面贴图应来自 block 目录')
    },
  },
  {
    name: '未建模物品回退为空 layer',
    async run(ws) {
      const dir = await makeProject(ws, 'previewempty')
      const result = await ws.call('assets.preview', { path: dir, ids: ['ghost'] })
      const preview = result.previews.find((entry) => entry.id === 'ghost')
      equal(preview.kind, 'item', '默认按物品')
      equal(preview.layers.length, 0, '无模型时 layer 为空')
    },
  },
]

process.exitCode = await runSuite('44 · 素材预览', cases)
