/**
 * 用例 20：Agent 工具补齐（content / lang / asset / project_admin / workbench 删除）。
 */

import { join } from 'node:path'

import { equal, makePngBase64, must, runSuite, writeNeoForgeProject } from './helpers.mjs'

async function newProject(ws, modid = 'toolmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '工具测试', modid, loader: 'neoforge' })
  await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: 'Ruby', type: 'material' } })
  return dir
}

function call(ws, tool, args) {
  return ws.call('agent.call', { tool, args })
}

const cases = [
  {
    name: 'content 工具：回填、预览、应用与历史',
    async run(ws) {
      const dir = await newProject(ws)
      const content = {
        recipe: { type: 'shaped', pattern: [' R '], keys: ['R=minecraft:stone'], count: 1 },
      }

      const preview = await call(ws, 'content', { action: 'preview', project: dir, id: 'ruby', content })
      must(Array.isArray(preview.files), 'preview 应返回文件清单')

      const applied = await call(ws, 'content', { action: 'apply', project: dir, id: 'ruby', content })
      must(applied.backupDir, 'apply 应返回备份目录')

      const back = await call(ws, 'content', { action: 'get', project: dir, id: 'ruby' })
      equal(back.recipe.type, 'shaped', 'get 应回填配方类型')
      equal(back.recipe.pattern[0], ' R ', 'get 应回填 pattern')

      const history = await call(ws, 'content', { action: 'history.list', project: dir, itemId: 'ruby' })
      must(history.entries.length >= 1, 'history.list 应返回历史步骤')
    },
  },
  {
    name: 'content 工具：回到某步',
    async run(ws) {
      const dir = await newProject(ws)
      const first = await call(ws, 'content', {
        action: 'apply', project: dir, id: 'ruby',
        content: { lang: { zh: '第一次' } },
      })
      await call(ws, 'content', {
        action: 'apply', project: dir, id: 'ruby',
        content: { lang: { zh: '第二次' } },
      })

      const rolled = await call(ws, 'content', {
        action: 'history.rollback', project: dir, entryId: first.historyEntry.id,
      })
      equal(rolled.rolledBack.length, 1, '应撤销后一步')

      const back = await call(ws, 'content', { action: 'get', project: dir, id: 'ruby' })
      equal(back.lang.zh, '第一次', '应回到第一步的结果')
    },
  },
  {
    name: 'lang 工具：列表、保存与补建',
    async run(ws) {
      const dir = await newProject(ws)
      // item_save 工具应与 HTTP 的 items.save 一致：新建物品连带创建语言键
      await call(ws, 'item_save', { project: dir, item: { id: 'sword', displayName: 'Sword', type: 'tool' } })
      let list = await call(ws, 'lang', { action: 'list', project: dir })
      equal(list.entries.length, 2, 'item_save 应连带创建语言键')

      const saved = await call(ws, 'lang', {
        action: 'save', project: dir,
        changes: { zh_cn: { 'item.toolmod.ruby': '红宝石' } },
      })
      must(saved.files.length >= 1, 'save 应写入语言文件')

      list = await call(ws, 'lang', { action: 'list', project: dir })
      equal(list.entries.find((entry) => entry.id === 'ruby').zh, '红宝石', 'save 后应回填中文')

      // 模拟旧项目：直接写一个没有语言键的物品文件
      await ws.write(
        join(dir, '.mcstudio', 'items', 'old_item.json'),
        JSON.stringify({ id: 'old_item', displayName: '旧物品', type: 'item' }),
      )
      const ensured = await call(ws, 'lang', { action: 'ensure', project: dir })
      equal(ensured.created, 1, 'ensure 应补建缺失键')

      // item_delete 工具应与 HTTP 的 items.delete 一致：连带删除语言键
      await call(ws, 'item_delete', { project: dir, id: 'sword' })
      list = await call(ws, 'lang', { action: 'list', project: dir })
      must(!list.others.some((entry) => entry.key === 'item.toolmod.sword'), 'item_delete 应连带删除语言键')
    },
  },
  {
    name: 'asset 工具：上传、清单、模型与删除',
    async run(ws) {
      const dir = await newProject(ws)

      const uploaded = await call(ws, 'asset', {
        action: 'upload', project: dir, id: 'ruby', kind: 'item', base64: makePngBase64(),
      })
      equal(uploaded.id, 'ruby', 'upload 应返回物品 id')

      let list = await call(ws, 'asset', { action: 'list', project: dir })
      must(list.textures.some((entry) => entry.id === 'ruby'), 'list 应包含新贴图')

      const savedModel = await call(ws, 'asset', {
        action: 'model.save', project: dir, id: 'ruby', model: '{"parent":"minecraft:item/handheld"}',
      })
      must(savedModel.text.includes('handheld'), 'model.save 应写入模型')

      const model = await call(ws, 'asset', { action: 'model.get', project: dir, id: 'ruby' })
      must(model.text.includes('handheld'), 'model.get 应读出模型')

      await call(ws, 'asset', { action: 'delete', project: dir, id: 'ruby', kind: 'item' })
      list = await call(ws, 'asset', { action: 'list', project: dir })
      must(!list.textures.some((entry) => entry.id === 'ruby'), 'delete 应移除贴图')
    },
  },
  {
    name: 'project_admin 工具：元数据、添加与根目录',
    async run(ws) {
      const dir = await newProject(ws, 'adminmod')

      const meta = await call(ws, 'project_admin', {
        action: 'saveMeta', project: dir, patch: { description: '通过工具修改' },
      })
      equal(meta.description, '通过工具修改', 'saveMeta 应写入描述')

      const added = await call(ws, 'project_admin', { action: 'add', project: dir })
      equal(added.path, dir, 'add 应返回项目路径')

      const root = await call(ws, 'project_admin', { action: 'setRoot', root: ws.root })
      equal(root.root.toLowerCase(), ws.root.toLowerCase(), 'setRoot 应更新扫描根目录')
    },
  },
  {
    name: 'project_admin 工具：重新导入',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('reimport'), { modid: 'reimportmod', items: ['a'], blocks: [] })
      await ws.call('project.import', { path: dir })
      const analysis = await ws.call('project.analyzeImport', { path: dir })

      const result = await call(ws, 'project_admin', {
        action: 'reimport', project: dir, mode: 'merge', proof: analysis.proof,
      })
      equal(result.meta.modid, 'reimportmod', 'reimport 应返回项目元数据')
    },
  },
  {
    name: 'workbench 工具支持删除系统与任务',
    async run(ws) {
      const dir = await newProject(ws, 'wbtoolmod')
      await call(ws, 'workbench', {
        action: 'system.save', project: dir,
        system: { id: 's1', name: '系统一', responsibility: '测试' },
      })
      await call(ws, 'workbench', {
        action: 'task.save', project: dir,
        task: {
          id: 't1', title: '任务一', systemId: 's1', goal: '测试',
          allowedPaths: [{ path: 'src/test.java', mode: 'modify' }],
          acceptance: ['ok'],
        },
      })

      const deletedSystem = await call(ws, 'workbench', { action: 'system.delete', project: dir, system: { id: 's1' } })
      equal(deletedSystem.systems.length, 0, '系统应被删除')
      const deletedTask = await call(ws, 'workbench', { action: 'task.delete', project: dir, task: { id: 't1' } })
      equal(deletedTask.tasks.length, 0, '任务应被删除')
    },
  },
  {
    name: '工具清单包含新增工具',
    async run(ws) {
      const result = await ws.call('agent.tools', {})
      const names = result.tools.map((tool) => tool.name)
      for (const expected of ['content', 'lang', 'asset', 'project_admin']) {
        must(names.includes(expected), `应包含工具 ${expected}`)
      }
      equal(names.length, 27, '工具数应为 27')
    },
  },
]

process.exitCode = await runSuite('20 · Agent 工具补齐', cases)
