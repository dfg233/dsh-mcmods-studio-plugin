/**
 * 用例 63：素材 revision（P4）。
 *
 * 同数量替换贴图、只改模型时 revision 必须变化；无变化时稳定。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { makePngBase64 } from './helpers.mjs'

const cases = [
  {
    name: '替换同 ID 贴图后 revision 变化',
    async run(ws) {
      const dir = ws.path('m63rev')
      await ws.call('project.create', { path: dir, name: 'Rev', modid: 'm63rev', loader: 'forge', authors: 'Besson' })
      const assets = join(dir, 'src/main/resources/assets/m63rev')
      await fsp.mkdir(join(assets, 'textures/item'), { recursive: true })
      const file = join(assets, 'textures/item/ruby.png')
      await fsp.writeFile(file, Buffer.from(makePngBase64(), 'base64'))

      const first = await ws.call('assets.list', { path: dir })
      must(first.revision, '应返回 revision')
      const again = await ws.call('assets.list', { path: dir })
      equal(again.revision, first.revision, '无变化时稳定')

      await new Promise((resolve) => setTimeout(resolve, 30))
      await fsp.writeFile(file, Buffer.from(makePngBase64(32, 32), 'base64'))
      const changed = await ws.call('assets.list', { path: dir })
      must(changed.revision !== first.revision, '替换贴图后 revision 应变化')
    },
  },
  {
    name: '修改模型后 revision 变化',
    async run(ws) {
      const dir = ws.path('m63model')
      await ws.call('project.create', { path: dir, name: 'Model', modid: 'm63model', loader: 'forge', authors: 'Besson' })
      const assets = join(dir, 'src/main/resources/assets/m63model')
      await fsp.mkdir(join(assets, 'textures/item'), { recursive: true })
      await fsp.mkdir(join(assets, 'models/item'), { recursive: true })
      await fsp.writeFile(join(assets, 'textures/item/ruby.png'), Buffer.from(makePngBase64(), 'base64'))
      await fsp.writeFile(join(assets, 'models/item/ruby.json'), JSON.stringify({ parent: 'item/generated', textures: { layer0: 'm63model:item/ruby' } }))
      const first = await ws.call('assets.list', { path: dir })
      await new Promise((resolve) => setTimeout(resolve, 30))
      await fsp.writeFile(join(assets, 'models/item/ruby.json'), JSON.stringify({ parent: 'item/generated', textures: { layer0: 'm63model:item/ruby', layer1: 'm63model:item/ruby' } }))
      const changed = await ws.call('assets.list', { path: dir })
      must(changed.revision !== first.revision, '模型变化后 revision 应变化')
    },
  },
]

process.exitCode = await runSuite('63 · 素材 revision', cases)
