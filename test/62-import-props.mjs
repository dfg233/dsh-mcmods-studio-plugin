/**
 * 用例 62：导入写回物品属性（P2）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

async function makeProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Props', modid, loader: 'forge', authors: 'Besson', scaffold: true })
  const root = join(dir, 'src/main/java/com/besson', modid)
  await writeFile(root, 'item/ModItems.java', [
    `package com.besson.${modid}.item;`,
    '',
    'import net.minecraft.world.item.*;',
    'import net.minecraftforge.registries.*;',
    '',
    'public final class ModItems {',
    '    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, "x");',
    '    public static final RegistryObject<Item> PROSPECTOR = ITEMS.register("prospector", () -> new Item(new Item.Properties().durability(127)));',
    '    public static final RegistryObject<Item> SWORD = ITEMS.register("fire_sword", () -> new SwordItem(ModToolTiers.FIRE_ETHER, 2, 3, new Item.Properties()));',
    '}',
    '',
  ].join('\n'))
  return dir
}

const cases = [
  {
    name: '导入后条目带属性',
    async run(ws) {
      const dir = await makeProject(ws, 'm62props')
      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      const prospector = project.items.find((item) => item.id === 'prospector')
      const sword = project.items.find((item) => item.id === 'fire_sword')
      equal(prospector.properties.maxDamage, 127, '耐久写回')
      equal(sword.properties.attackDamage, 2, '伤害写回')
      equal(sword.properties.attackSpeed, 3, '速度写回')
    },
  },
  {
    name: '手改属性不被覆盖',
    async run(ws) {
      const dir = await makeProject(ws, 'm62keep')
      await ws.call('items.save', {
        path: dir,
        item: { id: 'prospector', displayName: 'Prospector', type: 'item', properties: { maxDamage: 999 } },
      })
      const analysis = await ws.call('project.analyzeImport', { path: dir })
      await ws.call('project.reimport', { path: dir, mode: 'merge', proof: analysis.proof })
      const project = await ws.call('project.open', { path: dir })
      const prospector = project.items.find((item) => item.id === 'prospector')
      equal(prospector.properties.maxDamage, 999, '手改值应保留')
    },
  },
]

process.exitCode = await runSuite('62 · 导入属性写回', cases)
