/**
 * 用例 29：第二批模板（方块实体、钥匙、网络包、持久化、可锁方块、锁类型、配置、创造标签）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm3mod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '二批模板', modid, loader: 'forge' })
  return dir
}

const NEW_TEMPLATES = [
  'block-entity-menu',
  'uuid-key-item',
  's2c-sync-packet',
  'saved-data-store',
  'lockable-interaction',
  'lock-type',
  'config',
  'creative-tab',
]

const cases = [
  {
    name: '模板清单包含第二批',
    async run(ws) {
      const result = await ws.call('template.list', {})
      equal(result.templates.length, 18, '应有 18 个模板')
      for (const id of NEW_TEMPLATES) {
        must(result.templates.some((item) => item.id === id), `应包含 ${id}`)
      }
    },
  },
  {
    name: '第二批模板均可读取',
    async run(ws) {
      for (const id of NEW_TEMPLATES) {
        const template = await ws.call('template.get', { id })
        equal(template.id, id, `${id} 应返回清单`)
        must(template.files.length > 0, `${id} 应有文件`)
        must(template.files.some((file) => file.content.includes('{{')), `${id} 应含模板变量`)
      }
    },
  },
  {
    name: '渲染方块实体模板',
    async run(ws) {
      const dir = await newProject(ws, 'bemod')
      const result = await ws.call('template.render', {
        path: dir,
        id: 'block-entity-menu',
        params: { id: 'ruby_chest', displayName: 'Ruby Chest' },
      })
      equal(result.files.length, 4, '应渲染 4 个文件')
      const paths = result.files.map((file) => file.path)
      must(paths.some((path) => path.endsWith('RubyChestBlockEntity.java')), '应包含方块实体')
      must(paths.some((path) => path.endsWith('RubyChestBlock.java')), '应包含方块')
      const block = result.files.find((file) => file.path.endsWith('RubyChestBlock.java'))
      must(block.content.includes('implements EntityBlock'), '方块应实现 EntityBlock')
      const be = result.files.find((file) => file.path.endsWith('RubyChestBlockEntity.java'))
      must(be.content.includes('RUBY_CHEST_BE'), '方块实体应引用注册常量')
    },
  },
  {
    name: '渲染钥匙与网络包模板',
    async run(ws) {
      const dir = await newProject(ws, 'keymod')
      const key = await ws.call('template.render', {
        path: dir, id: 'uuid-key-item', params: { id: 'electronic_key', displayName: '电子钥匙' },
      })
      equal(key.files.length, 3, '钥匙模板应渲染 3 个文件')
      const data = key.files.find((file) => file.path.endsWith('Data.java'))
      must(data.content.includes('putUUID'), '应包含 UUID 写入')

      const packet = await ws.call('template.render', {
        path: dir, id: 's2c-sync-packet', params: { id: 'sync', displayName: '同步' },
      })
      equal(packet.files.length, 3, '网络包模板应渲染 3 个文件')
      const network = packet.files.find((file) => file.path.endsWith('ModNetwork.java'))
      must(network.content.includes('SimpleChannel'), '应使用 SimpleChannel')
    },
  },
  {
    name: '渲染持久化与配置模板',
    async run(ws) {
      const dir = await newProject(ws, 'datamod')
      const saved = await ws.call('template.render', {
        path: dir, id: 'saved-data-store', params: { id: 'lock_data', displayName: '锁数据' },
      })
      equal(saved.files.length, 2, '持久化模板应渲染 2 个文件')
      must(saved.files[0].content.includes('extends SavedData'), '应继承 SavedData')

      const config = await ws.call('template.render', {
        path: dir, id: 'config', params: { id: 'cfg', displayName: '配置' },
      })
      equal(config.files.length, 1, '配置模板应渲染 1 个文件')
      must(config.files[0].content.includes('ForgeConfigSpec'), '应包含 ForgeConfigSpec')
    },
  },
  {
    name: '标记模板写入创造标签',
    async run(ws) {
      const dir = await newProject(ws, 'tabmod')
      const result = await ws.call('codegen.apply', {
        path: dir,
        templateRefs: [{ id: 'creative-tab', parameters: { id: 'ruby_tab', displayName: 'Ruby Tab' } }],
      })
      const rel = 'src/main/java/com/example/tabmod/registry/ModCreativeTabs.java'
      must(result.created.includes(rel), '应创建 ModCreativeTabs')
      const text = await readFile(join(dir, rel), 'utf8')
      must(text.includes('<mcstudio:generated creative_tabs>'), '应写入标记')
      must(text.includes('RUBY_TAB'), '应写入标签注册行')
      must(text.includes('DeferredRegister'), '应写入注册表骨架')
    },
  },
  {
    name: '锁类型模板是安全骨架',
    async run(ws) {
      const dir = await newProject(ws, 'lockmod')
      const result = await ws.call('template.render', {
        path: dir, id: 'lock-type', params: { id: 'electronic_lock', displayName: '电子锁' },
      })
      equal(result.files.length, 1, '锁类型模板应渲染 1 个文件')
      const content = result.files[0].content
      must(content.includes('TYPE_ID'), '应包含类型 id 常量')
      must(content.includes('TODO'), '应保留待补逻辑提示')
      must(!content.includes('extends AbstractLock'), '默认不直接继承，避免编译失败')
    },
  },
  {
    name: '第二批模板工具调用',
    async run(ws) {
      const dir = await newProject(ws, 'toolmod')
      const result = await ws.call('agent.call', {
        tool: 'template',
        args: {
          action: 'render',
          project: dir,
          id: 'lockable-interaction',
          params: { id: 'locked_door', displayName: '上锁的门' },
        },
      })
      equal(result.files.length, 1, '工具应返回 1 个文件')
      must(result.files[0].content.includes('InteractionResult'), '应包含交互结果')
    },
  },
]

process.exitCode = await runSuite('29 · 第二批模板', cases)
