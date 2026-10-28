/**
 * 用例 11：原生工具桥接与导入提示。
 *
 * 工具桥接把 lib/tools.js 注册为 DSH 工具，这里用假 ctx 验证：
 * 注册数量、名称前缀、参数结构、执行与错误包装。
 * 导入提示验证 notices 随导入结果返回。
 */

import { equal, must, rejects, runSuite, writeFabricProject, writeNeoForgeProject } from './helpers.mjs'

const root = 'D:/program/dsh-mcmods-studio-plugin'

const cases = [
  {
    name: '工具桥接注册全部工具且带前缀',
    async run() {
      const { registerTools, toolNames } = await import(`file:///${root}/lib/tool-bridge.js`)
      const registered = []
      const fakeCtx = {
        tools: {
          register(definition) {
            registered.push(definition)
            return () => {}
          },
        },
      }

      const disposers = registerTools(fakeCtx)
      equal(registered.length, 21, '应注册 21 个工具')
      equal(disposers.length, 21, '应返回 21 个 disposer')

      const names = toolNames()
      equal(new Set(names).size, names.length, '工具名不应重复')
      must(names.every((name) => name.startsWith('mcmods_')), '全部工具应带 mcmods_ 前缀')
    },
  },
  {
    name: '工具定义结构符合 DSH 要求',
    async run() {
      const { registerTools } = await import(`file:///${root}/lib/tool-bridge.js`)
      const registered = []
      registerTools({ tools: { register: (definition) => { registered.push(definition); return () => {} } } })

      const sample = registered.find((tool) => tool.name === 'mcmods_item_save')
      must(sample, '应包含 item_save')
      must(typeof sample.description === 'string' && sample.description.length > 10, '应有说明')
      equal(sample.parameters.type, 'object', '参数应为 object')
      must(sample.parameters.properties, '应有 properties')
      equal(sample.parameters.additionalProperties, false, '应禁止额外字段')
      must(Array.isArray(sample.parameters.required), 'item_save 应有必填项')
      must(sample.parameters.required.includes('item'), 'item_save 应要求 item')

      must(typeof sample.execute === 'function', '应有 execute')
      must(sample.output && sample.output.schema, '应有 output.schema')
      must(typeof sample.output.render === 'function', '应有 output.render')
      const rendered = sample.output.render({}, { ok: true })
      must(Array.isArray(rendered) && rendered[0].type === 'text', 'render 应返回文本块')
    },
  },
  {
    name: '工具执行走真实业务函数',
    async run(ws) {
      const { registerTools } = await import(`file:///${root}/lib/tool-bridge.js`)
      const registered = []
      registerTools({ tools: { register: (definition) => { registered.push(definition); return () => {} } } })

      const dir = ws.path('bridged')
      await ws.call('project.create', { path: dir, name: '桥接测试', modid: 'bridgemod', loader: 'neoforge' })
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石' } })

      const listTool = registered.find((tool) => tool.name === 'mcmods_item_list')
      const result = await listTool.execute({ project: dir })
      equal(result.count, 1, '应查到 1 个物品')
      equal(result.items[0].id, 'ruby', '应返回 ruby')
    },
  },
  {
    name: '工具错误被包装成可读信息',
    async run(ws) {
      const { registerTools } = await import(`file:///${root}/lib/tool-bridge.js`)
      const registered = []
      registerTools({ tools: { register: (definition) => { registered.push(definition); return () => {} } } })

      const dir = ws.path('bad')
      await ws.call('project.create', { path: dir, name: '错误测试', modid: 'badmod', loader: 'forge' })

      const getTool = registered.find((tool) => tool.name === 'mcmods_item_get')
      await rejects(
        () => getTool.execute({ project: dir, id: 'missing' }),
        'item_get 失败',
        '错误应带上工具名',
      )
    },
  },
  {
    name: '无 tools 服务时明确报错',
    async run() {
      const { registerTools } = await import(`file:///${root}/lib/tool-bridge.js`)
      await rejects(
        () => Promise.resolve().then(() => registerTools({})),
        '未提供 tools 服务',
        '缺少 tools 服务应明确报错，避免静默跳过',
      )
    },
  },
  {
    name: '导入返回判定提示',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('noticed'), {
        modid: 'noticemod',
        toml: [
          'modLoader="javafml"', 'loaderVersion="[47,)"', '[[mods]]',
          'modId="${mod_id}"', 'displayName="${mod_name}"', 'version="${mod_version}"',
        ].join('\n'),
      })

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      must(Array.isArray(analysis.notices), '分析结果应含 notices')
      must(analysis.notices.length > 0, '占位符与加载器判定应产生提示')

      const codes = analysis.notices.map((notice) => notice.code)
      must(codes.includes('descriptor.placeholder'), '应提示占位符已解析')
      must(codes.includes('loader.gradle'), '应提示加载器判定来源')

      const imported = await ws.call('project.import', { path: dir })
      must(Array.isArray(imported.imported.notices), '导入结果应含 notices')
      must(
        imported.imported.notices.some((notice) => notice.message.includes('$')),
        '占位符提示应列出原始表达式',
      )
    },
  },
  {
    name: '缺 gradle.properties 时说明缺失原因',
    async run(ws) {
      const dir = await writeFabricProject(ws, ws.path('nofallback'), { modid: 'nofallmod' })
      const { rm } = await import('node:fs/promises')
      await rm(`${dir}/gradle.properties`)

      // 没有 gradle.properties 时加载器版本无从获取，应明确报缺失而不是静默兜底
      const analysis = await ws.call('project.analyzeImport', { path: dir })
      must(analysis.identityError, '应返回 identityError')
      must(analysis.identityError.includes('缺少必要信息'), '应说明缺失')
      must(analysis.identityError.includes('加载器版本'), '应指明缺加载器版本')
      equal(analysis.notices.length, 0, '解析失败时不应有判定提示')
    },
  },
  {
    name: '有 gradle.properties 的 Fabric 工程可正常判定',
    async run(ws) {
      const dir = await writeFabricProject(ws, ws.path('fabok'), { modid: 'fabokmod', version: '1.1.0' })
      const analysis = await ws.call('project.analyzeImport', { path: dir })

      equal(analysis.identityError, '', '不应有解析错误')
      equal(analysis.identity.loader, 'fabric', '应判定为 Fabric')
      const codes = analysis.notices.map((notice) => notice.code)
      must(codes.includes('loader.gradle'), '应提示加载器判定来源')
    },
  },
]

process.exitCode = await runSuite('11 · 工具桥接与导入提示', cases)
