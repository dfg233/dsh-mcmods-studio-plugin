/**
 * `gradle.properties` 解析。
 *
 * MDK 的模组信息以 gradle.properties 为单一数据源，再由 Gradle 内联进
 * `mods.toml` / `fabric.mod.json`，因此它比描述文件更完整、更权威。
 *
 * 支持的语法：
 *   key=value、key: value、# 与 ! 注释、反斜杠续行、
 *   \uXXXX 与 \t \n \r \\ 转义、行尾空白裁剪。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { isFile } from './registry.js'

/** 解析 Java properties 文本为普通对象。 */
export function parseProperties(text) {
  const out = {}
  const lines = String(text ?? '').split(/\r?\n/)
  let pending = ''

  for (let raw of lines) {
    let line = pending + raw
    pending = ''

    // 续行：行尾单个反斜杠
    if (/(^|[^\\])\\$/.test(line)) {
      pending = line.slice(0, -1)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue

    // 分隔符取第一个未被转义的 = 或 :
    let splitAt = -1
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '\\') { i += 1; continue }
      if (ch === '=' || ch === ':') { splitAt = i; break }
    }
    if (splitAt < 0) continue

    const key = unescape(line.slice(0, splitAt).trim())
    const value = unescape(line.slice(splitAt + 1).trim())
    if (key) out[key] = value
  }

  return out
}

/** 处理 properties 的转义序列。 */
function unescape(value) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\(.)/g, '$1')
}

/** 各加载器在 gradle.properties 中的键名差异。 */
const KEY_ALIASES = {
  modid: ['mod_id', 'modid', 'archives_base_name', 'archivesBaseName'],
  name: ['mod_name', 'modName'],
  version: ['mod_version', 'modVersion', 'version'],
  group: ['mod_group_id', 'maven_group', 'group'],
  license: ['mod_license', 'license'],
  authors: ['mod_authors', 'mod_authors_list', 'authors'],
  description: ['mod_description', 'description'],
  mcVersion: ['minecraft_version', 'minecraft_version_range', 'minecraftVersion'],
  mcVersionRange: ['minecraft_version_range'],
  neoVersion: ['neo_version', 'neo_version_range'],
  forgeVersion: ['forge_version', 'forge_version_range'],
  loaderVersion: ['loader_version', 'fabric_loader_version', 'fabric_version'],
  yarnMappings: ['yarn_mappings', 'mappings'],
}

/** 按别名表取第一个非空值。 */
function pick(props, aliasKey) {
  for (const key of KEY_ALIASES[aliasKey] ?? []) {
    const value = props[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * 从 gradle.properties 提取模组元数据。
 * 返回的 `missing` 列出必需项中缺失的键，供调用方决定是否抛异常。
 */
export function extractGradleMeta(props) {
  const mcRaw = pick(props, 'mcVersion')
  // minecraft_version 可能是精确版本，也可能是范围 [1.20.1,1.21)
  const mcExact = /^\d+\.\d+(\.\d+)?$/.test(mcRaw) ? mcRaw : ''
  const mcRange = pick(props, 'mcVersionRange') || (/^[\[(]/.test(mcRaw) ? mcRaw : '')

  const meta = {
    modid: pick(props, 'modid'),
    name: pick(props, 'name'),
    version: pick(props, 'version'),
    group: pick(props, 'group'),
    license: pick(props, 'license'),
    authors: pick(props, 'authors'),
    description: pick(props, 'description'),
    minecraft: mcExact || (mcRange ? '' : ''),
    minecraftRange: mcRange,
    neoVersion: pick(props, 'neoVersion'),
    forgeVersion: pick(props, 'forgeVersion'),
    loaderVersion: pick(props, 'loaderVersion'),
    yarnMappings: pick(props, 'yarnMappings'),
    raw: props,
  }

  meta.loader = detectLoaderFromGradle(meta, props)

  meta.missing = []
  if (!meta.modid) meta.missing.push('mod_id')
  if (!meta.minecraft && !meta.minecraftRange) meta.missing.push('minecraft_version')
  if (!meta.neoVersion && !meta.forgeVersion && !meta.loaderVersion) meta.missing.push('加载器版本（neo_version / forge_version / loader_version）')

  return meta
}

/** 依据 gradle.properties 判定加载器。 */
export function detectLoaderFromGradle(meta, props) {
  if (meta.loaderVersion || props.fabric_version || props.yarn_mappings) return 'fabric'
  if (meta.neoVersion) return 'neoforge'
  if (meta.forgeVersion) return 'forge'
  if (props.fabric_loader_version) return 'fabric'
  return ''
}

/** 读取并解析工程根下的 gradle.properties。 */
export async function readGradleProperties(projectPath) {
  const file = join(projectPath, 'gradle.properties')
  if (!(await isFile(file))) return { exists: false, file, props: {}, meta: null }
  const text = await fsp.readFile(file, 'utf8').catch(() => '')
  const props = parseProperties(text)
  return { exists: true, file, props, meta: extractGradleMeta(props) }
}

/** 把加载器版本整理成可读文本。 */
export function loaderVersionText(meta) {
  if (!meta) return ''
  if (meta.neoVersion) return `NeoForge ${meta.neoVersion}`
  if (meta.forgeVersion) return `Forge ${meta.forgeVersion}`
  if (meta.loaderVersion) return `Fabric Loader ${meta.loaderVersion}`
  return ''
}
