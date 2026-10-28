/**
 * 用例 15：代码结构文档。
 *
 * 验证确定性扫描（不调模型）：Java 解析、注册点定位、按哈希增量、
 * agent 注解写入与失效标记。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { equal, must, runSuite, writeNeoForgeProject } from './helpers.mjs'

/** 建一个带 Java 源码的工坊项目。 */
async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: modid, modid, loader: 'neoforge' })
  const javaRoot = join(dir, 'src', 'main', 'java', 'com', 'example')
  await mkdir(javaRoot, { recursive: true })
  return { dir, javaRoot }
}

/** 写一个 Java 文件。 */
async function putJava(javaRoot, name, content) {
  await writeFile(join(javaRoot, name), content)
}

const MAIN_CLASS = `package com.example;

import net.neoforged.bus.api.IEventBus;

/**
 * 模组主类。
 * 负责初始化注册表。
 */
public class ExampleMod {
    public static final String MODID = "examplemod";

    /**
     * 构造并完成注册。
     */
    public ExampleMod(IEventBus bus) {
        ModItems.register(bus);
    }
}
`

const ITEMS_CLASS = `package com.example;

import net.minecraft.world.item.Item;

/**
 * 物品注册表。
 */
public class ModItems {
    /** 物品注册表实例 */
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(Items.ITEMS, "examplemod");

    /** 红宝石 */
    public static final RegistryObject<Item> RUBY = ITEMS.register("ruby", () -> new Item(new Item.Properties()));

    public static void register(IEventBus bus) {
        ITEMS.register(bus);
    }
}
`

