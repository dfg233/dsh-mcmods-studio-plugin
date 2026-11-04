/**
 * 用例 21：API 索引（javap 解析、过滤、zip 目录、缓存查询、预算）。
 */

import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import {
  apiCacheDir,
  apiContext,
  apiGet,
  apiSearch,
  apiStatus,
  filterClassName,
  listZipEntries,
  normalizeClassName,
  parseJavapOutput,
} from '../lib/api-index.js'
import { writeJson } from '../lib/registry.js'

const JAVAP_FIXTURE = `Compiled from "Item.java"
public class net.minecraft.world.item.Item {
  protected final net.minecraft.world.item.Item$Properties properties;
    descriptor: Lnet/minecraft/world/item/Item$Properties;
  public net.minecraft.world.item.Item(net.minecraft.world.item.Item$Properties);
    descriptor: (Lnet/minecraft/world/item/Item$Properties;)V
  public int getMaxStackSize();
    descriptor: ()I
  protected void saveAdditional(net.minecraft.nbt.CompoundTag);
    descriptor: (Lnet/minecraft/nbt/CompoundTag;)V
  public <T> T getSomething(java.lang.String);
    descriptor: (Ljava/lang/String;)Ljava/lang/Object;
}
public interface net.minecraft.world.level.ItemLike {
  public abstract net.minecraft.world.item.Item asItem();
    descriptor: ()Lnet/minecraft/world/item/Item;
}
`

/** 构造一个只含中央目录的最小 zip（不写入实际内容）。 */
function makeZip(names) {
  const localChunks = []
  const centralChunks = []
  let offset = 0
  for (const name of names) {
    const nameBuffer = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(0, 18)
    local.writeUInt32LE(0, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)
    localChunks.push(local, nameBuffer)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(0, 20)
    central.writeUInt32LE(0, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralChunks.push(central, nameBuffer)
    offset += local.length + nameBuffer.length
  }
  const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(names.length, 8)
  eocd.writeUInt16LE(names.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localChunks, ...centralChunks, eocd])
}

/** 写入一份 fixture 索引，返回当前索引目录。 */
async function writeFixtureIndex(projectPath) {
  const root = apiCacheDir(projectPath)
  const hash = 'fixturehash'
  const dir = join(root, hash)
  await writeJson(join(root, 'current.json'), { classpathHash: hash })
  await writeJson(join(dir, 'meta.json'), {
    classpathHash: hash,
    source: 'fixture',
    javap: true,
    jars: [],
    stats: { jars: 0, classes: 3 },
    generatedAt: '',
  })
  const classes = {
    'net.minecraft.world.item.Item': { kind: 'class', shard: 'net.minecraft.world.item' },
    'net.minecraft.world.item.Item$Properties': { kind: 'class', shard: 'net.minecraft.world.item' },
    'net.minecraft.world.level.ItemLike': { kind: 'interface', shard: 'net.minecraft.world.level' },
    'test.Child': { kind: 'class', shard: 'test' },
    'test.Parent': { kind: 'class', shard: 'test' },
  }
  await writeJson(join(dir, 'index.json'), { schemaVersion: 1, classes })
  await writeJson(join(dir, 'classes', 'net.minecraft.world.item.json'), [
    {
      name: 'net.minecraft.world.item.Item',
      kind: 'class',
      modifiers: ['public'],
      extends: 'java.lang.Object',
      implements: [],
      methods: [{ name: 'getMaxStackSize', params: [], returns: 'int', modifiers: ['public'] }],
      fields: [{ name: 'properties', type: 'Item$Properties', modifiers: ['protected'] }],
    },
    {
      name: 'net.minecraft.world.item.Item$Properties',
      kind: 'class',
      modifiers: ['public'],
      extends: '',
      implements: [],
      methods: [{ name: 'stacksTo', params: ['int'], returns: 'Item$Properties', modifiers: ['public'] }],
      fields: [],
    },
  ])
  await writeJson(join(dir, 'classes', 'net.minecraft.world.level.json'), [
    {
      name: 'net.minecraft.world.level.ItemLike',
      kind: 'interface',
      modifiers: ['public'],
      extends: '',
      implements: [],
      methods: [{ name: 'asItem', params: [], returns: 'Item', modifiers: ['public', 'abstract'] }],
      fields: [],
    },
  ])
  await writeJson(join(dir, 'classes', 'test.json'), [
    {
      name: 'test.Parent',
      kind: 'class',
      modifiers: ['public'],
      extends: '',
      implements: [],
      methods: [{ name: 'parentMethod', params: [], returns: 'void', modifiers: ['public'] }],
      fields: [{ name: 'parentField', type: 'int', modifiers: ['protected'] }],
    },
    {
      name: 'test.Child',
      kind: 'class',
      modifiers: ['public'],
      extends: 'test.Parent',
      implements: [],
      methods: [{ name: 'childMethod', params: [], returns: 'void', modifiers: ['public'] }],
      fields: [],
    },
  ])
  return dir
}

