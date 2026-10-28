/**
 * 用例 09：Agent 能力（工具清单、工具调用、摘要、校验）。
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, makePngBase64, must, rejects, runSuite, writeNeoForgeProject } from './helpers.mjs'

async function newProject(ws, modid = 'agentmod') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Agent 测试', modid, loader: 'neoforge' })
  return dir
}

const cases = [
  {
    name: '列出工具与动作',
    async run(ws) {
      const result = await ws.call('agent.tools', {})
      must(Array.isArray(result.tools), '应返回工具数组')
      must(result.tools.length >= 15, `工具数应不少于 15，实际 ${result.tools.length}`)

      const names = result.tools.map((tool) => tool.name)
      for (const expected of ['project_summary', 'item_list', 'item_save', 'project_validate', 'schema_get']) {
        must(names.includes(expected), `应包含工具 ${expected}`)
      }

      const sample = result.tools.find((tool) => tool.name === 'item_save')
      must(sample.description, '工具应有说明')
      must(sample.input, '工具应有输入结构')

      equal(result.actions.length, 37, '动作数应为 37')
    },
  },
  {
    name: '未知工具报错',
    async run(ws) {
      await rejects(() => ws.call('agent.call', { tool: 'no_such_tool', args: {} }), '未知工具', '未知工具应报错')
    },
  },
  {
    name: '摘要包含元数据、构想与物品',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('features.save', { path: dir, feature: { name: '宝石挖掘', status: 'done', priority: 'high' } })
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' } })

      const summary = await ws.call('agent.call', { tool: 'project_summary', args: { project: dir } })

      equal(summary.meta.modid, 'agentmod', '应含 modid')
      equal(summary.counts.ideas, 1, '应统计构想数')
      equal(summary.counts.ideasDone, 1, '应统计已完成构想')
      equal(summary.counts.items, 1, '应统计物品数')
      equal(summary.items[0].id, 'ruby', '应列出物品 id')
      equal(summary.items[0].texture, false, '应标注是否有贴图')
      must(Array.isArray(summary.missing.ids), '应含缺失列表')

      // 落盘验证
      const raw = JSON.parse(await readFile(join(dir, '.mcstudio', 'summary.json'), 'utf8'))
      equal(raw.meta.modid, 'agentmod', 'summary.json 应写入磁盘')
    },
  },
  {
    name: '写操作后摘要自动刷新',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'a', displayName: 'A' } })
      await ws.call('items.save', { path: dir, item: { id: 'b', displayName: 'B' } })

      const summary = await ws.call('agent.call', { tool: 'project_summary', args: { project: dir } })
      equal(summary.counts.items, 2, '摘要应随保存自动更新')
    },
  },
  {
    name: 'item_list 返回紧凑格式',
    async run(ws) {
      const dir = await newProject(ws)
      for (const id of ['a', 'b', 'c']) {
        await ws.call('items.save', { path: dir, item: { id, displayName: id.toUpperCase() } })
      }

      const result = await ws.call('agent.call', { tool: 'item_list', args: { project: dir } })
      equal(result.count, 3, '应列出 3 个')
      equal(Object.keys(result.items[0]).length, 3, '每项只含 id / name / type')

      const text = JSON.stringify(result)
      must(text.length < 400, `紧凑格式应小于 400 字节，实际 ${text.length}`)
    },
  },
  {
    name: 'item_list 按类型与关键词筛选',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' } })
      await ws.call('items.save', { path: dir, item: { id: 'ruby_block', displayName: '红宝石块', type: 'block' } })

      const blocks = await ws.call('agent.call', { tool: 'item_list', args: { project: dir, type: 'block' } })
      equal(blocks.count, 1, '类型筛选应生效')
      equal(blocks.items[0].id, 'ruby_block', '应返回方块')

      const matched = await ws.call('agent.call', { tool: 'item_list', args: { project: dir, query: '红宝石' } })
      equal(matched.count, 2, '关键词应匹配显示名')
    },
  },
  {
    name: 'item_get 返回带标签的完整字段',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' } })

      const item = await ws.call('agent.call', { tool: 'item_get', args: { project: dir, id: 'ruby' } })
      equal(item.displayName, '红宝石', '应返回显示名')
      equal(item.fields.length, 19, '应返回 19 个字段')
      must(item.fields.every((field) => field.label), '每个字段都应有中文标签')

      const stack = item.fields.find((field) => field.key === 'maxStackSize')
      equal(stack.value, 64, '应返回默认值')
      equal(stack.unit, '个', '应带单位')
    },
  },
  {
    name: 'item_get 找不到时报错',
    async run(ws) {
      const dir = await newProject(ws)
      await rejects(
        () => ws.call('agent.call', { tool: 'item_get', args: { project: dir, id: 'nope' } }),
        '没有这个物品',
        '不存在的 id 应报错',
      )
    },
  },
  {
    name: 'item_save 只传 id 即可创建',
    async run(ws) {
      const dir = await newProject(ws)
      const result = await ws.call('agent.call', { tool: 'item_save', args: { project: dir, item: { id: 'minimal' } } })

      equal(result.item.id, 'minimal', '应创建成功')
      equal(result.item.properties.maxStackSize, 64, '其余字段按默认值补全')
    },
  },
  {
    name: '构想工具可增删查',
    async run(ws) {
      const dir = await newProject(ws)
      const saved = await ws.call('agent.call', {
        tool: 'idea_save',
        args: { project: dir, idea: { name: '采矿', status: 'planning' } },
      })
      must(saved.idea.id, '应生成 id')

      const list = await ws.call('agent.call', { tool: 'idea_list', args: { project: dir } })
      equal(list.count, 1, '应列出 1 条')

      const filtered = await ws.call('agent.call', { tool: 'idea_list', args: { project: dir, status: 'done' } })
      equal(filtered.count, 0, '状态筛选应生效')

      const removed = await ws.call('agent.call', { tool: 'idea_delete', args: { project: dir, id: saved.idea.id } })
      equal(removed.remaining, 0, '删除后应为空')
    },
  },
  {
    name: '校验发现缺失贴图与语言键',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'lonely', displayName: '孤独' }, ensureModel: false })

      const report = await ws.call('agent.call', { tool: 'project_validate', args: { project: dir } })
      const codes = [...report.errors, ...report.warnings].map((entry) => entry.code)

      must(codes.includes('asset.texture'), '应报告缺贴图')
      must(codes.includes('asset.model'), '应报告缺模型')
      equal(report.ok, true, '只有警告时 ok 应为 true')
    },
  },
  {
    name: '校验发现数值越界',
    async run(ws) {
      const dir = await newProject(ws)
      // 保存时会夹紧到合法范围，因此直接改盘上文件模拟外部误改
      await ws.call('items.save', { path: dir, item: { id: 'bad', displayName: '越界' } })
      const file = join(dir, '.mcstudio', 'items', 'bad.json')
      const raw = JSON.parse(await readFile(file, 'utf8'))
      raw.properties.maxStackSize = 999
      await ws.write(file, JSON.stringify(raw, null, 2))

      const report = await ws.call('agent.call', { tool: 'project_validate', args: { project: dir } })
      const hit = report.errors.find((entry) => entry.code === 'item.property')
      must(hit, '应报告数值越界')
      must(hit.message.includes('maxStackSize') || hit.message.includes('最大堆叠'), '错误信息应指明字段')
      equal(report.ok, false, '有错误时 ok 应为 false')
    },
  },
  {
    name: '保存时的越界值会被夹紧',
    async run(ws) {
      const dir = await newProject(ws)
      const saved = await ws.call('items.save', {
        path: dir, item: { id: 'clamped', displayName: '夹紧', properties: { maxStackSize: 999 } },
      })
      equal(saved.item.properties.maxStackSize, 64, '保存时应夹紧到上限')
    },
  },
  {
    name: '校验发现模型引用不存在的贴图',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'ghost', displayName: '幽灵' } })
      await ws.call('assets.model.save', {
        path: dir,
        id: 'ghost',
        model: JSON.stringify({ parent: 'item/generated', textures: { layer0: 'agentmod:item/missing_texture' } }),
      })

      const report = await ws.call('agent.call', { tool: 'project_validate', args: { project: dir } })
      const hit = report.errors.find((entry) => entry.code === 'model.reference')
      must(hit, '应报告模型引用错误')
      must(hit.message.includes('missing_texture'), '错误信息应含被引用的路径')
    },
  },
  {
    name: '校验通过的项目 ok 为 true',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石' } })
      await ws.call('assets.upload', { path: dir, id: 'ruby', base64: makePngBase64() })
      await ws.call('assets.model.save', {
        path: dir,
        id: 'ruby',
        model: JSON.stringify({ parent: 'item/generated', textures: { layer0: 'agentmod:item/ruby' } }),
      })

      const report = await ws.call('agent.call', { tool: 'project_validate', args: { project: dir } })
      equal(report.errors.length, 0, `不应有错误：${JSON.stringify(report.errors)}`)
    },
  },
  {
    name: 'schema_get 提供完整与紧凑两种输出',
    async run(ws) {
      const full = await ws.call('agent.call', { tool: 'schema_get', args: {} })
      equal(full.fields.length, 19, '完整模式应有 19 个字段')
      must(full.fields[0].label, '完整模式应有中文标签')

      const compact = await ws.call('agent.call', { tool: 'schema_get', args: { compact: true } })
      equal(compact.fields.length, 19, '紧凑模式也应有 19 个字段')
      equal(Object.keys(compact.fields[0]).length, 3, '紧凑模式只保留 key / type / group')

      const sizeFull = JSON.stringify(full).length
      const sizeCompact = JSON.stringify(compact).length
      must(sizeCompact < sizeFull / 2, `紧凑模式应明显更小：${sizeCompact} vs ${sizeFull}`)
    },
  },
  {
    name: '默认项目在未指定时自动选取',
    async run(ws) {
      const dir = await newProject(ws)
      await ws.call('items.save', { path: dir, item: { id: 'auto', displayName: '自动' } })

      const list = await ws.call('agent.call', { tool: 'item_list', args: {} })
      equal(list.count, 1, '未指定项目时应使用注册表里的项目')
    },
  },
  {
    name: '没有项目时给出引导',
    async run(ws) {
      await rejects(
        () => ws.call('agent.call', { tool: 'item_list', args: {} }),
        '没有可用的工坊项目',
        '无项目时应提示如何建立',
      )
    },
  },
  {
    name: '扫码工具返回候选与导入状态',
    async run(ws) {
      await ws.call('registry.setRoot', { root: ws.root })
      const dir = await writeNeoForgeProject(ws, ws.path('scanme'), { modid: 'scanmod', items: ['a'], blocks: [] })

      const result = await ws.call('agent.call', { tool: 'project_scan', args: { root: ws.root } })
      must(result.candidates.some((item) => item.path === dir && item.imported === false), '应报告未导入的候选')
    },
  },
]

process.exitCode = await runSuite('09 · Agent 能力', cases)
