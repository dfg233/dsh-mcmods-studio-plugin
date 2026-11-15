/**
 * MDK 模式：识别官方 MDK（zip / 已解压目录）、安全解压、受控变量替换与校验。
 *
 * 设计见 docs/fix/V0.4.2-PLAN.md：
 *   - 只做「识别 + 已知 key 替换」，不解析/改写 Gradle 脚本逻辑；
 *   - 解压前校验路径穿越、符号链接、大小与条目上限；
 *   - 生成后校验必需文件与关键字段，失败删除本次产物。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { createHash } from 'node:crypto'

import { readProjectMeta } from './meta.js'
import { inferParams } from './scaffold.js'
import { listMatrix, resolveMatrix, SUPPORTED_MC } from './version-matrix.js'

const MAX_ZIP_BYTES = 256 * 1024 * 1024
const MAX_ENTRIES = 20000
const MAX_FILE_BYTES = 64 * 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'build', '.gradle', 'run', 'run-data', '.idea', 'out', 'node_modules'])

function parseProperties(text) {
  const result = {}
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    result[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
  }
  return result
}

function unsafePath(name) {
  const normalized = String(name ?? '').replace(/\\/g, '/')
  if (!normalized || normalized.endsWith('/')) return null
  if (normalized.startsWith('/')) return '绝对路径'
  if (/^[A-Za-z]:/.test(normalized)) return '盘符路径'
  if (normalized.startsWith('//')) return 'UNC 路径'
  if (normalized.split('/').includes('..')) return '包含 ..'
  return null
}

async function walkFiles(root, rel = '', out = []) {
  const dir = rel ? join(root, rel) : root
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.gradle') continue
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) await walkFiles(root, childRel, out)
    else if (entry.isFile()) out.push(childRel)
  }
  return out
}

/* ── zip 读取（最小实现，仅 store / deflate） ───────────────── */

function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557)
  for (let index = buf.length - 22; index >= min; index -= 1) {
    if (buf.readUInt32LE(index) === 0x06054b50) return index
  }
  return -1
}

async function readZipIndex(filePath) {
  const stat = await fsp.stat(filePath).catch(() => null)
  if (!stat || !stat.isFile()) throw new Error('MDK 文件不存在')
  if (stat.size > MAX_ZIP_BYTES) throw new Error(`MDK zip 超过大小上限（${MAX_ZIP_BYTES / 1024 / 1024}MB）`)
  const buf = await fsp.readFile(filePath)
  const eocd = findEocd(buf)
  if (eocd < 0) throw new Error('不是有效的 zip（找不到 EOCD）')
  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new Error(`zip 条目数超过上限（${MAX_ENTRIES}）`)
  if (cdOffset <= 0 || cdOffset >= buf.length) throw new Error('zip 中央目录偏移无效')

  const entries = []
  let pos = cdOffset
  let total = 0
  for (let index = 0; index < count; index += 1) {
    if (pos + 46 > buf.length) throw new Error('zip 中央目录损坏')
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('zip 中央目录损坏')
    const method = buf.readUInt16LE(pos + 10)
    const compressed = buf.readUInt32LE(pos + 20)
    const uncompressed = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const externalAttr = buf.readUInt32LE(pos + 38)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8')
    const isSymlink = ((externalAttr >>> 16) & 0xf000) === 0xa000
    total += uncompressed
    if (total > MAX_ZIP_BYTES) throw new Error('zip 解压后总大小超过上限')
    entries.push({ name, method, compressed, uncompressed, localOffset, isSymlink })
    pos += 46 + nameLen + extraLen + commentLen
  }
  return { buf, entries }
}

