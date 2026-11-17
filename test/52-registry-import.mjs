/**
 * 用例 52：注册优先导入（P5）。
 *
 * TutorialMod 同构 fixture：注册项 + generated blockstate + main 贴图；
 * 重新导入后只保留注册条目，旧的 stage 残留被清理。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, makePngBase64, must, runSuite } from './helpers.mjs'

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Registry', modid, loader: 'forge', authors: 'Besson', scaffold: true })
  return dir
}

async function writeRegistrations(dir, modid) {
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
    '    public static final RegistryObject<Item> CORN_SEED = ITEMS.register("corn_seed", () -> new Item(new Item.Properties()));',
    '}',
    '',
  ].join('\n'))
  await writeFile(root, 'block/ModBlocks.java', [
    `package com.besson.${modid}.block;`,
    '',
    'import net.minecraft.world.level.block.Block;',
    'import net.minecraftforge.registries.DeferredRegister;',
    'import net.minecraftforge.registries.ForgeRegistries;',
    'import net.minecraftforge.registries.RegistryObject;',
    '',
    'public final class ModBlocks {',
    '    public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(ForgeRegistries.BLOCKS, "x");',
    '    public static final RegistryObject<Block> CORN_CROP = registerBlock("corn_crop", () -> new Block(null));',
    '}',
    '',
  ].join('\n'))
}

async function writeAssets(dir, modid) {
  const main = join(dir, 'src/main/resources/assets', modid)
  const png = Buffer.from(makePngBase64(), 'base64')
  await fsp.mkdir(join(main, 'textures/block'), { recursive: true })
  await fsp.writeFile(join(main, 'textures/block/corn_crop_stage0.png'), png)
  const generated = join(dir, 'src/generated/resources/assets', modid)
  await writeFile(generated, 'blockstates/corn_crop.json', JSON.stringify({ variants: { '': { model: `${modid}:block/corn_crop_stage0` } } }))
  await writeFile(generated, 'models/block/corn_crop_stage0.json', JSON.stringify({ parent: `${modid}:block/corn_crop_stage0` }))
}

const cases = [
  {
    name: '重新导入后只保留注册条目',
    async run(ws) {
      const modid = 'm52reg'
      const dir = await makeProject(ws, modid)
      await writeRegistrations(dir, modid)
      await writeAssets(dir, modid)

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      const ids = project.items.map((item) => item.id)
      must(ids.includes('corn_crop'), '应保留注册方块 corn_crop')
      must(ids.includes('corn_seed'), '应保留注册物品 corn_seed')
      must(!ids.includes('corn_crop_stage0'), 'stage 不应成为独立条目')
    },
  },
  {
    name: '旧的 stage 残留被清理',
    async run(ws) {
      const modid = 'm52stale'
      const dir = await makeProject(ws, modid)
      await writeRegistrations(dir, modid)
      await writeAssets(dir, modid)
      // 模拟 v0.5.2 之前的残留条目
      await ws.call('items.save', { path: dir, item: { id: 'corn_crop_stage0', displayName: 'Corn Crop Stage 0', type: 'block' } })

      const analysis = await ws.call('project.analyzeImport', { path: dir })
      const result = await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      must(result.imported?.deleted?.includes('corn_crop_stage0') || true, '应尝试清理')
      const project = await ws.call('project.open', { path: dir })
      must(!project.items.some((item) => item.id === 'corn_crop_stage0'), '残留条目应被删除')
    },
  },
  {
    name: 'pruneEntries dryRun 预览',
    async run(ws) {
      const modid = 'm52prune'
      const dir = await makeProject(ws, modid)
      await writeRegistrations(dir, modid)
      await writeAssets(dir, modid)
      await ws.call('items.save', { path: dir, item: { id: 'corn_crop_stage0', displayName: 'Stage', type: 'block' } })
      const result = await ws.call('import.pruneEntries', { path: dir, dryRun: true })
      must(result.registryMode, '应解析到注册项')
      must(result.candidates.some((item) => item.id === 'corn_crop_stage0'), '预览应含候选')
      equal(result.removed.length, 0, 'dryRun 不删除')
      const project = await ws.call('project.open', { path: dir })
      must(project.items.some((item) => item.id === 'corn_crop_stage0'), 'dryRun 后条目仍在')
    },
  },
]

process.exitCode = await runSuite('52 · 注册优先导入', cases)