const cases = [
  {
    name: '解析 javap 签名（类、构造、protected、泛型、接口）',
    async run(ws) {
      const classes = parseJavapOutput(JAVAP_FIXTURE)
      equal(classes.length, 2, '应解析出两个类')
      const item = classes.find((entry) => entry.name === 'net.minecraft.world.item.Item')
      must(item, '应包含 Item')
      equal(item.kind, 'class', 'Item 应为 class')
      equal(item.fields[0].name, 'properties', '应解析 protected 字段')
      equal(item.fields[0].modifiers.includes('protected'), true, '字段应保留 protected')
      const ctor = item.methods.find((method) => method.constructor)
      must(ctor, '应识别构造方法')
      const save = item.methods.find((method) => method.name === 'saveAdditional')
      equal(save.modifiers.includes('protected'), true, '方法应保留 protected')
      const generic = item.methods.find((method) => method.name === 'getSomething')
      must(generic, '应解析泛型方法')
      const itemLike = classes.find((entry) => entry.name === 'net.minecraft.world.level.ItemLike')
      equal(itemLike.kind, 'interface', '应识别接口')
      equal(itemLike.methods[0].name, 'asItem', '接口方法应解析')
      equal(normalizeClassName('Item$Properties'), 'Item$Properties', '类名应保持原样')
    },
  },
  {
    name: '过滤类名：白名单与排除规则',
    async run() {
      equal(filterClassName('net.minecraft.world.item.Item'), true, 'MC 类应保留')
      equal(filterClassName('net.neoforged.neoforge.event.Event'), true, 'NeoForge 类应保留')
      equal(filterClassName('net.minecraftforge.common.MinecraftForge'), true, 'Forge 类应保留')
      equal(filterClassName('net.minecraft.world.item.Item.impl.Internal'), false, 'impl 应排除')
      equal(filterClassName('net.minecraft.mixin.MixinThing'), false, 'mixin 应排除')
      equal(filterClassName('com.example.demo.Item'), false, '第三方包应排除')
      equal(filterClassName('NoPackage'), false, '无包名应排除')
    },
  },
  {
    name: '读取 zip 中央目录',
    async run() {
      const buffer = makeZip(['META-INF/MANIFEST.MF', 'net/minecraft/world/item/Item.class'])
      const names = listZipEntries(buffer)
      equal(names.length, 2, '应读到两个条目')
      must(names.includes('net/minecraft/world/item/Item.class'), '应包含类文件')
      equal(listZipEntries(Buffer.from('not-a-zip')).length, 0, '非 zip 返回空数组')
    },
  },
  {
    name: '无索引时状态为不可用',
    async run(ws) {
      const dir = ws.path('api-none')
      await ws.call('project.create', { path: dir, name: '无索引', modid: 'noindex', loader: 'forge' })
      const status = await apiStatus(dir)
      equal(status.available, false, '无索引应不可用')
      equal(status.reason, 'no-index', '应给出原因')
    },
  },
  {
    name: '搜索与读取类签名',
    async run(ws) {
      const dir = ws.path('api-fixture')
      await ws.call('project.create', { path: dir, name: '索引', modid: 'apimod', loader: 'forge' })
      await writeFixtureIndex(dir)

      const search = await apiSearch(dir, { query: 'Item' })
      equal(search.available, true, '索引应可用')
      must(search.results.some((entry) => entry.name === 'net.minecraft.world.item.Item'), '应搜到 Item')

      const get = await apiGet(dir, 'net.minecraft.world.item.Item')
      equal(get.found, true, '应找到 Item')
      equal(get.class.methods[0].name, 'getMaxStackSize', '应返回方法签名')
      must(get.class.fields.some((field) => field.name === 'properties'), '应返回字段')

      const inner = await apiGet(dir, 'net.minecraft.world.item.Item$Properties')
      equal(inner.found, true, '应支持嵌套类 $ 写法')
    },
  },
  {
    name: '查询时合并继承方法',
    async run(ws) {
      const dir = ws.path('api-inherit')
      await ws.call('project.create', { path: dir, name: '继承', modid: 'inheritmod', loader: 'forge' })
      await writeFixtureIndex(dir)

      const child = await apiGet(dir, 'test.Child')
      equal(child.found, true, '应找到子类')
      must(child.class.methods.some((method) => method.name === 'childMethod'), '应包含自身方法')
      const inherited = child.class.methods.find((method) => method.name === 'parentMethod')
      must(inherited, '应合并父类方法')
      equal(inherited.inheritedFrom, 'test.Parent', '应标注继承来源')
      must(child.class.fields.some((field) => field.name === 'parentField'), '应合并父类字段')

      const raw = await apiGet(dir, 'test.Child', { includeInherited: false })
      must(!raw.class.methods.some((method) => method.name === 'parentMethod'), '可关闭继承合并')
    },
  },
  {
    name: 'API 上下文预算与缺失引用',
    async run(ws) {
      const dir = ws.path('api-context')
      await ws.call('project.create', { path: dir, name: '上下文', modid: 'apictx', loader: 'forge' })
      await writeFixtureIndex(dir)

      const result = await apiContext(dir, [
        'net.minecraft.world.item.Item',
        'net.minecraft.world.item.Item$Properties',
        'test.Missing',
      ], { apiClasses: 20, apiBytes: 4096 })
      equal(result.available, true, '索引应可用')
      equal(result.classes.length, 2, '应返回两个存在的类')
      must(result.truncated.some((item) => item.ref === 'test.Missing' && item.reason === 'not-found'), '应记录缺失引用')

      const small = await apiContext(dir, ['net.minecraft.world.item.Item'], { apiClasses: 1, apiBytes: 4096 })
      equal(small.classes.length, 1, '预算内应返回 1 类')
    },
  },
]

process.exitCode = await runSuite('21 · API 索引', cases)