function readEntryData(zip, entry) {
  const pos = entry.localOffset
  if (pos + 30 > zip.buf.length || zip.buf.readUInt32LE(pos) !== 0x04034b50) {
    throw new Error(`zip 本地头损坏：${entry.name}`)
  }
  const nameLen = zip.buf.readUInt16LE(pos + 26)
  const extraLen = zip.buf.readUInt16LE(pos + 28)
  const start = pos + 30 + nameLen + extraLen
  const data = zip.buf.subarray(start, start + entry.compressed)
  if (entry.method === 0) return data
  if (entry.method === 8) return inflateRawSync(data)
  throw new Error(`不支持的 zip 压缩方法：${entry.method}（${entry.name}）`)
}

/* ── 识别 ─────────────────────────────────────────────────── */

async function identifyFromReader(files, read) {
  const set = new Set(files)
  const properties = parseProperties(await read('gradle.properties'))
  const build = await read('build.gradle')
  const warnings = []
  const errors = []
  let kind = ''
  let minecraft = ''
  let loaderVersion = ''

  if (set.has('src/main/resources/fabric.mod.json')) {
    kind = 'fabric'
    try {
      const mod = JSON.parse(await read('src/main/resources/fabric.mod.json'))
      minecraft = mod?.depends?.minecraft ?? ''
      loaderVersion = properties.loader_version ?? ''
    } catch {
      errors.push('fabric.mod.json 不是有效 JSON')
    }
  } else if (properties.neo_version || /net\.neoforged\.gradle/.test(build)) {
    kind = 'neoforge'
    loaderVersion = properties.neo_version ?? ''
  } else if (properties.forge_version || /net\.minecraftforge\.gradle|forgegradle/i.test(build)) {
    kind = 'forge'
    loaderVersion = properties.forge_version ?? ''
  }

  if (!kind) {
    errors.push('无法识别加载器（缺少 fabric.mod.json / forge_version / neo_version）')
    return { kind, minecraft, loaderVersion, warnings, errors, files }
  }
  if (!minecraft) minecraft = properties.minecraft_version ?? SUPPORTED_MC

  const matrix = resolveMatrix(kind, minecraft)
  if (!matrix) {
    errors.push(`版本不在矩阵内：${kind} / ${minecraft}；可用：${listMatrix().map((item) => `${item.loader}/${item.minecraft}`).join(', ')}`)
  } else if (loaderVersion && matrix.loaderVersion && loaderVersion !== matrix.loaderVersion) {
    warnings.push(`MDK 的加载器版本 ${loaderVersion} 与矩阵推荐 ${matrix.loaderVersion} 不同（仍可构建）`)
  }
  if (!set.has('build.gradle') || !set.has('settings.gradle')) warnings.push('缺少 build.gradle 或 settings.gradle')
  if (!set.has('gradle.properties')) warnings.push('缺少 gradle.properties')
  if (!set.has('gradlew') && !set.has('gradlew.bat')) warnings.push('缺少 gradlew / gradlew.bat')

  return { kind, minecraft, loaderVersion, warnings, errors, files }
}

/** 检查本地 MDK（zip 或已解压目录）并识别 loader / MC。 */
export async function inspectMdk(sourcePath) {
  const stat = await fsp.stat(sourcePath).catch(() => null)
  if (!stat) throw new Error(`MDK 路径不存在：${sourcePath}`)
  if (stat.isDirectory()) {
    const files = await walkFiles(sourcePath)
    const read = (rel) => fsp.readFile(join(sourcePath, rel), 'utf8').catch(() => '')
    return identifyFromReader(files, read)
  }
  const zip = await readZipIndex(sourcePath)
  const files = zip.entries.filter((entry) => !entry.name.endsWith('/')).map((entry) => entry.name)
  const read = (rel) => {
    const entry = zip.entries.find((item) => item.name === rel)
    return entry ? Promise.resolve(readEntryData(zip, entry).toString('utf8')) : Promise.resolve('')
  }
  return identifyFromReader(files, read)
}

/* ── 解压 / 复制 ───────────────────────────────────────────── */