const cases = [
  {
    name: '扫描出类、方法与行号',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modaa')
      await putJava(javaRoot, 'ExampleMod.java', MAIN_CLASS)

      const result = await ws.call('structure.refresh', { path: dir })
      equal(result.totals.files, 1, '应扫到 1 个文件')
      equal(result.totals.classes, 1, '应扫到 1 个类')

      const full = (await ws.call('structure.get', { path: dir })).structure
      const cls = full.files[0].classes[0]
      equal(cls.name, 'ExampleMod', '类名应正确')
      equal(cls.kind, 'class', '类型应为 class')
      must(cls.line > 0, '应有起始行号')
      must(cls.endLine > cls.line, '结束行应大于起始行')
      equal(cls.javadoc, '模组主类。\n负责初始化注册表。', '应提取 Javadoc')
    },
  },
  {
    name: '识别注册点并可反查',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modbb')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)

      const result = await ws.call('structure.refresh', { path: dir })
      const items = result.registrations.items ?? []
      must(items.some((reg) => reg.id === 'ruby'), '应识别出 ruby 注册')

      const hit = await ws.call('structure.find', { path: dir, id: 'ruby' })
      must(hit.hits.length > 0, '按 id 应能查到位置')
      equal(hit.hits[0].kind, 'items', '应归为 items 类')
      equal(hit.hits[0].class, 'ModItems', '应记录所属类')
      must(hit.hits[0].line > 0, '应记录行号')
    },
  },
  {
    name: '跨行字段声明也能识别注册类别',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modmb')
      await putJava(javaRoot, 'ModRegistry.java', `package com.example;

public class ModRegistry {
    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(ForgeRegistries.ITEMS, "modmb");

    public static final DeferredRegister<Block> BLOCKS =
            DeferredRegister.create(ForgeRegistries.BLOCKS, "modmb");

    public static final RegistryObject<Item> RUBY =
            ITEMS.register("ruby", () -> new Item(new Item.Properties()));

    public static final RegistryObject<Block> RUBY_BLOCK =
            BLOCKS.register("ruby_block", () -> new Block(BlockBehaviour.Properties.of()));

    public static final RegistryObject<Item> CARDBOARD =
            ITEMS.register("material/cardboard", () -> new Item(new Item.Properties()));

    private static <T extends Block> RegistryObject<T> registerBlocks(String name, Supplier<T> block) {
        RegistryObject<T> registered = BLOCKS.register(name, block);
        return registered;
    }
}
`)

      const result = await ws.call('structure.refresh', { path: dir })
      const items = result.registrations.items ?? []
      const blocks = result.registrations.blocks ?? []
      must(items.some((reg) => reg.id === 'ruby'), '跨行 ITEMS 字段应把 ruby 归为 items')
      must(items.some((reg) => reg.id === 'material/cardboard'), '注册 id 应允许包含 /')
      must(blocks.some((reg) => reg.id === 'ruby_block'), '跨行 BLOCKS 字段应把 ruby_block 归为 blocks')

      const full = (await ws.call('structure.get', { path: dir })).structure
      const cls = full.files[0].classes[0]
      const field = cls.fields.find((entry) => entry.name === 'ITEMS')
      must(field, '跨行声明的 ITEMS 字段应被解析')
      equal(field.type, 'DeferredRegister<Item>', '字段类型应去掉修饰符')
      must(field.init.includes('DeferredRegister.create'), '应收集续行的初始化表达式')
      must(cls.methods.some((entry) => entry.signature.startsWith('registerBlocks(')), '泛型方法应被识别')
      must(!cls.fields.some((entry) => entry.name === 'registered'), '方法体局部变量不应算字段')
      must(!cls.fields.some((entry) => entry.type === 'return'), 'return 语句不应算字段')
    },
  },
  {
    name: 'structure_refresh 工具会同步 summary.json',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modmd')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('agent.call', { tool: 'structure_refresh', args: { project: dir } })

      const raw = JSON.parse(await readFile(join(dir, '.mcstudio', 'summary.json'), 'utf8'))
      must(raw.code, '工具刷新后 summary 应含代码摘要')
      equal(raw.code.files, 1, '应记录文件数')
      must(raw.code.registrations.items.some((reg) => reg.id === 'ruby'), '应含 items 注册点')
    },
  },
  {
    name: '字段与方法都被解析',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modcc')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('structure.refresh', { path: dir })

      const full = (await ws.call('structure.get', { path: dir })).structure
      const cls = full.files[0].classes[0]
      const field = cls.fields.find((f) => f.name === 'ITEMS')
      must(field, '应解析出 ITEMS 字段')
      equal(field.type, 'DeferredRegister<Item>', '字段类型应去掉修饰符')
      equal(field.javadoc, '物品注册表实例', '字段应带注释')

      const method = cls.methods.find((m) => m.name === 'register')
      must(method, '应解析出 register 方法')
      equal(method.returns, 'void', '返回类型应去掉修饰符')
    },
  },
  {
    name: '字符串与注释里的关键词不误判',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'moddd')
      await putJava(javaRoot, 'Trap.java', `package com.example;

/**
 * 注释里提到 class 和 register("fake") 不应被算进去。
 */
public class Trap {
    // ITEMS.register("also_fake", ...) 也在注释里
    private String text = "class Fake { } ITEMS.register(\\"string_fake\\", ...)";

    public void real() {
    }
}
`)
      const result = await ws.call('structure.refresh', { path: dir })
      const allIds = Object.values(result.registrations).flat().map((r) => r.id)
      must(!allIds.includes('fake'), '注释里的 register 不应被识别')
      must(!allIds.includes('also_fake'), '行注释里的不应被识别')
      must(!allIds.includes('string_fake'), '字符串里的不应被识别')

      const full = (await ws.call('structure.get', { path: dir })).structure
      const cls = full.files[0].classes[0]
      equal(cls.name, 'Trap', '只应有 Trap 一个类')
      equal(full.totals.classes, 1, '不应把字符串里的 class 计入')
    },
  },
  {
    name: '未改动文件复用且保留注解',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modee')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await putJava(javaRoot, 'ExampleMod.java', MAIN_CLASS)
      await ws.call('structure.refresh', { path: dir })

      const path = 'src/main/java/com/example/ModItems.java'
      await ws.call('structure.annotate', {
        path: dir,
        file: path,
        summary: '物品注册表',
        members: { ModItems: '物品注册表', 'ModItems#register': '注册全部物品' },
      })

      const second = await ws.call('structure.refresh', { path: dir })
      equal(second.incremental.reused, 2, '两个文件都未变，应全部复用')
      equal(second.incremental.rescanned, 0, '不应重新扫描')
      equal(second.totals.annotated, 1, '注解应保留')
    },
  },
  {
    name: '解析器版本变化时缓存失效',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modpg')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('structure.refresh', { path: dir })
      await ws.call('structure.annotate', {
        path: dir,
        file: 'src/main/java/com/example/ModItems.java',
        summary: '物品注册表',
      })

      const file = join(dir, '.mcstudio', 'structure.json')
      const doc = JSON.parse(await readFile(file, 'utf8'))
      doc.parserVersion = 1
      await writeFile(file, JSON.stringify(doc, null, 2))

      const again = await ws.call('structure.refresh', { path: dir })
      equal(again.incremental.rescanned, 1, '解析器版本不符时文件应重扫')
      equal(again.incremental.reused, 0, '不应复用旧解析结果')
      const after = JSON.parse(await readFile(file, 'utf8'))
      equal(after.parserVersion, 2, '文档应写入当前解析器版本')
      equal(after.files[0].annotation?.summary, '物品注册表', '重扫时应保留旧注解')
      equal(after.files[0].annotation?.stale, true, '重扫后旧注解应标记失效')
    },
  },
  {
    name: '改动文件重扫并标记注解失效',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modff')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('structure.refresh', { path: dir })

      const path = 'src/main/java/com/example/ModItems.java'
      await ws.call('structure.annotate', {
        path: dir,
        file: path,
        summary: '物品注册表',
        members: { ModItems: '物品注册表' },
      })

      // 改文件内容
      await putJava(javaRoot, 'ModItems.java', `${ITEMS_CLASS}\n// 追加一行\n`)
      const second = await ws.call('structure.refresh', { path: dir })

      equal(second.incremental.rescanned, 1, '改动文件应重扫')
      equal(second.totals.stale, 1, '旧注解应标记失效')
      equal(second.totals.annotated, 0, '失效注解不计入已注解')

      const full = (await ws.call('structure.get', { path: dir })).structure
      const file = full.files.find((f) => f.path === path)
      equal(file.annotation.stale, true, '文件条目应标记 stale')
      equal(file.annotation.summary, '物品注册表', '旧注解文本应保留供参考')
    },
  },
  {
    name: '删除的文件从文档移除',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modgg')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await putJava(javaRoot, 'ExampleMod.java', MAIN_CLASS)
      await ws.call('structure.refresh', { path: dir })

      const { rm } = await import('node:fs/promises')
      await rm(join(javaRoot, 'ExampleMod.java'))
      const second = await ws.call('structure.refresh', { path: dir })

      equal(second.totals.files, 1, '应只剩 1 个文件')
      equal(second.incremental.removed.length, 1, '应记录移除的文件')
    },
  },
  {
    name: 'compact 视图省去字段详情',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modhh')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('structure.refresh', { path: dir })

      const compact = (await ws.call('structure.get', { path: dir, compact: true })).structure
      const full = (await ws.call('structure.get', { path: dir })).structure

      must(!compact.files[0].classes[0].fields, 'compact 不应含字段')
      must(compact.files[0].classes[0].methods, 'compact 应保留方法位置')
      must(
        JSON.stringify(compact).length < JSON.stringify(full).length,
        'compact 应比完整版小',
      )
    },
  },
  {
    name: '注解写入后 mode 变为 annotated',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modii')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      const first = await ws.call('structure.refresh', { path: dir })
      equal(first.mode, 'scan', '初始应为 scan')

      await ws.call('structure.annotate', {
        path: dir,
        file: 'src/main/java/com/example/ModItems.java',
        summary: '物品注册表',
        members: { ModItems: '物品注册表' },
      })
      const second = await ws.call('structure.refresh', { path: dir })
      equal(second.mode, 'annotated', '有注解后应为 annotated')
    },
  },
  {
    name: 'summary.json 合并代码摘要',
    async run(ws) {
      const { dir, javaRoot } = await makeProject(ws, 'modjj')
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS)
      await ws.call('structure.refresh', { path: dir })
      await ws.call('items.save', { path: dir, item: { id: 'ruby', displayName: '红宝石', type: 'material' } })

      const summary = await ws.call('agent.summary', { path: dir })
      must(summary.code, 'summary 应含代码摘要')
      equal(summary.code.files, 1, '应记录文件数')
      must(summary.code.registrations.items.some((r) => r.id === 'ruby'), '应含注册点')
    },
  },
  {
    name: '导入流程自动生成结构文档',
    async run(ws) {
      // 必须用带 gradle.properties 的工程，否则身份判定失败
      const dir = await writeNeoForgeProject(ws, ws.path('modkk'), { modid: 'modkk' })
      const javaRoot = join(dir, 'src', 'main', 'java', 'com', 'example')
      await mkdir(javaRoot, { recursive: true })
      await putJava(javaRoot, 'ModItems.java', ITEMS_CLASS.replaceAll('examplemod', 'modkk'))

      const result = await ws.call('project.import', { path: dir })
      must(result.imported.structure, '导入应返回结构摘要')
      equal(result.imported.structure.files, 1, '应记录文件数')

      const full = (await ws.call('structure.get', { path: dir })).structure
      must(full.files.length === 1, '结构文档应已生成')
    },
  },
  {
    name: '无 Java 源码时生成空文档',
    async run(ws) {
      const dir = ws.path('modll')
      await ws.call('project.create', { path: dir, name: 'modll', modid: 'modll', loader: 'neoforge' })

      const result = await ws.call('structure.refresh', { path: dir })
      equal(result.totals.files, 0, '没有源码时文件数为 0')
      equal(result.mode, 'scan', '仍应是 scan 模式')
    },
  },
]

process.exitCode = await runSuite('15 · 代码结构文档', cases)
