/**
 * 注册优先导入（v0.6.0 P5）：从 Java 源码解析 DeferredRegister 注册名。
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
  if (/CreativeModeTab/.test(type)) return 'creativeTabs'
  if (/BlockEntityType|EntityType|MobEffect|Enchantment|ParticleType|SoundEvent|RecipeSerializer|FluidType|Fluid\b/.test(type)) return ''
  if (/Block\b/.test(type) && !/BlockItem/.test(type)) return 'blocks'
  if (/\bItem\b/.test(type)) return 'items'
  return ''
}

/**
 * 扫描项目源码中的注册项。
 * 返回 { blocks, items, creativeTabs, warnings }。
 */
export async function scanRegistrations(projectPath) {
  const root = join(projectPath, 'src', 'main', 'java')
  const blocks = new Set()
  const items = new Set()
  const creativeTabs = new Set()
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

      // 变量名 → DeferredRegister 泛型
      const types = new Map()
      for (const match of source.matchAll(/DeferredRegister\s*<\s*([A-Za-z0-9_.]+)\s*>\s+([A-Za-z0-9_]+)/g)) {
        types.set(match[2], match[1])
      }
      for (const match of source.matchAll(/([A-Za-z0-9_]+)\.register\s*\(\s*"([a-z0-9_]+)"/g)) {
        const bucket = classifyType(types.get(match[1]) ?? '')
        if (bucket === 'blocks') blocks.add(match[2])
        else if (bucket === 'items') items.add(match[2])
        else if (bucket === 'creativeTabs') creativeTabs.add(match[2])
      }
      // 辅助方法 registerBlock("id", ...)：方块 + 自动 BlockItem
      for (const match of source.matchAll(/registerBlock\s*\(\s*"([a-z0-9_]+)"/g)) {
        blocks.add(match[1])
      }
    }
  }

  const isDir = await fsp.stat(root).then((stat) => stat.isDirectory()).catch(() => false)
  if (!isDir) warnings.push('未找到 Java 源码目录，回退资源扫描')
  else await walk(root, 0)

  return {
    blocks: [...blocks].sort(),
    items: [...items].sort(),
    creativeTabs: [...creativeTabs].sort(),
    warnings,
  }
}