export async function extractZip(zipPath, targetDir) {
  const zip = await readZipIndex(zipPath)
  const root = resolve(targetDir)
  const created = []
  for (const entry of zip.entries) {
    if (entry.name.endsWith('/')) continue
    if (entry.isSymlink) throw new Error(`zip 含符号链接：${entry.name}`)
    const bad = unsafePath(entry.name)
    if (bad) throw new Error(`zip 路径不安全（${bad}）：${entry.name}`)
    if (entry.uncompressed > MAX_FILE_BYTES) throw new Error(`zip 单文件过大：${entry.name}`)
    const target = resolve(root, entry.name.replace(/\\/g, '/'))
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`zip 路径越界：${entry.name}`)
    await fsp.mkdir(dirname(target), { recursive: true })
    await fsp.writeFile(target, readEntryData(zip, entry))
    created.push(entry.name.replace(/\\/g, '/'))
  }
  return created
}

export async function copyDirectory(sourceDir, targetDir) {
  const source = resolve(sourceDir)
  const target = resolve(targetDir)
  const created = []
  async function walk(rel) {
    const dir = rel ? join(source, rel) : source
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.gradle' || entry.name === 'build') continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const sourcePath = join(source, childRel)
      if (entry.isDirectory()) {
        await walk(childRel)
        continue
      }
      if (!entry.isFile()) continue
      const targetPath = join(target, childRel)
      await fsp.mkdir(dirname(targetPath), { recursive: true })
      await fsp.copyFile(sourcePath, targetPath)
      created.push(childRel)
    }
  }
  await walk('')
  return created
}

