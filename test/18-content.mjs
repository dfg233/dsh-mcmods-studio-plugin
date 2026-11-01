/**
 * 用例 18：内容资源（语言 / 配方 / 模型 / 标签）预览、应用、历史与回滚。
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, rejects, runSuite } from './helpers.mjs'
import { appendHistoryEntry, readHistoryStore } from '../lib/history.js'

async function makeProject(ws) {
  const dir = ws.path('content')
  await ws.call('project.create', { path: dir, name: '内容测试', modid: 'contentmod', loader: 'forge' })
  await ws.call('items.save', { path: dir, item: { id: 'ruby_sword', displayName: '红宝石剑', type: 'tool' } })
  // v0.2.3 起创建物品会连带创建语言键并记历史；本套用例验证内容编辑本身，
  // 先清掉语言文件与历史，保持与旧行为一致的起点。
  await rm(join(dir, '.mcstudio', 'assets', 'contentmod', 'lang'), { recursive: true, force: true })
  await rm(join(dir, '.mcstudio', 'content-history.json'), { force: true })
  return dir
}

const content = {
  lang: { zh: '红宝石剑', en: 'Ruby Sword' },
  recipe: {
    type: 'shaped', pattern: [' R ', ' R ', ' S '], keys: ['R=ruby', 'S=minecraft:stick'], count: 1,
  },
  model: { parent: 'minecraft:item/handheld' },
}

const cases = [
  {
    name: '内容预览只返回文件，不落盘',
    async run(ws) {
      const dir = await makeProject(ws)
      const preview = await ws.call('content.preview', { path: dir, id: 'ruby_sword', content })
      equal(preview.files.length, 4, '应预览语言两条、配方、模型')
      must(preview.files.some((file) => file.kind === 'recipe'), '应包含配方')
      const raw = await readFile(join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8').catch(() => null)
      equal(raw, null, '预览不应写文件')
    },
  },
  {
    name: '应用写入语言、配方与模型',
    async run(ws) {
      const dir = await makeProject(ws)
      const result = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      must(result.backupDir, '应返回备份目录')
      const zh = JSON.parse(await readFile(join(dir, '.mcstudio', 'assets', 'contentmod', 'lang', 'zh_cn.json'), 'utf8'))
      equal(zh['item.contentmod.ruby_sword'], '红宝石剑', '中文名应写入')
      const recipe = JSON.parse(await readFile(join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8'))
      equal(recipe.type, 'minecraft:crafting_shaped', '应写有序配方')
      equal(recipe.result.item, 'contentmod:ruby_sword', '产出应为当前物品')
      const model = JSON.parse(await readFile(join(dir, '.mcstudio', 'assets', 'contentmod', 'models', 'item', 'ruby_sword.json'), 'utf8'))
      equal(model.parent, 'minecraft:item/handheld', '模型 parent 应写入')
    },
  },
  {
    name: '读取内容回填',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '红宝石剑', '应回填中文名')
      equal(data.recipe.type, 'shaped', '应回填配方类型')
      equal(data.recipe.pattern[0], ' R ', '应回填 pattern')
      equal(data.model.parent, 'minecraft:item/handheld', '应回填模型')
    },
  },
  {
    name: '回滚恢复应用前的资源',
    async run(ws) {
      const dir = await makeProject(ws)
      const result = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      await ws.call('content.rollback', { path: dir, backupDir: result.backupDir })
      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '', '回滚后中文名应为空')
      equal(data.recipe, null, '回滚后配方应为空')
    },
  },
  {
    name: '资源标签写入与移除',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', {
        path: dir, id: 'ruby_sword', content: { tags: ['minecraft:planks', 'ruby:lockable'] },
      })
      let data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.tags.length, 2, '应写入两个标签')
      must(data.tags.includes('minecraft:planks'), '应包含 minecraft 标签')
      const tag = JSON.parse(await readFile(join(dir, '.mcstudio', 'data', 'ruby', 'tags', 'items', 'lockable.json'), 'utf8'))
      equal(tag.values[0], 'contentmod:ruby_sword', '标签值应为当前物品')

      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { tags: [] } })
      data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.tags.length, 0, '清空后应移除标签')
    },
  },
  {
    name: '新建物品在保存前也能预览',
    async run(ws) {
      const dir = await makeProject(ws)
      const preview = await ws.call('content.preview', {
        path: dir, id: 'new_sword', content,
        item: { id: 'new_sword', displayName: '新剑', type: 'tool' },
      })
      equal(preview.files.length, 4, '新物品应能预览语言/配方/模型')
    },
  },
  {
    name: '标准工程写入 src/main/resources',
    async run(ws) {
      const dir = await makeProject(ws)
      await mkdir(join(dir, 'src', 'main', 'resources'), { recursive: true })
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      const raw = await readFile(join(dir, 'src', 'main', 'resources', 'assets', 'contentmod', 'lang', 'zh_cn.json'), 'utf8')
      must(raw.includes('红宝石剑'), '应写入标准资源目录')
      const recipe = await readFile(join(dir, 'src', 'main', 'resources', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8')
      must(recipe.includes('crafting_shaped'), '配方应写入标准数据目录')
    },
  },
  {
    name: '非法配方被拒绝且不写文件',
    async run(ws) {
      const dir = await makeProject(ws)
      let failed = false
      try {
        await ws.call('content.apply', {
          path: dir, id: 'ruby_sword',
          content: { recipe: { type: 'shaped', pattern: ['X'], keys: ['Y=minecraft:stick'] } },
        })
      } catch { failed = true }
      equal(failed, true, '未定义材料键应报错')
    },
  },

  // ── BUG-01：多行输入 ──────────────────────────────────────

  {
    name: '多行字符串解析 pattern 与材料键',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', {
        path: dir, id: 'ruby_sword',
        content: {
          recipe: {
            type: 'shaped',
            pattern: ' R \n R \n S \n',
            keys: 'R=ruby\nS=minecraft:stick\n',
          },
        },
      })
      const recipe = JSON.parse(await readFile(
        join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8',
      ))
      equal(recipe.pattern.length, 3, '末尾空行不应进入 pattern')
      equal(recipe.pattern[0], ' R ', 'pattern 的前导空格应保留')
      equal(recipe.pattern[2], ' S ', 'pattern 的尾随空格应保留')
      equal(Object.keys(recipe.key).length, 2, '材料键应为 2 项')
      equal(recipe.key.R.item, 'contentmod:ruby', '材料无命名空间时补当前模组')
    },
  },
  {
    name: '数组形式的 pattern 过滤空行但保留空格',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', {
        path: dir, id: 'ruby_sword',
        content: {
          recipe: { type: 'shaped', pattern: [' R ', '', ' S ', '  '], keys: ['R=ruby', 'S=minecraft:stick'] },
        },
      })
      const recipe = JSON.parse(await readFile(
        join(dir, '.mcstudio', 'data', 'contentmod', 'recipes', 'ruby_sword.json'), 'utf8',
      ))
      equal(recipe.pattern.length, 2, '空行应被丢弃')
      equal(recipe.pattern[0], ' R ', '空格应保留')
    },
  },

  // ── FEAT-02：内容历史 ─────────────────────────────────────

  {
    name: '内容写入后记录历史，跨调用可读',
    async run(ws) {
      const dir = await makeProject(ws)
      const first = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content })
      must(first.historyEntry && first.historyEntry.id, 'apply 应返回 historyEntry')
      equal(first.historyEntry.sequence, 1, '第一步的序号应为 1')
      equal(first.historyEntry.status, 'active', '新步骤应为 active')
      must(first.backupDir, '应保留备份目录')

      const list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      equal(list.entries.length, 1, '应能跨调用读到历史')
      equal(list.entries[0].title, '红宝石剑：语言/配方/模型', '标题应包含物品与改动类别')
      equal(list.entries[0].files.length, 4, '应记录语言两条、配方与模型')
      equal(list.entries[0].latest, true, '唯一一步应为最新')

      const manifest = await readFile(join(first.backupDir, 'manifest.json'), 'utf8')
      must(manifest.includes('"schemaVersion"'), '备份清单应保留')
      const raw = await readFile(join(dir, '.mcstudio', 'content-history.json'), 'utf8')
      must(raw.includes('"schemaVersion": 1'), '历史文件应写入项目')
    },
  },
  {
    name: '回到中间步骤：保留该步结果、撤销其后',
    async run(ws) {
      const dir = await makeProject(ws)
      const step1 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '甲' } } })
      const step2 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '乙' } } })
      const step3 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '丙' } } })

      const result = await ws.call('content.history.rollback', { path: dir, entryId: step2.historyEntry.id })
      equal(result.mode, 'toStep', '默认应为 toStep 语义')
      equal(result.rolledBack.length, 1, '应只撤销第 3 步')
      equal(result.rolledBack[0], step3.historyEntry.id, '撤销的应是第 3 步')

      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '乙', '目标步写入后的结果应保留')

      const list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      const bySequence = new Map(list.entries.map((entry) => [entry.sequence, entry]))
      equal(bySequence.get(1).status, 'active', '第 1 步应保留')
      equal(bySequence.get(2).status, 'active', '目标步应保持 active')
      equal(bySequence.get(3).status, 'rolledBack', '第 3 步应标记 rolledBack')
      equal(bySequence.get(2).latest, true, '回滚后目标步成为最新可操作步骤')

      // 备份不删除，允许人工恢复
      const manifest = await readFile(join(step3.backupDir, 'manifest.json'), 'utf8')
      must(manifest.includes('"files"'), '被撤销步骤的备份应保留')
      must(step1.historyEntry.id !== step2.historyEntry.id, '历史步 id 应唯一')
    },
  },
  {
    name: '已回滚记录保留，下一次写入时归档',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '甲' } } })
      const step2 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '乙' } } })
      const step3 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '丙' } } })
      await ws.call('content.history.rollback', { path: dir, entryId: step2.historyEntry.id })

      let list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      equal(list.entries.some((entry) => entry.status === 'rolledBack'), true, '回滚后不应立即归档')

      const step4 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '丁' } } })
      list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      const visible = new Map(list.entries.map((entry) => [entry.id, entry]))
      equal(visible.has(step3.historyEntry.id), false, '归档记录默认不展示')
      equal(visible.get(step4.historyEntry.id).status, 'active', '新步骤为 active')

      const all = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword', includeArchived: true })
      const archived = all.entries.find((entry) => entry.id === step3.historyEntry.id)
      must(archived, '显示已归档时应能看到旧记录')
      equal(archived.status, 'archived', '下一次写入应把 rolledBack 归档')
    },
  },
  {
    name: '回滚备份缺失时标记 failed 并停止',
    async run(ws) {
      const dir = await makeProject(ws)
      const step1 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '甲' } } })
      const step2 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '乙' } } })
      const step3 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '丙' } } })

      // 第 2 步的备份被外部删除：撤销第 3 步后停下，不假装成功
      await rm(step2.backupDir, { recursive: true, force: true })
      await rejects(
        () => ws.call('content.history.rollback', { path: dir, entryId: step1.historyEntry.id }),
        '备份不存在',
        '备份缺失应报错',
      )

      const list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      const bySequence = new Map(list.entries.map((entry) => [entry.sequence, entry]))
      equal(bySequence.get(3).status, 'rolledBack', '已撤销的步骤应保留状态')
      equal(bySequence.get(2).status, 'failed', '缺失备份的步骤应标记 failed')
      equal(bySequence.get(1).status, 'active', '目标之前的步骤不受影响')

      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '乙', '撤销第 3 步后应停在第二步的结果')
      equal(step3.historyEntry.sequence, 3, '第三步序号应为 3')
    },
  },
  {
    name: 'beforeStep 模式连目标步一起撤销（预留）',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '甲' } } })
      const step2 = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '乙' } } })

      const result = await ws.call('content.history.rollback', {
        path: dir, entryId: step2.historyEntry.id, mode: 'beforeStep',
      })
      equal(result.mode, 'beforeStep', '应回显 beforeStep 模式')
      equal(result.entry.status, 'rolledBack', '目标步本身也应被撤销')

      const data = await ws.call('content.get', { path: dir, id: 'ruby_sword' })
      equal(data.lang.zh, '甲', '应回到目标步写入之前')
    },
  },
  {
    name: '历史文件损坏时降级为空历史且不阻塞编辑',
    async run(ws) {
      const dir = await makeProject(ws)
      await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '甲' } } })
      await ws.write(join(dir, '.mcstudio', 'content-history.json'), '{ 这不是 JSON')

      const list = await ws.call('content.history.list', { path: dir, itemId: 'ruby_sword' })
      equal(list.entries.length, 0, '损坏时应按空历史处理')
      must(list.warning, '应返回告警文案')

      const applied = await ws.call('content.apply', { path: dir, id: 'ruby_sword', content: { lang: { zh: '乙' } } })
      must(applied.historyEntry && applied.historyEntry.id, '损坏后仍应能记录新步骤')
      equal(applied.historyEntry.sequence, 1, '新历史应重新从 1 开始')
    },
  },
  {
    name: '非归档记录超过上限时归档最旧记录',
    async run(ws) {
      const dir = await makeProject(ws)
      const backup = join(dir, 'fake-backup')
      await mkdir(backup, { recursive: true })
      for (let index = 1; index <= 52; index += 1) {
        await appendHistoryEntry(dir, {
          itemId: 'ruby_sword',
          files: [{ kind: 'lang', path: 'a.json' }],
          backupDir: backup,
        })
      }
      const store = await readHistoryStore(dir)
      equal(store.entries.length, 52, '记录本身不物理删除')
      const archived = store.entries.filter((entry) => entry.status === 'archived')
      equal(archived.length, 2, '超出上限的两条应归档')
      equal(archived[0].sequence, 1, '应归档最旧记录')
      equal(archived[1].sequence, 2, '应归档次旧记录')
      equal(store.entries.filter((entry) => entry.status === 'active').length, 50, '非归档记录应保持 50 条')

      const list = await ws.call('content.history.list', { path: dir })
      equal(list.entries.length, 50, '默认列表不含归档记录')
      const full = await ws.call('content.history.list', { path: dir, includeArchived: true })
      equal(full.entries.length, 52, '显示已归档时应能看到全部记录')
      equal(full.options.maxEntries, 50, '应回显默认上限 50')
    },
  },
]

process.exitCode = await runSuite('18 · 内容资源', cases)
