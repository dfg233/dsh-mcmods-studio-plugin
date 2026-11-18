/**
 * 用例 61：物品属性提取（P2）。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { extractItemProps } from '../lib/item-props.js'

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(join(file, '..'), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

async function makeSources(ws, modid) {
  const dir = ws.path(modid)
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
    '    public static final RegistryObject<Item> PICK = ITEMS.register("iron_pickaxe", () -> new PickaxeItem(Tiers.IRON, 1, 2, new Item.Properties()));',
    '    public static final RegistryObject<Item> HELMET = ITEMS.register("ice_helmet", () -> new ArmorItem(ModArmorMaterials.ICE_ETHER, ArmorItem.Type.HELMET, new Item.Properties()));',
    '    public static final RegistryObject<Item> CORN_SEED = ITEMS.register("corn_seed", () -> new Item(new Item.Properties().food(ModFoods.CORN)));',
    '}',
    '',
  ].join('\n'))
  await writeFile(root, 'item/ModFoods.java', [
    'public final class ModFoods {',
    '    public static final FoodProperties CORN = new FoodProperties.Builder().nutrition(6).saturationMod(0.6F).build();',
    '}',
    '',
  ].join('\n'))
  await writeFile(root, 'item/ModCreativeModeTabs.java', [
    'public final class ModCreativeModeTabs {',
    '    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, "x");',
    '    public static final RegistryObject<CreativeModeTab> MAIN = TABS.register("main", () -> CreativeModeTab.builder()',
    '        .icon(() -> new ItemStack(Items.STONE))',
    '        .displayItems((parameters, output) -> {',
    '            output.accept(ModItems.CORN_SEED.get());',
    '        }).build());',
    '}',
    '',
  ].join('\n'))
  return dir
}

const cases = [
  {
    name: '提取耐久、剑、镐、护甲',
    async run(ws) {
      const dir = await makeSources(ws, 'm61props')
      const { properties } = await extractItemProps(dir)
      equal(properties.prospector.maxDamage, 127, '耐久')
      equal(properties.fire_sword.attackDamage, 2, '剑伤害')
      equal(properties.fire_sword.attackSpeed, 3, '剑速度')
      equal(properties.fire_sword.toolTier, 'FIRE_ETHER', '剑工具等级')
      equal(properties.iron_pickaxe.toolTier, 'IRON', '镐工具等级')
      equal(properties.iron_pickaxe.miningLevel, 2, '镐采集等级')
      equal(properties.ice_helmet.armor, 1, '头盔护甲')
      equal(properties.fire_sword.itemType, 'weapon', '剑应归为武器')
      equal(properties.fire_sword.maxStackSize, 1, '武器不可堆叠')
      equal(properties.iron_pickaxe.itemType, 'tool', '镐应归为工具')
      equal(properties.ice_helmet.itemType, 'armor', '头盔应归为护甲')
      equal(properties.ice_helmet.maxStackSize, 1, '护甲不可堆叠')
    },
  },
  {
    name: '提取食物与创造栏分类',
    async run(ws) {
      const dir = await makeSources(ws, 'm61food')
      const { properties } = await extractItemProps(dir)
      equal(properties.corn_seed.foodNutrition, 6, '食物恢复值')
      equal(properties.corn_seed.foodSaturation, 0.6, '食物饱和度')
      equal(properties.corn_seed.creativeTab, 'main', '创造栏分类')
    },
  },
]

process.exitCode = await runSuite('61 · 物品属性提取', cases)