/* ── 受控替换 ─────────────────────────────────────────────── */

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function replaceProperties(filePath, updates) {
  const text = await fsp.readFile(filePath, 'utf8').catch(() => null)
  if (text === null) return []
  const lines = text.split(/\r?\n/)
  const seen = new Set()
  const next = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*=\s*(.*)$/)
    if (!match) return line
    const key = match[2]
    if (!(key in updates)) return line
    seen.add(key)
    return `${match[1]}${key}=${updates[key]}`
  })
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`)
  }
  await fsp.writeFile(filePath, next.join('\n'), 'utf8')
  return Object.keys(updates)
}

async function replaceModsToml(filePath, params) {
  const text = await fsp.readFile(filePath, 'utf8').catch(() => null)
  if (text === null) return []
  const changes = []
  let next = text.split('examplemod').join(params.modid)
  const rules = [
    [/^(\s*)modId\s*=\s*"([^"]*)"/m, `modId="${params.modid}"`, 'modId'],
    [/^(\s*)displayName\s*=\s*"([^"]*)"/m, `displayName="${params.gradleName}"`, 'displayName'],
    [/^(\s*)version\s*=\s*"([^"]*)"/m, `version="${params.version}"`, 'version'],
    [/^(\s*)authors\s*=\s*"([^"]*)"/m, `authors="${params.gradleAuthors}"`, 'authors'],
    [/^(\s*)license\s*=\s*"([^"]*)"/m, `license="${params.gradleLicense}"`, 'license'],
    [/^(\s*)description\s*=\s*'''([\s\S]*?)'''/m, `description='''${params.gradleDescription}'''`, 'description'],
  ]
  for (const [pattern, replacement, label] of rules) {
    const match = next.match(pattern)
    if (!match) continue
    if (match[0].includes('${')) continue // Gradle 展开的占位符交给 processResources
    const updated = match[0].replace(/^(\s*)[\s\S]*$/, `$1${replacement}`)
    if (updated !== match[0]) {
      next = next.replace(match[0], updated)
      changes.push(label)
    }
  }
  if (next !== text) await fsp.writeFile(filePath, next, 'utf8')
  return changes
}

async function replaceFabricJson(filePath, params) {
  const text = await fsp.readFile(filePath, 'utf8').catch(() => null)
  if (text === null) return []
  let mod
  try { mod = JSON.parse(text) } catch { throw new Error('fabric.mod.json 不是有效 JSON') }
  mod.id = params.modid
  mod.name = params.gradleName
  mod.version = params.version
  mod.description = params.gradleDescription
  mod.authors = params.gradleAuthors ? [params.gradleAuthors] : []
  mod.license = params.gradleLicense
  await fsp.writeFile(filePath, `${JSON.stringify(mod, null, 2)}\n`, 'utf8')
  return ['id', 'name', 'version', 'description', 'authors', 'license']
}

async function replaceSettingsGradle(filePath, params) {
  const text = await fsp.readFile(filePath, 'utf8').catch(() => null)
  if (text === null) return []
  const next = text.replace(/^(\s*rootProject\.name\s*=\s*)['"][^'"]*['"]/m, `$1'${params.modid}'`)
  if (next === text) return []
  await fsp.writeFile(filePath, next, 'utf8')
  return ['rootProject.name']
}

async function findMainClass(projectPath) {
  const root = join(projectPath, 'src', 'main', 'java')
  const files = await walkFiles(root).catch(() => [])
  for (const rel of files) {
    if (!rel.endsWith('.java')) continue
    const text = await fsp.readFile(join(root, rel), 'utf8').catch(() => '')
    if (/@Mod\s*\(/.test(text) || /implements\s+ModInitializer/.test(text)) return { rel, text }
  }
  return null
}

const EXAMPLE_PACKAGE = 'com.example.examplemod'
const EXAMPLE_CLASS = 'ExampleMod'

/** 从官方示例包整体迁移到新包（等价于教程中的 IDE 重命名）。 */
async function migrateExamplePackage(projectPath, params) {
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const oldDir = join(javaRoot, EXAMPLE_PACKAGE.replace(/\./g, '/'))
  const exists = await fsp.stat(oldDir).then((stat) => stat.isDirectory()).catch(() => false)
  if (!exists) return { migrated: false, moved: [], warnings: [] }

  const files = await walkFiles(oldDir)
  const newDir = join(javaRoot, params.packagePath)
  // 先找出旧包里的主类名（官方为 ExampleMod，教程改名后可能不同）。
  let oldClassName = EXAMPLE_CLASS
  for (const rel of files) {
    if (!rel.endsWith('.java')) continue
    const text = await fsp.readFile(join(oldDir, rel), 'utf8').catch(() => '')
    if (!/@Mod\s*\(|implements\s+ModInitializer/.test(text)) continue
    const match = text.match(/public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/)
    if (match) {
      oldClassName = match[1]
      break
    }
  }
  const moved = []
  for (const rel of files) {
    const source = join(oldDir, rel)
    const text = await fsp.readFile(source, 'utf8').catch(() => null)
    const baseName = rel.split('/').pop()
    const newBase = baseName === `${oldClassName}.java` ? `${params.ClassName}.java` : baseName
    const target = join(newDir, rel.slice(0, rel.length - baseName.length) + newBase)
    await fsp.mkdir(dirname(target), { recursive: true })
    if (text !== null && rel.endsWith('.java')) {
      const packagePattern = new RegExp(`package\\s+${EXAMPLE_PACKAGE.replace(/\./g, '\\.')}(\\.[\\w.]+)?\\s*;`)
      const next = text
        .replace(packagePattern, (_match, suffix) => `package ${params.package}${suffix ?? ''};`)
        .split(oldClassName).join(params.ClassName)
        .split('examplemod').join(params.modid)
      await fsp.writeFile(target, next, 'utf8')
    } else if (text !== null) {
      await fsp.writeFile(target, text, 'utf8')
    } else {
      await fsp.copyFile(source, target).catch(() => {})
    }
    if (resolve(source) !== resolve(target)) await fsp.rm(source, { force: true }).catch(() => {})
    moved.push(target.slice(javaRoot.length + 1).replace(/\\/g, '/'))
  }
  await fsp.rm(oldDir, { recursive: true, force: true }).catch(() => {})
  // 清理旧包路径上残留的空目录（例如 com/example）；遇到非空即停止。
  let current = dirname(oldDir)
  while (current !== javaRoot && current.startsWith(javaRoot + sep)) {
    const entries = await fsp.readdir(current).catch(() => null)
    if (!entries || entries.length) break
    await fsp.rmdir(current).catch(() => {})
    current = dirname(current)
  }
  return { migrated: true, moved, warnings: [] }
}

/** 迁移 assets/<旧modid> 与 data/<旧modid> 到新 modid。 */
async function migrateResourceDirs(projectPath, params) {
  const resources = join(projectPath, 'src', 'main', 'resources')
  const changed = []
  for (const base of ['assets', 'data']) {
    const oldDir = join(resources, base, 'examplemod')
    const exists = await fsp.stat(oldDir).then((stat) => stat.isDirectory()).catch(() => false)
    if (!exists) continue
    const files = await walkFiles(oldDir)
    for (const rel of files) {
      const source = join(oldDir, rel)
      const text = await fsp.readFile(source, 'utf8').catch(() => null)
      const target = join(resources, base, params.modid, rel)
      await fsp.mkdir(dirname(target), { recursive: true })
      if (text !== null && rel.endsWith('.json')) {
        await fsp.writeFile(target, text.split('examplemod').join(params.modid), 'utf8')
      } else {
        await fsp.copyFile(source, target).catch(() => {})
      }
      await fsp.rm(source, { force: true }).catch(() => {})
    }
    await fsp.rm(oldDir, { recursive: true, force: true }).catch(() => {})
    changed.push(`${base}/examplemod → ${base}/${params.modid}`)
  }
  return changed
}

/** 扫描迁移后的示例残留（java / 资源）；返回命中相对路径。 */
async function scanResidual(projectPath) {
  const hits = []
  const roots = [
    ['java', join(projectPath, 'src', 'main', 'java')],
    ['resources', join(projectPath, 'src', 'main', 'resources')],
  ]
  for (const [label, root] of roots) {
    const files = await walkFiles(root)
    for (const rel of files) {
      if (!/\.(java|json|toml|properties|mcmeta)$/.test(rel)) continue
      const text = await fsp.readFile(join(root, rel), 'utf8').catch(() => '')
      if (/examplemod|ExampleMod/.test(text)) hits.push(`${label}/${rel}`)
    }
  }
  return hits
}

/** 安装 Parchment（本轮仅 Forge；NeoForge/Fabric 后续按官方 MDK 结构再做）。 */
async function applyParchment(projectPath, params, mapping) {
  if (mapping === 'official') return []
  if (params.loader !== 'forge') return []
  if (!params.parchmentVersion) return []
  const changes = []

  const propertiesPath = join(projectPath, 'gradle.properties')
  const updated = await replaceProperties(propertiesPath, {
    mapping_channel: 'parchment',
    mapping_version: params.parchmentVersion,
  })
  if (updated.length) changes.push(`mapping → parchment（${params.parchmentVersion}）`)

  const buildPath = join(projectPath, 'build.gradle')
  const build = await fsp.readFile(buildPath, 'utf8').catch(() => null)
  if (build !== null && !build.includes('org.parchmentmc.librarian.forgegradle')) {
    const pattern = /(id\s+'net\.minecraftforge\.gradle'\s+version\s+'[^']*')/
    if (pattern.test(build)) {
      const next = build.replace(pattern, `$1\n    id 'org.parchmentmc.librarian.forgegradle' version '1.+'`)
      await fsp.writeFile(buildPath, next, 'utf8')
      changes.push('build.gradle: 安装 librarian 插件')
    }
  }

  const settingsPath = join(projectPath, 'settings.gradle')
  const settings = await fsp.readFile(settingsPath, 'utf8').catch(() => null)
  if (settings !== null && !settings.includes('maven.parchmentmc.org')) {
    let next = settings
    if (/pluginManagement\s*\{[\s\S]*?repositories\s*\{/.test(next)) {
      next = next.replace(/(pluginManagement\s*\{[\s\S]*?repositories\s*\{)/, `$1\n        maven { url = 'https://maven.parchmentmc.org' }`)
    } else {
      next = `pluginManagement {\n    repositories {\n        gradlePluginPortal()\n        maven { url = 'https://maven.parchmentmc.org' }\n    }\n}\n\n${next}`
    }
    await fsp.writeFile(settingsPath, next, 'utf8')
    changes.push('settings.gradle: 添加 Parchment Maven')
  }
  return changes
}

async function replaceMainClass(projectPath, params) {
  const main = await findMainClass(projectPath)
  if (!main) return { changed: false, warnings: ['未找到主类（@Mod / ModInitializer），请手动调整'] }
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const oldPath = join(javaRoot, main.rel)
  let text = main.text
  const pkgMatch = text.match(/^\s*package\s+([\w.]+)\s*;/m)
  if (pkgMatch) text = text.replace(pkgMatch[0], `package ${params.package};`)
  const classMatch = text.match(/public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/)
  if (classMatch) {
    // 同时替换 @Mod(旧类.MODID) 等引用，避免注解仍指向旧类名。
    text = text.split(classMatch[1]).join(params.ClassName)
  }
  const newRel = `${params.packagePath}/${params.ClassName}.java`
  const newPath = join(javaRoot, newRel)
  await fsp.mkdir(dirname(newPath), { recursive: true })
  await fsp.writeFile(newPath, text, 'utf8')
  if (resolve(oldPath) !== resolve(newPath)) await fsp.rm(oldPath, { force: true })
  return { changed: true, warnings: [], moved: newRel }
}

/** 在已解压的 MDK 目录上做受控替换，返回变更摘要。 */
export async function applyMdkParams(projectPath, params, input = {}) {
  const changes = []
  const warnings = []

  const propertiesPath = join(projectPath, 'gradle.properties')
  const properties = parseProperties(await fsp.readFile(propertiesPath, 'utf8').catch(() => ''))
  const updates = {
    mod_id: params.modid,
    mod_name: params.gradleName,
    mod_license: params.gradleLicense,
    mod_version: params.version,
    mod_group_id: params.package,
    mod_authors: params.gradleAuthors,
    mod_description: params.gradleDescription,
  }
  if ('archives_base_name' in properties) updates.archives_base_name = params.modid
  const propertyChanges = await replaceProperties(propertiesPath, updates)
  if (propertyChanges.length) changes.push(`gradle.properties: ${propertyChanges.join(', ')}`)

  const modsToml = join(projectPath, 'src', 'main', 'resources', 'META-INF', 'mods.toml')
  const tomlChanges = await replaceModsToml(modsToml, params)
  if (tomlChanges.length) changes.push(`mods.toml: ${tomlChanges.join(', ')}`)

  const fabricJson = join(projectPath, 'src', 'main', 'resources', 'fabric.mod.json')
  const fabricChanges = await replaceFabricJson(fabricJson, params)
  if (fabricChanges.length) changes.push(`fabric.mod.json: ${fabricChanges.join(', ')}`)

  const settingsChanges = await replaceSettingsGradle(join(projectPath, 'settings.gradle'), params)
  if (settingsChanges.length) changes.push(`settings.gradle: ${settingsChanges.join(', ')}`)

  const migration = await migrateExamplePackage(projectPath, params)
  if (migration.migrated) {
    changes.push(`示例包迁移: ${migration.moved.length} 个文件`)
    changes.push(...(await migrateResourceDirs(projectPath, params)))
  } else {
    // 非官方示例包结构时退回单主类处理。
    const mainResult = await replaceMainClass(projectPath, params)
    if (mainResult.changed) changes.push(`主类: ${mainResult.moved}`)
    warnings.push(...mainResult.warnings)
  }

  changes.push(...(await applyParchment(projectPath, params, input.mapping)))
  return { changes, warnings }
}

/** 生成后校验必需文件与关键字段。 */
export async function validateMdkOutput(projectPath, params, input = {}) {
  const problems = []
  const warnings = []
  for (const rel of ['build.gradle', 'settings.gradle', 'gradle.properties']) {
    const ok = await fsp.stat(join(projectPath, rel)).then(() => true).catch(() => false)
    if (!ok) problems.push(`缺少 ${rel}`)
  }
  const wrapper = await fsp.stat(join(projectPath, 'gradlew.bat')).then(() => true).catch(() => false)
  if (!wrapper) warnings.push('缺少 gradlew.bat（可能无法直接构建）')

  const properties = parseProperties(await fsp.readFile(join(projectPath, 'gradle.properties'), 'utf8').catch(() => ''))
  if (properties.mod_id && properties.mod_id !== params.modid) problems.push(`gradle.properties 的 mod_id 未更新（${properties.mod_id}）`)
  if (properties.mod_group_id && properties.mod_group_id !== params.package) {
    problems.push(`mod_group_id 与包名不一致（${properties.mod_group_id} ≠ ${params.package}）`)
  }
  const oldExampleDir = join(projectPath, 'src', 'main', 'java', ...EXAMPLE_PACKAGE.split('.'))
  const oldExists = await fsp.stat(oldExampleDir).then(() => true).catch(() => false)
  if (oldExists) problems.push('旧示例包目录仍存在')

  const modsToml = join(projectPath, 'src', 'main', 'resources', 'META-INF', 'mods.toml')
  const toml = await fsp.readFile(modsToml, 'utf8').catch(() => null)
  if (toml && !toggleHasModId(toml, params.modid)) problems.push('mods.toml 的 modId 未更新')

  if (input.mapping !== 'official' && params.loader === 'forge' && params.parchmentVersion) {
    if (properties.mapping_channel !== 'parchment') problems.push('mapping_channel 未切换为 parchment')
    const buildText = await fsp.readFile(join(projectPath, 'build.gradle'), 'utf8').catch(() => '')
    if (!buildText.includes('org.parchmentmc.librarian.forgegradle')) problems.push('build.gradle 缺少 librarian 插件')
    const settingsText = await fsp.readFile(join(projectPath, 'settings.gradle'), 'utf8').catch(() => '')
    if (!settingsText.includes('maven.parchmentmc.org')) problems.push('settings.gradle 缺少 Parchment Maven')
  }
  const main = await findMainClass(projectPath)
  if (!main) {
    warnings.push('未找到主类')
  } else if (!main.rel.startsWith(`${params.packagePath}/`)) {
    problems.push(`主类不在新包目录中（${main.rel} 应为 ${params.packagePath}/...）`)
  }
  if (!params.gradleAuthors) warnings.push('未填写作者，包名回退为 com.example.<modid>；建议在新建时填写作者')

  return { ok: problems.length === 0, problems, warnings }
}

function toggleHasModId(toml, modid) {
  // mods.toml 用 ${mod_id} 时由 Gradle processResources 展开，视为满足。
  if (toml.includes('modId="${mod_id}"') || toml.includes('modId = "${mod_id}"')) return true
  return toml.includes(`modId="${modid}"`) || toml.includes(`modId = "${modid}"`)
}

/**
 * MDK 模式应用：解压/复制 → 替换 → 校验；失败删除本次产生文件。
 * 目标目录允许已有 `.mcstudio/` 与 `docs/`（project.create 先建目录）。
 */
export async function applyMdk(projectPath, input = {}) {
  const meta = await readProjectMeta(projectPath)
  const params = inferParams(input, meta)
  const source = input.archive || input.dir
  if (!source) throw new Error('MDK 模式需要 archive 或 dir')

  const target = resolve(projectPath)
  const existing = await fsp.readdir(target).catch(() => [])
  // 工坊初始化会写 .mcstudio / docs / README / .gitignore，允许它们存在。
  const allowedExisting = new Set(['.mcstudio', 'docs', 'README.md', '.gitignore'])
  const unexpected = existing.filter((name) => !allowedExisting.has(name))
  if (unexpected.length) throw new Error(`目标目录非空：${unexpected.slice(0, 5).join(', ')}`)

  const sourcePath = resolve(source)
  const sourceStat = await fsp.stat(sourcePath).catch(() => null)
  if (!sourceStat) throw new Error(`MDK 路径不存在：${source}`)

  let created = []
  const warnings = []
  try {
    if (sourceStat.isDirectory()) {
      created = await copyDirectory(sourcePath, target)
    } else {
      created = await extractZip(sourcePath, target)
    }
    const changes = await applyMdkParams(target, params, input)
    warnings.push(...changes.warnings)
    const residual = await scanResidual(target)
    if (residual.length) {
      throw new Error(`迁移后仍有示例残留：${residual.slice(0, 5).join(', ')}${residual.length > 5 ? ' 等' : ''}`)
    }
    const validation = await validateMdkOutput(target, params, input)
    warnings.push(...validation.warnings)
    if (!validation.ok) throw new Error(`MDK 生成校验失败：${validation.problems.join('；')}`)
    return { params, files: created, changes: changes.changes, warnings }
  } catch (error) {
    for (const rel of created) {
      await fsp.rm(join(target, rel), { force: true }).catch(() => {})
    }
    throw error
  }
}

/* ── 下载（仅白名单主机） ─────────────────────────────────── */

const ALLOWED_HOSTS = new Set(['maven.minecraftforge.net', 'maven.neoforged.net', 'github.com'])
const MDK_URLS = {
  forge: 'https://maven.minecraftforge.net/net/minecraftforge/forge/{mc}-{loader}/forge-{mc}-{loader}-mdk.zip',
  neoforge: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/{loader}/neoforge-{loader}-mdk.zip',
  fabric: 'https://github.com/FabricMC/fabric-example-mod/archive/refs/tags/{mc}.zip',
}

export function mdkUrl(loader, minecraft = SUPPORTED_MC) {
  const matrix = resolveMatrix(loader, minecraft)
  if (!matrix) throw new Error(`不支持下载的版本：${loader} / ${minecraft}`)
  const template = MDK_URLS[String(loader).toLowerCase()]
  if (!template) throw new Error(`不支持下载的加载器：${loader}`)
  return template.replace(/\{mc\}/g, minecraft).replace(/\{loader\}/g, matrix.loaderVersion)
}

/** 下载官方 MDK（仅白名单主机）；返回本地路径、大小与 sha256。 */
export async function downloadMdk({ loader, minecraft, into } = {}) {
  const url = mdkUrl(loader, minecraft)
  const host = new URL(url).host
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`下载源不在白名单：${host}`)
  if (!into) throw new Error('缺少下载目录')
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_ZIP_BYTES) throw new Error('下载文件超过大小上限')
  const matrix = resolveMatrix(loader, minecraft)
  const name = `${loader}-${minecraft}-${matrix.loaderVersion}-mdk.zip`
  const target = join(resolve(into), name)
  await fsp.mkdir(dirname(target), { recursive: true })
  await fsp.writeFile(target, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { path: target, url, bytes: bytes.length, sha256 }
}

/** 预览 MDK 模式：文件清单与冲突，不写盘。 */
export async function previewMdk(projectPath, input = {}) {
  const source = input.archive || input.dir
  if (!source) throw new Error('MDK 模式需要 archive 或 dir')
  const info = await inspectMdk(resolve(source))
  const meta = await readProjectMeta(projectPath)
  const params = inferParams(input, meta)
  const files = []
  const conflicts = []
  for (const rel of info.files ?? []) {
    const exists = await fsp.stat(join(projectPath, rel)).then(() => true).catch(() => false)
    files.push({ path: rel, action: exists ? 'skip' : 'create' })
    if (exists) conflicts.push({ path: rel, reason: '已存在' })
  }
  return {
    source: 'mdk',
    params,
    kind: info.kind,
    minecraft: info.minecraft,
    loaderVersion: info.loaderVersion,
    files,
    conflicts,
    warnings: info.warnings,
    errors: info.errors,
  }
}
