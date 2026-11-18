/**
 * 物品属性提取（v0.6.1 P2）：从注册表达式推断物品字段。
 *
 * 只处理明确模式（durability / SwordItem / PickaxeItem / ArmorItem / Tiers / food），
 * 解析不了不猜测；结果由导入层「只填空值」写入。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

const MAX_FILE_BYTES = 512 * 1024
const MAX_DEPTH = 12

/** 原版 Tiers 的采集等级映射。 */
const TIER_LEVELS = {
  WOOD: 0,
  STONE: 1,
  IRON: 2,
  DIAMOND: 3,
  NETHERITE: 4,
  GOLD: 0,
}

/** 护甲类型 → 护甲值。 */
const ARMOR_POINTS = {
  HELMET: 1,
  CHESTPLATE: 3,
  LEGGINGS: 2,
  BOOTS: 1,
  BODY: 3,
}

function registerBlocks(source) {
  // 提取每个 register("id", ...) 的完整表达式（括号平衡）
  const out = []
  const re = /([A-Za-z0-9_]+)\.register\s*\(\s*"([a-z0-9_]+)"\s*,/g
  let match
  while ((match = re.exec(source)) !== null) {
    const start = match.index + match[0].length
    let depth = 1
    let i = start
    for (; i < source.length && depth > 0; i += 1) {
      const ch = source[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
    }
    out.push({ id: match[2], body: source.slice(start, i - 1) })
  }
  return out
}

function readNumber(text) {
  const value = Number.parseFloat(text)
  return Number.isFinite(value) ? value : null
}

/** 单个物品的属性。 */
function parseItemBody(body) {
  const props = {}
  const durability = body.match(/durability\s*\(\s*(\d+)\s*\)/)
  if (durability) props.maxDamage = Number(durability[1])

  const sword = body.match(/new\s+SwordItem\s*\(\s*([A-Za-z0-9_.]+)\s*,\s*([-\d.]+)F?\s*,\s*([-\d.]+)F?/)
  if (sword) {
    props.toolTier = sword[1].split('.').pop()
    props.attackDamage = readNumber(sword[2])
    props.attackSpeed = readNumber(sword[3])
  }

  const tool = body.match(/new\s+(PickaxeItem|ShovelItem|AxeItem|HoeItem)\s*\(\s*([A-Za-z0-9_.]+)/)
  if (tool) {
    const tierName = tool[2].split('.').pop()
    props.toolTier = tierName
    if (Object.prototype.hasOwnProperty.call(TIER_LEVELS, tierName)) props.miningLevel = TIER_LEVELS[tierName]
  }

  const armor = body.match(/new\s+(?:ArmorItem|CustomArmorItem)\s*\(\s*[^,]+,\s*ArmorItem\.Type\.([A-Z_]+)/)
  if (armor) {
    const points = ARMOR_POINTS[armor[1]]
    if (points !== undefined) props.armor = points
  }

  const tierOnly = body.match(/(?:Tiers|ModToolTiers)\.([A-Z_]+)/)
  if (tierOnly && !props.toolTier) props.toolTier = tierOnly[1]

  const food = body.match(/food\s*\(\s*ModFoods\.([A-Za-z0-9_]+)\s*\)/)
  if (food) props.foodRef = food[1]

  // 物品类型（工具/武器/护甲/食物）与默认堆叠
  const construct = body.match(/new\s+([A-Za-z0-9_]+)\s*\(/)?.[1] ?? ''
  if (/SwordItem|TridentItem|BowItem|CrossbowItem/.test(construct)) props.itemType = 'weapon'
  else if (/PickaxeItem|ShovelItem|AxeItem|HoeItem|ShearsItem|FishingRodItem/.test(construct)) props.itemType = 'tool'
  else if (/ArmorItem|ElytraItem/.test(construct)) props.itemType = 'armor'
  else if (props.foodRef) props.itemType = 'food'
  else props.itemType = 'item'

  const stacksTo = body.match(/stacksTo\s*\(\s*(\d+)\s*\)/)
  if (stacksTo) props.maxStackSize = Number(stacksTo[1])
  else if (props.itemType === 'weapon' || props.itemType === 'tool' || props.itemType === 'armor') props.maxStackSize = 1

  return props
}

/** 解析 ModFoods 常量（nutrition / saturation）。 */
async function parseFoodConstants(javaRoot) {
  const out = {}
  async function walk(dir, depth) {
    if (depth > MAX_DEPTH) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      if (!entry.name.startsWith('ModFoods') || !entry.name.endsWith('.java')) continue
      const text = await fsp.readFile(full, 'utf8').catch(() => '')
      for (const match of text.matchAll(/([A-Z_]+)\s*=\s*new FoodProperties\.Builder\(\)([\s\S]*?)\.build\(\)/g)) {
        const body = match[2]
        const nutrition = body.match(/nutrition\s*\(\s*(\d+)\s*\)/)
        const saturation = body.match(/saturationMod\s*\(\s*([\d.]+)[fF]?\s*\)/)
        out[match[1]] = {
          ...(nutrition ? { foodNutrition: Number(nutrition[1]) } : {}),
          ...(saturation ? { foodSaturation: readNumber(saturation[1]) } : {}),
        }
      }
    }
  }
  await walk(javaRoot, 0)
  return out
}

/** 常量名 → 注册 id（`RegistryObject<Item> X = ITEMS.register("id", ...)`）。 */
async function parseConstIds(javaRoot) {
  const out = {}
  async function walk(dir, depth) {
    if (depth > MAX_DEPTH) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      if (!entry.name.endsWith('.java')) continue
      const text = await fsp.readFile(full, 'utf8').catch(() => '')
      for (const match of text.matchAll(/([A-Za-z0-9_]+)\s*=\s*[A-Za-z0-9_]+\.register\s*\(\s*"([a-z0-9_]+)"/g)) {
        out[match[1]] = match[2]
      }
    }
  }
  await walk(javaRoot, 0)
  return out
}

/** 解析创造栏成员：tab id → 物品 id 列表。 */
async function parseCreativeTabMembers(javaRoot, constToId = {}) {
  const byItem = {}
  async function walk(dir, depth) {
    if (depth > MAX_DEPTH) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      if (!entry.name.endsWith('.java')) continue
      const text = await fsp.readFile(full, 'utf8').catch(() => '')
      if (!/CreativeModeTab\.builder|output\.accept/.test(text)) continue
      const tab = text.match(/register\s*\(\s*"([a-z0-9_]+)"\s*,\s*\(\)\s*->\s*CreativeModeTab\.builder/)
      const tabId = tab ? tab[1] : ''
      for (const match of text.matchAll(/output\.accept\s*\(\s*([A-Za-z0-9_.]+)\s*\.get\s*\(\s*\)/g)) {
        const name = match[1].split('.').pop()
        const id = constToId[name] ?? name
        if (id && !byItem[id]) byItem[id] = tabId
      }
    }
  }
  await walk(javaRoot, 0)
  return byItem
}

/**
 * 提取物品属性。
 * 返回 { properties: { [id]: {...} }, warnings }。
 */
export async function extractItemProps(projectPath) {
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const properties = {}
  const warnings = []
  const isDir = await fsp.stat(javaRoot).then((stat) => stat.isDirectory()).catch(() => false)
  if (!isDir) return { properties, warnings: ['未找到 Java 源码目录'] }

  const foodConstants = await parseFoodConstants(javaRoot)
  const constToId = await parseConstIds(javaRoot)
  const tabMembers = await parseCreativeTabMembers(javaRoot, constToId)

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { await walk(full, depth + 1); continue }
      if (!entry.name.endsWith('.java')) continue
      const stat = await fsp.stat(full).catch(() => null)
      if (!stat || stat.size > MAX_FILE_BYTES) continue
      const text = await fsp.readFile(full, 'utf8').catch(() => '')
      if (!/\.register\s*\(/.test(text)) continue
      const source = text
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n')
      for (const { id, body } of registerBlocks(source)) {
        const parsed = parseItemBody(body)
        if (parsed.foodRef) {
          const food = foodConstants[parsed.foodRef]
          if (food) Object.assign(parsed, food)
          else warnings.push(`${id}：未能解析食物常量 ${parsed.foodRef}`)
          delete parsed.foodRef
        }
        if (tabMembers[id] !== undefined) parsed.creativeTab = tabMembers[id]
        if (Object.keys(parsed).length) properties[id] = parsed
      }
    }
  }
  await walk(javaRoot, 0)
  return { properties, warnings }
}
