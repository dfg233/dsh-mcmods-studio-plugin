/**
 * 用例 60：注册类型识别（P1）。
 *
 * 嵌套泛型与实体/其他注册类型：不再被当成物品，且旧残留可清理。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { scanRegistrations, foreignRegistrationIds } from '../lib/registry-scan.js'

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Types', modid, loader: 'forge', authors: 'Besson', scaffold: true })
  return dir
}

async function writeSources(dir, modid) {
  const root = join(dir, 'src/main/java/com/besson', modid)
  await writeFile(root, 'item/ModItems.java', [
    `package com.besson.${modid}.item;`,
    '',
    'import net.minecraft.world.item.Item;',
    'import net.minecraftforge.registries.DeferredRegister;',
    'import net.minecraftforge.registries.ForgeRegistries;',
    'import net.minecraftforge.registries.RegistryObject;',
    '',
    'public final class ModItems {',
    '    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, "x");',
    '    public static final RegistryObject<Item> RUBY = ITEMS.register("ruby", () -> new Item(new Item.Properties()));',
    '}',
    '',
  ].join('\n'))
  await writeFile(root, 'entity/ModEntities.java', [
    `package com.besson.${modid}.entity;`,
    '',
    'import net.minecraft.world.entity.EntityType;',
    'import net.minecraftforge.registries.DeferredRegister;',
    'import net.minecraftforge.registries.ForgeRegistries;',
    'import net.minecraftforge.registries.RegistryObject;',
    '',
    'public final class ModEntities {',
    '    public static final DeferredRegister<EntityType<ModBoatEntity>> ENTITY_TYPES = DeferredRegister.create(ForgeRegistries.ENTITY_TYPES, "x");',
    '    public static final RegistryObject<EntityType<ModBoatEntity>> MOD_BOAT = ENTITY_TYPES.register("mod_boat", () -> build());',
    '}',
    '',
  ].join('\n'))
}

const cases = [
  {
    name: '嵌套泛型实体注册被归类',
    async run(ws) {
      const modid = 'm60scan'
      const dir = await makeProject(ws, modid)
      await writeSources(dir, modid)
      const result = await scanRegistrations(dir)
      must(result.entities.includes('mod_boat'), 'entities 应含 mod_boat')
      must(!result.items.includes('mod_boat'), 'items 不应含 mod_boat')
      must(result.items.includes('ruby'), 'items 应含 ruby')
      equal(foreignRegistrationIds(result).has('mod_boat'), true, 'foreign id 应含 mod_boat')
    },
  },
  {
    name: '导入后 mod_boat 不是物品',
    async run(ws) {
      const modid = 'm60import'
      const dir = await makeProject(ws, modid)
      await writeSources(dir, modid)
      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      const ids = project.items.map((item) => item.id)
      must(ids.includes('ruby'), '应保留物品 ruby')
      must(!ids.includes('mod_boat'), 'mod_boat 不应成为物品')
    },
  },
  {
    name: '旧 mod_boat 残留被清理',
    async run(ws) {
      const modid = 'm60stale'
      const dir = await makeProject(ws, modid)
      await writeSources(dir, modid)
      await ws.call('items.save', { path: dir, item: { id: 'mod_boat', displayName: 'Mod Boat', type: 'item' } })
      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      must(!project.items.some((item) => item.id === 'mod_boat'), '残留应被清理')
    },
  },
  {
    name: 'pruneEntries 覆盖实体残留',
    async run(ws) {
      const modid = 'm60prune'
      const dir = await makeProject(ws, modid)
      await writeSources(dir, modid)
      await ws.call('items.save', { path: dir, item: { id: 'mod_boat', displayName: 'Mod Boat', type: 'item' } })
      const result = await ws.call('import.pruneEntries', { path: dir, dryRun: true })
      must(result.candidates.some((item) => item.id === 'mod_boat'), '候选应含 mod_boat')
    },
  },
]

process.exitCode = await runSuite('60 · 注册类型识别', cases)
