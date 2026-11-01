/**
 * 用例 19：语言文件列表、保存、生命周期与历史。
 */

import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, rejects, runSuite } from './helpers.mjs'

async function makeProject(ws, options = {}) {
  const dir = ws.path(options.name ?? 'lang')
  await ws.call('project.create', {
    path: dir, name: '语言测试', modid: options.modid ?? 'langmod', loader: 'forge',
  })
  return dir
}

async function saveItem(ws, dir, item) {
  return ws.call('items.save', { path: dir, item })
}

function langFile(dir, modid, locale) {
  return join(dir, '.mcstudio', 'assets', modid, 'lang', `${locale}.json`)
}

async function readLang(dir, modid, locale) {
  const raw = await readFile(langFile(dir, modid, locale), 'utf8').catch(() => null)
  return raw ? JSON.parse(raw) : null
}

const cases = [
  {
    name: '列出物品语言键与缺失统计',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      await saveItem(ws, dir, { id: 'ruby_block', displayName: 'Ruby Block', type: 'block' })

      const list = await ws.call('lang.list', { path: dir })
      equal(list.entries.length, 2, '应列出两个物品')
      equal(list.stats.total, 2, '统计应与条目一致')
      equal(list.entries.find((entry) => entry.id === 'ruby').kind, 'item', '普通物品 kind 为 item')
      equal(list.entries.find((entry) => entry.id === 'ruby_block').kind, 'block', '方块 kind 为 block')
      must(list.files.zh_cn.includes('lang/zh_cn.json'), '应返回语言文件相对路径')
    },
  },
  {
    name: '未知键归入其他键且不被修改',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      await ws.write(langFile(dir, 'langmod', 'zh_cn'), JSON.stringify({
        'item.langmod.ruby': '红宝石',
        'item.langmod.removed': '旧物品',
      }))

      const list = await ws.call('lang.list', { path: dir })
      equal(list.stats.unknown, 1, '应识别一个未知键')
      equal(list.others[0].key, 'item.langmod.removed', '未知键内容正确')

      await ws.call('lang.save', {
        path: dir, changes: { zh_cn: { 'item.langmod.ruby': '红宝石剑' } },
      })
      const data = await readLang(dir, 'langmod', 'zh_cn')
      equal(data['item.langmod.removed'], '旧物品', '保存不应修改未知键')
      equal(data['item.langmod.ruby'], '红宝石剑', '应写入提交的键')
    },
  },
  {
    name: '保存只改提交的键并保留其他键',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      await saveItem(ws, dir, { id: 'sword', displayName: 'Sword', type: 'tool' })

      await ws.call('lang.save', {
        path: dir,
        changes: { zh_cn: { 'item.langmod.ruby': '红宝石' } },
      })
      const zh = await readLang(dir, 'langmod', 'zh_cn')
      equal(zh['item.langmod.ruby'], '红宝石', '应更新 ruby')
      equal(zh['item.langmod.sword'], 'Sword', '未提交的键保持原值')
      const en = await readLang(dir, 'langmod', 'en_us')
      equal(en['item.langmod.sword'], 'Sword', '未改动 locale 不受影响')
    },
  },
  {
    name: '空串删除语言键',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })

      await ws.call('lang.save', {
        path: dir, changes: { zh_cn: { 'item.langmod.ruby': '' } },
      })
      const zh = await readLang(dir, 'langmod', 'zh_cn')
      equal('item.langmod.ruby' in zh, false, '空串应删除该键')
      const list = await ws.call('lang.list', { path: dir })
      must(list.entries[0].missing.includes('zh_cn'), '删除后应标记缺中文')
    },
  },
  {
    name: '语言写入保留备份并记入历史',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })

      const result = await ws.call('lang.save', {
        path: dir, changes: { en_us: { 'item.langmod.ruby': 'Ruby Gem' } },
      })
      must(result.backupDir, '应返回备份目录')
      const manifest = await readFile(join(result.backupDir, 'manifest.json'), 'utf8')
      must(manifest.includes('"schemaVersion"'), '备份清单应存在')

      const history = await ws.call('content.history.list', { path: dir, includeArchived: true })
      const entry = history.entries.find((item) => item.scope === 'project')
      must(entry, '应有项目级历史步骤')
      equal(entry.title, '语言文件：zh_cn/en_us', '语言步骤标题应可读')
    },
  },
  {
    name: '语言文件损坏时拒绝保存',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      await ws.write(langFile(dir, 'langmod', 'zh_cn'), '{ 不是 JSON')

      const list = await ws.call('lang.list', { path: dir })
      must(list.warning, '应返回损坏告警')
      await rejects(
        () => ws.call('lang.save', { path: dir, changes: { en_us: { 'item.langmod.ruby': 'X' } } }),
        '损坏',
        '损坏文件应拒绝保存',
      )
    },
  },
  {
    name: '标准资源目录优先于回退目录',
    async run(ws) {
      const dir = await makeProject(ws)
      await mkdir(join(dir, 'src', 'main', 'resources'), { recursive: true })
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })

      const list = await ws.call('lang.list', { path: dir })
      equal(list.standard, true, '应使用标准资源目录')
      must(list.files.zh_cn.startsWith('src/main/resources/assets/langmod/lang/'), '路径应在标准目录下')
      const raw = await readFile(join(dir, list.files.zh_cn), 'utf8')
      must(raw.includes('item.langmod.ruby'), '语言键应写入标准目录')
    },
  },
  {
    name: '创建物品自动创建语言键并使用英文回填',
    async run(ws) {
      const dir = await makeProject(ws)
      const saved = await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      equal(saved.warnings, undefined, '创建物品不应产生语言告警')

      const zh = await readLang(dir, 'langmod', 'zh_cn')
      const en = await readLang(dir, 'langmod', 'en_us')
      equal(zh['item.langmod.ruby'], 'Ruby', '中文默认用英文（displayName）回填')
      equal(en['item.langmod.ruby'], 'Ruby', '英文取 displayName')

      const history = await ws.call('content.history.list', { path: dir, includeArchived: true })
      must(history.entries.some((item) => item.title === '创建 ruby：语言'), '创建应记历史')
    },
  },
  {
    name: '删除物品连带删除语言键',
    async run(ws) {
      const dir = await makeProject(ws)
      await saveItem(ws, dir, { id: 'ruby', displayName: 'Ruby', type: 'material' })
      await ws.call('items.delete', { path: dir, id: 'ruby' })

      const zh = await readLang(dir, 'langmod', 'zh_cn')
      const en = await readLang(dir, 'langmod', 'en_us')
      equal('item.langmod.ruby' in zh, false, '中文键应删除')
      equal('item.langmod.ruby' in en, false, '英文键应删除')

      const history = await ws.call('content.history.list', { path: dir, includeArchived: true })
      must(history.entries.some((item) => item.title === '删除 ruby：语言'), '删除应记历史')
    },
  },
  {
    name: '旧项目可补建缺失语言键',
    async run(ws) {
      const dir = await makeProject(ws)
      // 绕过 items.save，模拟旧项目里没有语言键的物品
      await ws.write(
        join(dir, '.mcstudio', 'items', 'old_item.json'),
        JSON.stringify({ id: 'old_item', displayName: '旧物品', type: 'item' }),
      )

      let list = await ws.call('lang.list', { path: dir })
      equal(list.stats.missingKey, 1, '应识别缺少语言键的物品')
      equal(list.entries[0].keyMissing, true, '条目应标记缺键')

      const ensured = await ws.call('lang.ensure', { path: dir })
      equal(ensured.created, 1, '应补建一个键')
      list = await ws.call('lang.list', { path: dir })
      equal(list.entries[0].keyMissing, false, '补建后不应再缺键')
      equal(list.entries[0].zh, '旧物品', '补建值取 displayName')
      equal(list.entries[0].en, '旧物品', '英文同样取 displayName')
    },
  },
]

process.exitCode = await runSuite('19 · 语言文件', cases)
