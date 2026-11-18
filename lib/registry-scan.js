/**
 * 注册优先导入（v0.6.0 P5 / v0.6.1 P1）：从 Java 源码解析 DeferredRegister 注册名。
 *
 * 只做静态扫描（正则 + 文件上下文），覆盖常见注册写法；
 * 解析不出时由调用方回退资源扫描。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

const MAX_FILE_BYTES = 512 * 1024
const MAX_DEPTH = 12

/** 判断 DeferredRegister 的类型变量属于哪类内容。 */
function classifyType(type) {
  const text = String(type ?? '')
  if (/CreativeModeTab/.test(text)) return 'creativeTabs'
  if (/EntityType\b/.test(text)) return 'entities'
  if (/BlockEntityType/.test(text)) return 'blockEntities'
  if (/MobEffect/.test(text)) return 'effects'
  if (/Enchantment/.test(text)) return 'enchantments'
  if (/SoundEvent/.test(text)) return 'sounds'
  if (/ParticleType/.test(text)) return 'particles'
  if (/FluidType/.test(text)) return 'fluidTypes'
  if (/Fluid\b/.test(text)) return 'fluids'
  if (/Block\b/.test(text) && !/BlockItem/.test(text)) return 'blocks'
  if (/\bItem\b/.test(text)) return 'items'
  return ''
}

/** 不属于「物品/方块/创造栏」的注册类型：用于排除与清理候选。 */
export const FOREIGN_TYPES = [
  'entities', 'blockEntities', 'effects', 'enchantments',
  'sounds', 'particles', 'fluids', 'fluidTypes',
]

/**
 * 扫描项目源码中的注册项。
 * 返回 { blocks, items, creativeTabs, entities, others, warnings }。
 */
export async function scanRegistrations(projectPath) {
  const root = join(projectPath, 'src', 'main', 'java')
  const buckets = {
    blocks: new Set(),
    items: new Set(),
    creativeTabs: new Set(),
    entities: new Set(),
    blockEntities: new Set(),
    effects: new Set(),
    enchantments: new Set(),
    sounds: new Set(),
    particles: new Set(),
    fluids: new Set(),
    fluidTypes: new Set(),
  }
  const warnings = []

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
      if (!text.includes('DeferredRegister') && !text.includes('register(') && !text.includes('registerBlock')) continue
      // 跳过注释行，避免把示例代码当成真实注册
      const source = text
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
        .join('\n')

      // 变量名 → DeferredRegister 泛型（支持嵌套泛型：EntityType<X>）
      const types = new Map()
      for (const match of source.matchAll(/DeferredRegister\s*<([^;]+?)>\s+([A-Za-z0-9_]+)\s*=/g)) {
        types.set(match[2].trim(), match[1].trim())
      }
      for (const match of source.matchAll(/([A-Za-z0-9_]+)\.register\s*\(\s*"([a-z0-9_]+)"/g)) {
        const bucket = classifyType(types.get(match[1]) ?? '')
        if (bucket && buckets[bucket]) buckets[bucket].add(match[2])
      }
      // 辅助方法 registerBlock("id", ...)：方块 + 自动 BlockItem
      for (const match of source.matchAll(/registerBlock\s*\(\s*"([a-z0-9_]+)"/g)) {
        buckets.blocks.add(match[1])
      }
    }
  }

  const isDir = await fsp.stat(root).then((stat) => stat.isDirectory()).catch(() => false)
  if (!isDir) warnings.push('未找到 Java 源码目录，回退资源扫描')
  else await walk(root, 0)

  const sorted = (set) => [...set].sort()
  const others = {}
  for (const type of FOREIGN_TYPES) {
    const ids = sorted(buckets[type] ?? new Set())
    if (ids.length) others[type] = ids
  }

  return {
    blocks: sorted(buckets.blocks),
    items: sorted(buckets.items),
    creativeTabs: sorted(buckets.creativeTabs),
    entities: sorted(buckets.entities),
    others,
    warnings,
  }
}

/** 把注册结果里的「其他类型」展平成 id 集合，用于排除与清理。 */
export function foreignRegistrationIds(registrations) {
  const out = new Set()
  if (!registrations) return out
  for (const type of FOREIGN_TYPES) {
    for (const id of registrations.others?.[type] ?? []) out.add(id)
  }
  return out
}
