/**
 * API 索引：从项目依赖的 classpath 提取类/方法/字段签名。
 *
 * 设计约束（见 docs/major/V0.3.0-PLAN.md 第 4 节）：
 *   - 默认 `auto`：先尝试 Gradle 导出真实 classpath，失败回退静态扫描；
 *   - 无 JDK 时退化为「jar 类名清单」，方法签名标记 unknown；
 *   - 索引只写插件缓存（`$DSH_HOME/mcmods-studio/cache/api/`），不进项目；
 *   - 查询按需读取分片，不把整个索引塞进内存或提示词；
 *   - 失败返回 `{available:false, reason}`，不阻塞内容编辑。
 */

import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { dataDir, isFile, readJson, writeJson } from './registry.js'
import { readProjectMeta } from './meta.js'
import { readGradleProperties } from './gradle.js'

export const API_SCHEMA_VERSION = 1

const CACHE_DIR = 'cache/api'
const CURRENT_FILE = 'current.json'
const MAX_JARS = 400
const MAX_CLASSES = 20000
const JAVAP_BATCH = 40
const MAX_SEARCH = 50

/** 只索引模组开发相关包。 */
const PACKAGE_WHITELIST = [
  'net.minecraft',
  'net.minecraftforge',
  'net.neoforged',
  'net.fabricmc',
  'com.mojang.blaze3d',
  'com.mojang.math',
]

/** 排除内部实现与数据生成器。 */
const EXCLUDE_PATTERNS = [/\.impl\./, /\.internal\./, /\.mixin\./, /\.datagen\./]

const JAR_PATTERN = /(minecraft|forge|neoforge|fabric)/i

/* ── 路径与哈希 ───────────────────────────────────────────── */

function hashText(text) {
  return createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 16)
}

/** 项目级缓存根目录（不含 classpathHash）。 */
export function apiCacheDir(projectPath) {
  return join(dataDir(), CACHE_DIR, hashText(String(projectPath).toLowerCase()))
}

function indexDir(projectPath, classpathHash) {
  return join(apiCacheDir(projectPath), classpathHash)
}

/** 读当前索引指针；没有索引时返回 null。 */
export async function readCurrentIndex(projectPath) {
  const pointer = await readJson(join(apiCacheDir(projectPath), CURRENT_FILE), null)
  if (!pointer || typeof pointer.classpathHash !== 'string' || !pointer.classpathHash) return null
  const dir = indexDir(projectPath, pointer.classpathHash)
  const meta = await readJson(join(dir, 'meta.json'), null)
  if (!meta) return null
  return { dir, meta }
}

/* ── 构建信息 ─────────────────────────────────────────────── */

/** 读取构建信息：加载器、MC 版本、映射、构建文件摘要。 */
export async function readBuildInfo(projectPath) {
  const meta = await readProjectMeta(projectPath).catch(() => null)
  const gradle = await readGradleProperties(projectPath).catch(() => ({ props: {} }))
  const props = gradle?.props ?? {}
  const buildText = await fsp.readFile(join(projectPath, 'build.gradle'), 'utf8').catch(() => '')
  const settingsText = await fsp.readFile(join(projectPath, 'settings.gradle'), 'utf8').catch(() => '')
  return {
    loader: meta?.loader || '',
    mcVersion: meta?.minecraft || props.minecraft_version || '1.20.1',
    loaderVersion: meta?.loaderVersion || props.forge_version || props.neo_version || props.loader_version || '',
    mappings: props.mappings || props.official_mappings_version || props.parchment_minecraft_version || '',
    javaVersion: props.java_version || '17',
    buildHash: hashText(`${buildText}\n${settingsText}\n${JSON.stringify(props)}`),
  }
}

/* ── classpath 发现 ───────────────────────────────────────── */

async function walkJars(root, depth, out) {
  if (depth > 6 || out.length >= MAX_JARS) return
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (out.length >= MAX_JARS) return
    if (entry.name.startsWith('.')) continue
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      await walkJars(full, depth + 1, out)
    } else if (entry.isFile() && entry.name.endsWith('.jar')
      && !entry.name.endsWith('-sources.jar') && !entry.name.endsWith('-javadoc.jar')
      && JAR_PATTERN.test(full)) {
      out.push(full)
    }
  }
}

