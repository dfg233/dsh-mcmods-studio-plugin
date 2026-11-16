/**
 * 用例 43：同一物品的形态归并（门上下半、作物阶段、告示牌 wall 变体）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, makePngBase64, must, runSuite } from './helpers.mjs'
import { groupBlockVariants } from '../lib/import.js'

const cases = [
  {
    name: '门上下半归并到门本体',
    async run() {
      const { ids } = groupBlockVariants(['ice_ether_door', 'ice_ether_door_top', 'ice_ether_door_bottom', 'stone'])
      equal(JSON.stringify(ids), JSON.stringify(['ice_ether_door', 'stone']), '门应只留本体')
    },
  },
  {
    name: '作物阶段归并到作物本体',
    async run() {
      const { ids } = groupBlockVariants(['crop', 'crop_stage0', 'crop_stage1', 'crop_stage2', 'crop_stage3'])
      equal(JSON.stringify(ids), JSON.stringify(['crop']), '作物应只留本体')
    },
  },
  {
    name: '告示牌 wall 变体归并',
    async run() {
      const { ids } = groupBlockVariants(['oak_sign', 'oak_wall_sign', 'oak_hanging_sign', 'oak_wall_hanging_sign'])
      equal(JSON.stringify(ids), JSON.stringify(['oak_sign', 'oak_hanging_sign']), 'wall 变体应归并')
    },
  },
  {
    name: '活板门 open 状态归并',
    async run() {
      const { ids } = groupBlockVariants(['ice_ether_trapdoor', 'ice_ether_trapdoor_top', 'ice_ether_trapdoor_bottom', 'ice_ether_trapdoor_open'])
      equal(JSON.stringify(ids), JSON.stringify(['ice_ether_trapdoor']), '活板门应只留本体')
    },
  },
  {
    name: '独立方块不被误伤',
    async run() {
      const { ids } = groupBlockVariants(['oak_stairs', 'oak_slab', 'stone', 'ice_ether_ore'])
      equal(JSON.stringify(ids), JSON.stringify(['oak_stairs', 'oak_slab', 'stone', 'ice_ether_ore']), '独立方块应保留')
    },
  },
  {
    name: '真实扫描：门的上下半不再成为独立条目',
    async run(ws) {
      const dir = ws.path('doormod')
      await ws.call('project.create', { path: dir, name: 'Door', modid: 'doormod', loader: 'forge', authors: 'Besson', scaffold: true })
      const assets = join(dir, 'src/main/resources/assets/doormod')
      await ws.write(join(assets, 'blockstates/oak_door.json'), '{}\n')
      await ws.write(join(assets, 'models/block/oak_door_top.json'), '{}\n')
      await ws.write(join(assets, 'models/block/oak_door_bottom.json'), '{}\n')
      const png = Buffer.from(makePngBase64(), 'base64')
      await fsp.mkdir(join(assets, 'textures/block'), { recursive: true })
      await fsp.writeFile(join(assets, 'textures/block/oak_door_top.png'), png)
      await fsp.writeFile(join(assets, 'textures/block/oak_door_bottom.png'), png)

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      must(project.items.some((item) => item.id === 'oak_door'), '门本体应导入')
      must(!project.items.some((item) => item.id === 'oak_door_top'), '门上半不应成为独立条目')
      must(!project.items.some((item) => item.id === 'oak_door_bottom'), '门下半不应成为独立条目')
    },
  },
]

process.exitCode = await runSuite('43 · 形态归并', cases)
