/**
 * 用例 03：工程导入（gradle.properties 解析、身份判定、三分支、占位符）。
 */

import { equal, must, rejects, runSuite, writeFabricProject, writeNeoForgeProject } from './helpers.mjs'

const cases = [
  {
    name: '从 gradle.properties 补全 NeoForge 元数据',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('neo'), {
        modid: 'neomod', name: 'Neo 模组', version: '3.2.1',
      })
      const project = await ws.call('project.import', { path: dir })

      equal(project.meta.modid, 'neomod', 'modid 应来自 gradle.properties')
      equal(project.meta.version, '3.2.1', '版本应来自 gradle.properties')
      equal(project.meta.name, 'Neo 模组', '名称应来自 gradle.properties')
      equal(project.meta.loader, 'neoforge', '应判定为 NeoForge')
      equal(project.meta.authors, 'Tester', '应写入作者')
      equal(project.meta.license, 'MIT', '应写入许可证')
      equal(project.meta.group, 'com.example.neomod', '应写入包名')
      equal(project.meta.minecraft, '1.20.1', '应写入 MC 版本')
      equal(project.meta.source, 'gradle.properties', '应记录信息来源')
    },
  },
  {
    name: 'Fabric 工程从 fabric.mod.json 判定',
    async run(ws) {
      const dir = await writeFabricProject(ws, ws.path('fab'), { modid: 'fabmod', name: 'Fab 模组', version: '2.0.0' })
      const project = await ws.call('project.import', { path: dir })

      equal(project.meta.loader, 'fabric', '应判定为 Fabric')
      equal(project.meta.modid, 'fabmod', 'modid 应正确')
      equal(project.meta.version, '2.0.0', '版本应正确')
    },
  },
  {
    name: '占位符用 gradle.properties 解析',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('ph'), {
        modid: 'phmod', version: '2.1.0',
        toml: [
          'modLoader="javafml"', 'loaderVersion="[47,)"', '[[mods]]',
          'modId="${mod_id}"', 'displayName="${mod_name}"', 'version="${mod_version}"',
        ].join('\n'),
      })
      const project = await ws.call('project.import', { path: dir })

      equal(project.meta.modid, 'phmod', '占位符应解析为真实 modid')
      equal(project.meta.version, '2.1.0', '占位符应解析为真实版本')
      equal(project.meta.name, '测试模组', '占位符应解析为真实名称')
    },
  },
  {
    name: '无法解析的占位符视为未提供',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('ph2'), {
        modid: 'ph2mod', version: '5.0.0',
        toml: [
          'modLoader="javafml"', 'loaderVersion="[47,)"', '[[mods]]',
          'modId="ph2mod"', 'displayName="测试模组"', 'version="${file.jarVersion}"',
        ].join('\n'),
      })
      const project = await ws.call('project.import', { path: dir })
      equal(project.meta.version, '5.0.0', '${file.jarVersion} 应回落到 gradle 值')
    },
  },
  {
    name: '真实值冲突时报错',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('conflict'), {
        modid: 'realmod', version: '1.0.0',
        toml: [
          'modLoader="javafml"', 'loaderVersion="[47,)"', '[[mods]]',
          'modId="othermod"', 'displayName="冲突"', 'version="9.9.9"',
        ].join('\n'),
      })
      await rejects(
        () => ws.call('project.import', { path: dir }),
        '冲突',
        'modid 与版本不一致应报冲突',
      )
    },
  },
  {
    name: '缺少必需字段时报错并说明缺什么',
    async run(ws) {
      const dir = ws.path('missing')
      await ws.write(`${dir}/gradle.properties`, 'mod_name=只有名字\nmod_version=1.0.0')
      await ws.write(`${dir}/build.gradle`, '// empty')

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      must(analysis.identityError.includes('modid'), '应说明缺少 modid')
      must(analysis.identityError.includes('加载器版本'), '应说明缺少加载器版本')
    },
  },
  {
    name: '资源按标准路径分类为物品与方块',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('res'), {
        modid: 'resmod', items: ['ruby', 'sapphire'], blocks: ['ruby_block'],
      })
      const project = await ws.call('project.import', { path: dir })
      const byId = Object.fromEntries(project.items.map((item) => [item.id, item]))

      equal(byId.ruby?.type, 'item', 'ruby 应为物品')
      equal(byId.sapphire?.type, 'item', 'sapphire 应为物品')
      equal(byId.ruby_block?.type, 'block', 'ruby_block 应为方块')
      equal(project.items.length, 3, '应创建 3 个条目')
    },
  },
  {
    name: '语言文件不作为条目导入',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('lang'), { modid: 'langmod', items: ['gem'], blocks: [] })
      await ws.write(`${dir}/src/main/resources/assets/langmod/lang/zh_cn.json`, '{}')
      await ws.write(`${dir}/src/main/resources/assets/langmod/lang/en_us.json`, '{}')

      const project = await ws.call('project.import', { path: dir })
      const ids = project.items.map((item) => item.id)
      must(!ids.includes('zh_cn'), 'zh_cn 不应成为条目')
      must(!ids.includes('en_us'), 'en_us 不应成为条目')
      must(ids.includes('gem'), '真实物品应被导入')
    },
  },
  {
    name: '其他命名空间只记录不导入',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('ns'), { modid: 'mymod', items: ['a'], blocks: [] })
      await ws.write(`${dir}/src/main/resources/assets/othermod/textures/item/noise.png`, 'png')

      const imported = await ws.call('project.import', { path: dir })
      const ids = imported.items.map((item) => item.id)
      must(!ids.includes('noise'), '其他命名空间的资源不应导入')
      must(imported.imported.assets.namespaces.includes('othermod'), '应记录检测到的命名空间')
    },
  },
  {
    name: 'Java 注册名被提取为条目',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('java'), { modid: 'javamod', items: [], blocks: [] })
      await ws.write(
        `${dir}/src/main/java/com/example/javamod/ModItems.java`,
        'public class ModItems { ITEMS.register("steel_ingot", () -> new Item()); }',
      )

      const project = await ws.call('project.import', { path: dir })
      const ids = project.items.map((item) => item.id)
      must(ids.includes('steel_ingot'), '应从 Java 源码提取注册名')
    },
  },
  {
    name: '导入后登记到项目列表',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('reg'), { modid: 'regimport' })
      await ws.call('project.import', { path: dir })

      const boot = await ws.call('boot', {})
      equal(boot.registry.projects.length, 1, '应登记 1 个项目')
      equal(boot.registry.projects[0].modid, 'regimport', 'modid 应正确')
    },
  },
  {
    name: '已在列表中的项目拒绝重复导入',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('dup'), { modid: 'dupimport' })
      await ws.call('project.import', { path: dir })
      await rejects(
        () => ws.call('project.import', { path: dir }),
        '已经是工坊项目',
        '重复导入应拒绝',
      )
    },
  },
  {
    name: '导入生成快照并包含元数据',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('snap'), {
        modid: 'snapmod', name: '快照模组', version: '4.0.0',
      })
      await ws.call('project.import', { path: dir })

      const { readFile } = await import('node:fs/promises')
      const snapshot = await readFile(`${dir}/docs/mcstudio-snapshot.md`, 'utf8')
      must(snapshot.includes('快照模组'), '快照应含项目名')
      must(snapshot.includes('snapmod'), '快照应含 modid')
      must(snapshot.includes('Tester'), '快照应含作者')
      must(snapshot.includes('MIT'), '快照应含许可证')
      must(snapshot.includes('blockstates/'), '快照应列方块状态路径')
    },
  },
]

process.exitCode = await runSuite('03 · 工程导入', cases)