/** 静态扫描 Gradle 缓存与项目 build 目录。 */
export async function discoverJarsStatic(projectPath) {
  const jars = []
  await walkJars(join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1'), 0, jars)
  await walkJars(join(projectPath, 'build'), 0, jars)
  return [...new Set(jars)]
}

const INIT_SCRIPT = `allprojects {
  tasks.register('mcmodsDumpClasspath') {
    doLast {
      def cp = sourceSets.main.compileClasspath.files.collect { it.absolutePath }.join(File.pathSeparator)
      println 'MCMODS_CLASSPATH=' + cp
    }
  }
}
`

function runCommand(command, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令超时（${timeoutMs}ms）：${command}`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      if (stdout.length > 4 * 1024 * 1024) child.kill()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      if (stderr.length > 1024 * 1024) child.kill()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`命令失败（${code}）：${(stderr || stdout).slice(0, 400)}`))
    })
  })
}

/** 精确模式：用临时 Gradle init 脚本导出 compileClasspath。 */
export async function discoverJarsGradle(projectPath) {
  const dir = join(dataDir(), 'cache', 'gradle')
  await fsp.mkdir(dir, { recursive: true })
  const script = join(dir, 'mcmods-api-init.gradle')
  await fsp.writeFile(script, INIT_SCRIPT, 'utf8')

  const hasBat = await isFile(join(projectPath, 'gradlew.bat'))
  const hasSh = await isFile(join(projectPath, 'gradlew'))
  if (!hasBat && !hasSh) throw new Error('项目缺少 gradlew')
  const wrapper = hasBat ? 'gradlew.bat' : './gradlew'

  const output = await runCommand(
    wrapper,
    ['-I', script, 'mcmodsDumpClasspath', '--offline', '--console=plain', '-q'],
    projectPath,
    180000,
  )
  const line = output.split(/\r?\n/).find((item) => item.startsWith('MCMODS_CLASSPATH='))
  if (!line) throw new Error('Gradle 未返回 classpath')
  return line.slice('MCMODS_CLASSPATH='.length).split(delimiter).filter(Boolean)
}

/* ── zip 与 javap 解析 ────────────────────────────────────── */

/**
 * 读取 zip 中央目录的文件名（不解压内容）。
 *
 * 仅支持标准 zip；zip64 少见，遇到时返回已读到的部分。
 */
export function listZipEntries(buffer) {
  const EOCD = 0x06054b50
  const start = Math.max(0, buffer.length - 22 - 0xffff)
  let eocd = -1
  for (let i = buffer.length - 22; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = buffer.readUInt16LE(eocd + 10)
  const offset = buffer.readUInt32LE(eocd + 16)
  const names = []
  let cursor = offset
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) break
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    names.push(buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return names
}

/** 类名是否属于索引范围。 */
export function filterClassName(name) {
  if (typeof name !== 'string' || !name.includes('.')) return false
  if (!PACKAGE_WHITELIST.some((prefix) => name.startsWith(`${prefix}.`))) return false
  return !EXCLUDE_PATTERNS.some((pattern) => pattern.test(name))
}

/** 统一类名：兼容 `Outer.Inner` 与 `Outer$Inner` 两种写法。 */
export function normalizeClassName(name) {
  return String(name ?? '').trim().replace(/\s+/g, '')
}

function parseClassHeader(line) {
  const match = line.match(/^((?:(?:public|protected|private|abstract|final|static|sealed|non-sealed)\s+)*)(class|interface|enum|record|@interface)\s+([\w.$]+)/)
  if (!match) return null
  const rest = line.slice(match[0].length)
  const extendsMatch = rest.match(/extends\s+([\w.$]+)/)
  const implementsMatch = rest.match(/implements\s+([\w.$,\s]+)/)
  return {
    name: normalizeClassName(match[3]),
    kind: match[2] === '@interface' ? 'annotation' : match[2],
    modifiers: match[1].trim().split(/\s+/).filter(Boolean),
    extends: extendsMatch ? normalizeClassName(extendsMatch[1]) : '',
    implements: implementsMatch
      ? implementsMatch[1].split(',').map((item) => normalizeClassName(item)).filter(Boolean)
      : [],
    methods: [],
    fields: [],
  }
}

function parseMember(line) {
  const text = line.replace(/;$/, '').trim()
  const match = text.match(/^((?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp|transient|volatile)\s+)*)(.+)$/)
  if (!match) return null
  const modifiers = match[1].trim().split(/\s+/).filter(Boolean)
  const body = match[2].trim()

  if (body.includes('(')) {
    const open = body.indexOf('(')
    const close = body.lastIndexOf(')')
    if (close > open) {
      const before = body.slice(0, open).trim()
      const params = body.slice(open + 1, close).trim()
      const parts = before.split(/\s+/).filter(Boolean)
      const name = parts.pop() || ''
      const returns = parts.join(' ')
      if (!name) return null
      return {
        kind: 'method',
        value: {
          name,
          params: params ? params.split(',').map((item) => item.trim()).filter(Boolean) : [],
          returns,
          modifiers,
          constructor: !returns,
        },
      }
    }
  }

  const parts = body.split(/\s+/).filter(Boolean)
  const name = parts.pop() || ''
  const type = parts.join(' ')
  if (!name || !type) return null
  return { kind: 'field', value: { name, type, modifiers } }
}

/**
 * 解析 `javap -p -s` 输出。
 *
 * 返回类数组：`{name, kind, modifiers, extends, implements, methods[], fields[]}`。
 * 只处理签名，不处理方法体（javap 不输出方法体）。
 */
export function parseJavapOutput(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const classes = []
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('Compiled from')) continue
    if (trimmed === '}') {
      if (current) classes.push(current)
      current = null
      continue
    }
    const header = parseClassHeader(trimmed)
    if (header && trimmed.includes('{')) {
      if (current) classes.push(current)
      current = header
      continue
    }
    if (!current) continue
    if (trimmed.startsWith('descriptor:') || trimmed.startsWith('flags:') || trimmed.startsWith('Signature:')) continue
    if (line.startsWith('  ') && !line.startsWith('    ')) {
      const member = parseMember(trimmed)
      if (!member) continue
      if (member.kind === 'method') current.methods.push(member.value)
      else current.fields.push(member.value)
    }
  }
  if (current) classes.push(current)
  return classes
}

/* ── 索引构建 ─────────────────────────────────────────────── */

function shardName(className) {
  const index = className.lastIndexOf('.')
  const pkg = index > 0 ? className.slice(0, index) : ''
  return pkg ? pkg.replace(/[^\w.-]/g, '_') : '_default'
}

function mergeClasses(parsed) {
  const map = new Map()
  for (const cls of parsed) map.set(cls.name, cls)
  return [...map.values()]
}

function jarClassNames(buffer) {
  const names = []
  for (const entry of listZipEntries(buffer)) {
    if (!entry.endsWith('.class') || entry.startsWith('META-INF/')) continue
    const name = entry.slice(0, -6).replace(/\//g, '.')
    if (filterClassName(name)) names.push(name)
  }
  return names
}

async function findJavap() {
  try {
    await runCommand('javap', ['-version'], dataDir(), 15000)
    return true
  } catch {
    return false
  }
}

async function javapClasses(projectPath, jars, names) {
  const classes = []
  const list = [...names]
  for (let i = 0; i < list.length; i += JAVAP_BATCH) {
    const batch = list.slice(i, i + JAVAP_BATCH)
    try {
      const output = await runCommand(
        'javap',
        ['-p', '-s', '-classpath', jars.join(delimiter), ...batch],
        projectPath,
        120000,
      )
      classes.push(...parseJavapOutput(output))
    } catch {
      // 单批失败不影响其他批次；这些类只保留类名清单。
      for (const name of batch) {
        classes.push({
          name,
          kind: 'class',
          modifiers: [],
          extends: '',
          implements: [],
          methods: [],
          fields: [],
          signatureUnknown: true,
        })
      }
    }
  }
  return classes
}

/**
 * 重建索引。
 *
 * @param {string} projectPath
 * @param {{mode?: 'auto'|'gradle'|'static'}} [options]
 */
export async function refreshApiIndex(projectPath, options = {}) {
  const mode = options.mode === 'gradle' || options.mode === 'static' ? options.mode : 'auto'
  const build = await readBuildInfo(projectPath)
  let jars = []
  let source = ''
  let gradleError = ''

  if (mode !== 'static') {
    try {
      jars = await discoverJarsGradle(projectPath)
      source = 'gradle-classpath'
    } catch (error) {
      gradleError = error.message
    }
  }
  if (!jars.length && mode !== 'gradle') {
    jars = await discoverJarsStatic(projectPath)
    source = source || 'static-scan'
  }
  if (!jars.length) {
    return {
      available: false,
      reason: gradleError || 'no-classpath',
      build,
      stats: { jars: 0, classes: 0 },
    }
  }

  const classpathHash = hashText(`${[...jars].sort().join('|')}|${build.buildHash}`)
  const names = new Set()
  for (const jar of jars.slice(0, MAX_JARS)) {
    const buffer = await fsp.readFile(jar).catch(() => null)
    if (!buffer) continue
    for (const name of jarClassNames(buffer)) {
      names.add(name)
      if (names.size >= MAX_CLASSES) break
    }
    if (names.size >= MAX_CLASSES) break
  }

  let classes = []
  let javap = false
  if (names.size > 0) {
    javap = await findJavap()
    if (javap) classes = mergeClasses(await javapClasses(projectPath, jars, names))
    else {
      classes = [...names].map((name) => ({
        name,
        kind: 'class',
        modifiers: [],
        extends: '',
        implements: [],
        methods: [],
        fields: [],
        signatureUnknown: true,
      }))
      source = `${source}+jar-list`
    }
  }
  if (!classes.length) {
    return { available: false, reason: 'no-classes', build, stats: { jars: jars.length, classes: 0 } }
  }

  const dir = indexDir(projectPath, classpathHash)
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  const shards = new Map()
  const index = {}
  for (const cls of classes) {
    const shard = shardName(cls.name)
    if (!shards.has(shard)) shards.set(shard, [])
    shards.get(shard).push(cls)
    index[cls.name] = { kind: cls.kind, shard }
  }
  for (const [shard, list] of shards) {
    await writeJson(join(dir, 'classes', `${shard}.json`), list)
  }
  await writeJson(join(dir, 'index.json'), {
    schemaVersion: API_SCHEMA_VERSION,
    count: classes.length,
    classes: index,
  })
  const meta = {
    schemaVersion: API_SCHEMA_VERSION,
    projectPath,
    classpathHash,
    loader: build.loader,
    mcVersion: build.mcVersion,
    loaderVersion: build.loaderVersion,
    mappings: build.mappings,
    javaVersion: build.javaVersion,
    source,
    javap,
    jars: jars.slice(0, MAX_JARS),
    stats: { jars: jars.length, classes: classes.length, packages: shards.size },
    generatedAt: new Date().toISOString(),
  }
  await writeJson(join(dir, 'meta.json'), meta)
  await writeJson(join(apiCacheDir(projectPath), CURRENT_FILE), { classpathHash })
  return { available: true, source, javap, classpathHash, stats: meta.stats, build }
}

/* ── 查询 ─────────────────────────────────────────────────── */

async function loadIndex(projectPath) {
  const current = await readCurrentIndex(projectPath)
  if (!current) return null
  const index = await readJson(join(current.dir, 'index.json'), null)
  if (!index || !index.classes) return null
  return { ...current, index }
}

/** 索引状态：可用、过期、来源与统计。 */
export async function apiStatus(projectPath) {
  const build = await readBuildInfo(projectPath)
  const current = await readCurrentIndex(projectPath)
  if (!current) {
    return { available: false, reason: 'no-index', build, stats: { jars: 0, classes: 0 } }
  }
  const expected = hashText(`${[...(current.meta.jars ?? [])].sort().join('|')}|${build.buildHash}`)
  return {
    available: true,
    stale: expected !== current.meta.classpathHash,
    source: current.meta.source,
    javap: Boolean(current.meta.javap),
    stats: current.meta.stats,
    generatedAt: current.meta.generatedAt,
    build,
  }
}

/** 搜索类：按类名/包名匹配，最多 50 条。 */
export async function apiSearch(projectPath, query = {}) {
  const loaded = await loadIndex(projectPath)
  if (!loaded) return { available: false, results: [] }
  const keyword = String(query.query ?? '').trim().toLowerCase()
  const pkg = String(query.package ?? '').trim()
  const kind = String(query.kind ?? '').trim()
  const limit = Math.min(MAX_SEARCH, Math.max(1, Number(query.limit) || 20))
  const results = []
  for (const [name, info] of Object.entries(loaded.index.classes)) {
    if (kind && info.kind !== kind) continue
    if (pkg && !name.startsWith(`${pkg}.`)) continue
    if (keyword && !name.toLowerCase().includes(keyword)) continue
    results.push({ name, kind: info.kind })
    if (results.length >= limit) break
  }
  return { available: true, results, count: results.length }
}

async function readShard(loaded, shard) {
  return readJson(join(loaded.dir, 'classes', `${shard}.json`), [])
}

function mergeInherited(child, parent, visited) {
  const ownMethods = new Set(child.methods.map((item) => `${item.name}/${item.params.join(',')}`))
  const ownFields = new Set(child.fields.map((item) => item.name))
  const methods = [...child.methods]
  const fields = [...child.fields]
  for (const method of parent.methods ?? []) {
    const key = `${method.name}/${(method.params ?? []).join(',')}`
    if (ownMethods.has(key)) continue
    ownMethods.add(key)
    methods.push({ ...method, inheritedFrom: method.inheritedFrom || parent.name })
  }
  for (const field of parent.fields ?? []) {
    if (ownFields.has(field.name)) continue
    ownFields.add(field.name)
    fields.push({ ...field, inheritedFrom: field.inheritedFrom || parent.name })
  }
  return { ...child, methods, fields, visited }
}

async function resolveClass(projectPath, name, visited) {
  const loaded = await loadIndex(projectPath)
  if (!loaded) return null
  const normalized = normalizeClassName(name)
  const info = loaded.index.classes[normalized]
  if (!info) return null
  const shard = await readShard(loaded, info.shard)
  const cls = shard.find((item) => item.name === normalized)
  if (!cls) return null
  if (visited.has(normalized)) return cls
  const nextVisited = new Set(visited).add(normalized)
  let merged = cls
  if (cls.extends) {
    const parent = await resolveClass(projectPath, cls.extends, nextVisited)
    if (parent) merged = mergeInherited(cls, parent, nextVisited)
  }
  return merged
}

/** 读取单个类的签名；默认合并继承的 public/protected 方法。 */
export async function apiGet(projectPath, className, options = {}) {
  const name = normalizeClassName(className)
  if (!name) throw new Error('缺少类名')
  const loaded = await loadIndex(projectPath)
  if (!loaded) return { found: false, name, available: false }
  const cls = await resolveClass(projectPath, name, new Set())
  if (!cls) return { found: false, name, available: true }
  if (options.includeInherited === false) {
    const shard = await readShard(loaded, loaded.index.classes[name].shard)
    const raw = shard.find((item) => item.name === name)
    return { found: Boolean(raw), name, class: raw }
  }
  return { found: true, name, class: cls }
}

/** 为任务取 API 上下文：按 apiRefs 取签名，预算 20 类 / 4KB。 */
export async function apiContext(projectPath, refs = [], budget = {}) {
  const maxClasses = Math.min(20, Math.max(1, Number(budget.apiClasses) || 20))
  const maxBytes = Math.min(8192, Math.max(1024, Number(budget.apiBytes) || 4096))
  const loaded = await loadIndex(projectPath)
  if (!loaded) return { available: false, apiUnknown: true, classes: [], truncated: [] }
  const classes = []
  const truncated = []
  let bytes = 0
  for (const ref of [...new Set(refs)]) {
    if (classes.length >= maxClasses) {
      truncated.push({ ref, reason: 'class-budget' })
      continue
    }
    const result = await apiGet(projectPath, ref)
    if (!result.found) {
      truncated.push({ ref, reason: 'not-found' })
      continue
    }
    const text = JSON.stringify(result.class)
    if (bytes + text.length > maxBytes) {
      truncated.push({ ref, reason: 'byte-budget' })
      continue
    }
    bytes += text.length
    classes.push(result.class)
  }
  return { available: true, apiUnknown: false, classes, truncated, bytes }
}
