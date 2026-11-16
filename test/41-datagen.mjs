/**
 * 用例 41：datagen provider 模板。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm41') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Datagen', modid, loader: 'forge', authors: 'Besson' })
  return dir
}

const cases = [
  {
    name: '六个 datagen 模板存在',
    async run() {
      const { listTemplates } = await import('../lib/templates.js')
      const templates = await listTemplates()
      const ids = templates.map((item) => item.id)
      for (const id of ['datagen-blockstate', 'datagen-item-model', 'datagen-lang', 'datagen-recipe', 'datagen-loot', 'datagen-worldgen']) {
        must(ids.includes(id), `应包含模板 ${id}`)
      }
    },
  },
  {
    name: '渲染语言 provider',
    async run(ws) {
      const dir = await newProject(ws, 'm41lang')
      const result = await ws.call('template.render', { path: dir, id: 'datagen-lang', params: { package: 'com.besson.m41lang' } })
      const file = result.files[0]
      must(file.path.endsWith('datagen/ModEnUsLangProvider.java'), '路径应为 datagen/ModEnUsLangProvider.java')
      must(file.content.includes('extends LanguageProvider'), '应继承 LanguageProvider')
      must(file.content.includes('itemGroup.m41lang.main'), '应包含创造栏语言键')
    },
  },
  {
    name: '渲染掉落 provider',
    async run(ws) {
      const dir = await newProject(ws, 'm41loot')
      const result = await ws.call('template.render', { path: dir, id: 'datagen-loot', params: { package: 'com.besson.m41loot' } })
      const content = result.files[0].content
      must(content.includes('extends BlockLootSubProvider'), '应继承 BlockLootSubProvider')
      must(content.includes('getKnownBlocks'), '应覆写 getKnownBlocks')
    },
  },
  {
    name: '渲染世界生成 provider',
    async run(ws) {
      const dir = await newProject(ws, 'm41world')
      const result = await ws.call('template.render', { path: dir, id: 'datagen-worldgen', params: { package: 'com.besson.m41world' } })
      const content = result.files[0].content
      must(content.includes('RegistrySetBuilder'), '应包含 RegistrySetBuilder')
      must(content.includes('BIOME_MODIFIERS'), '应注册 BiomeModifier')
    },
  },
]

process.exitCode = await runSuite('41 · datagen 模板', cases)
