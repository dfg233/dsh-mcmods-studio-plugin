/**
 * 用例 07：扫描候选工程、已导入判定、重新导入与差异。
 */

import { rm } from 'node:fs/promises'
import { equal, must, runSuite, writeFabricProject, writeNeoForgeProject } from './helpers.mjs'

const cases = [
  {
    name: '扫描识别工坊项目与模组工程',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      await ws.call('project.create', { path: ws.path('studio-one'), name: '工坊项目', modid: 'studioone', loader: 'forge' })
      await writeNeoForgeProject(ws, ws.path('plain-mod'), { modid: 'plainmod', items: [], blocks: [] })

      const scan = await ws.call('projects.scan', { root: ws.root })
      const byDir = Object.fromEntries(scan.candidates.map((item) => [item.path.split(/[\\/]/).pop(), item]))

      equal(byDir['studio-one']?.kind, 'studio', '工坊项目应识别为 studio')
      equal(byDir['plain-mod']?.kind, 'mod', '模组工程应识别为 mod')
    },
  },
  {
    name: '已导入的项目标记为 imported',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      await ws.call('project.create', { path: ws.path('marker'), name: '带标记', modid: 'markermod', loader: 'forge' })

      const scan = await ws.call('projects.scan', { root: ws.root })
      const hit = scan.candidates.find((item) => item.path.endsWith('marker'))
      equal(hit.imported, true, '有 studio.json 应为已导入')
      equal(hit.legacy, false, '有标记时不应是 legacy')
      must(hit.importedAt, '应返回导入时间')
    },
  },
  {
    name: '删掉标记的老项目视为 legacy 已导入',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      const dir = ws.path('legacy')
      await ws.call('project.create', { path: dir, name: '老项目', modid: 'legacymod', loader: 'forge' })
      await rm(`${dir}/.mcstudio/studio.json`)

      const scan = await ws.call('projects.scan', { root: ws.root })
      const hit = scan.candidates.find((item) => item.path.endsWith('legacy'))
      equal(hit.imported, true, '只有 project.json 也应算已导入')
      equal(hit.legacy, true, '应标记为 legacy')
    },
  },
  {
    name: '全新工程标记为未导入',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      await writeFabricProject(ws, ws.path('fresh-mod'), { modid: 'freshmod' })

      const scan = await ws.call('projects.scan', { root: ws.root })
      const hit = scan.candidates.find((item) => item.path.endsWith('fresh-mod'))
      equal(hit.imported, false, '没有工坊数据应为未导入')
    },
  },
  {
    name: '不存在的根目录报错',
    async run(ws) {
      let failed = false
      try {
        await ws.call('projects.scan', { root: ws.path('nope') })
      } catch {
        failed = true
      }
      equal(failed, true, '根目录不存在应报错')
    },
  },
  {
    name: '空根目录返回空列表',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      const scan = await ws.call('projects.scan', { root: ws.root })
      equal(scan.candidates.length, 0, '空目录应返回空数组')
    },
  },
  {
    name: '三分支判定：registered / orphan / new',
    async run(ws) {
      const registered = await writeNeoForgeProject(ws, ws.path('a'), { modid: 'amod' })
      await ws.call('project.import', { path: registered })
      const r1 = await ws.call('project.analyzeImport', { path: registered })
      equal(r1.kind, 'registered', '已登记应为 registered')

      const orphan = await writeNeoForgeProject(ws, ws.path('b'), { modid: 'bmod' })
      await ws.call('project.import', { path: orphan })
      await ws.call('projects.remove', { path: orphan })
      const r2 = await ws.call('project.analyzeImport', { path: orphan })
      equal(r2.kind, 'orphan', '移除登记后应为 orphan')

      const fresh = await writeNeoForgeProject(ws, ws.path('c'), { modid: 'cmod' })
      const r3 = await ws.call('project.analyzeImport', { path: fresh })
      equal(r3.kind, 'new', '全新目录应为 new')
    },
  },
  {
    name: '差异分析区分新增、保留、类型冲突',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('diff'), {
        modid: 'diffmod', items: ['ruby'], blocks: ['ruby_block'],
      })
      await ws.call('project.import', { path: dir })
      await ws.call('project.open', { path: dir })

      // 新增一个资源；把一个物品的类型改成 block 以制造冲突
      await ws.write(`${dir}/src/main/resources/assets/diffmod/textures/item/sapphire.png`, 'png')
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'block' } })

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      const created = analysis.diff.created.map((item) => item.id)
      const conflicts = analysis.diff.typeConflicts.map((item) => item.id)

      must(created.includes('sapphire'), '应识别新增资源')
      must(conflicts.includes('ruby'), '应识别类型冲突')
      must(analysis.diff.kept.some((item) => item.id === 'ruby_block'), '未变的条目应保留')
    },
  },
  {
    name: '重新导入补充新增条目并保留已有',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('re'), {
        modid: 'remod', items: ['ruby'], blocks: [],
      })
      await ws.call('project.import', { path: dir })

      // 用户改过显示名
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '用户改的名字', type: 'item' } })
      await ws.write(`${dir}/src/main/resources/assets/remod/textures/item/sapphire.png`, 'png')

      const result = await ws.call('project.reimport', { path: dir, mode: 'merge' })
      must(result.imported.created.includes('sapphire'), '应新增 sapphire')
      must(result.imported.kept.includes('ruby'), 'ruby 应保留')

      const project = await ws.call('project.open', { path: dir })
      const ruby = project.items.find((item) => item.id === 'ruby')
      equal(ruby.displayName, '用户改的名字', '用户改过的字段不应被覆盖')
    },
  },
  {
    name: 'overwrite 模式改写类型冲突',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('ow'), {
        modid: 'owmod', items: ['gem'], blocks: [],
      })
      await ws.call('project.import', { path: dir })
      await ws.call('items.save', { path: dir, item: { id: 'gem', displayName: '宝石', type: 'block' } })

      const result = await ws.call('project.reimport', { path: dir, mode: 'overwrite' })
      must(result.imported.updated.includes('gem'), '冲突项应被改写')

      const project = await ws.call('project.open', { path: dir })
      equal(project.items.find((item) => item.id === 'gem').type, 'item', '类型应改回扫描结果')
    },
  },
  {
    name: 'merge 模式不改写类型冲突',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('mg'), {
        modid: 'mgmod', items: ['gem'], blocks: [],
      })
      await ws.call('project.import', { path: dir })
      await ws.call('items.save', { path: dir, item: { id: 'gem', displayName: '宝石', type: 'block' } })

      await ws.call('project.reimport', { path: dir, mode: 'merge' })
      const project = await ws.call('project.open', { path: dir })
      equal(project.items.find((item) => item.id === 'gem').type, 'block', 'merge 应保留用户设定')
    },
  },
  {
    name: '未导入的目录不能重新导入',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('notimported'), { modid: 'nimod', items: [], blocks: [] })
      let failed = false
      try {
        await ws.call('project.reimport', { path: dir })
      } catch {
        failed = true
      }
      equal(failed, true, '未导入目录应拒绝重新导入')
    },
  },
]

process.exitCode = await runSuite('07 · 扫描与重新导入', cases)
