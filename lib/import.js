/**
 * 工程扫描与导入
 *
 * 识别已有工程（gradle.properties / mods.toml / fabric.mod.json），
 * 扫描标准路径下的资源，生成条目与快照。
 */

import { promises as fsp } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, join, relative } from 'node:path'

import { dataDir, expandPath, isDirectory, isFile, readJson, readRegistry, writeJson, writeText } from './registry.js'
import { runWithProjectBackup } from './backup.js'
import { scanRegistrations, foreignRegistrationIds } from './registry-scan.js'
import { extractItemProps } from './item-props.js'
import { readGradleProperties, realValue } from './gradle.js'
import { defaultProperties, ITEM_FIELDS } from './schema.js'
import {
  MC_VERSION,
  docsDir,
  featuresFile,
  itemsDir,
  projectDataDir,
  projectMetaFile,
  isValidModId,
  requireProjectPath,
} from './paths.js'
import {
  readProjectMeta,
  readStudioMarker,
  touchMeta,
  writeStudioMarker,
  isRegisteredProject,
  isStudioProject,
} from './meta.js'
import { listItems, normalizeItem, readProject } from './entries.js'
import { refreshStructure } from './structure.js'

export async function scanCandidates(root) {
  const base = expandPath(root)
  if (!(await isDirectory(base))) throw new Error(`根目录不存在：${base}`)
  const names = await fsp.readdir(base, { withFileTypes: true })
  const out = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    const path = join(base, entry.name)
    const studio = await isStudioProject(path)
    const marker = await readStudioMarker(path)
    const gradle = (await isFile(join(path, 'build.gradle'))) || (await isFile(join(path, 'build.gradle.kts')))
    const detected = await detectDescriptor(path)
    if (!studio && !gradle && !detected) continue
    out.push({
      path,
      name: detected?.name || (studio ? (await readProjectMeta(path))?.name : '') || entry.name,
      modid: detected?.modid || '',
      loader: detected?.loader || '',
      kind: studio ? 'studio' : detected ? 'mod' : 'gradle',
      isStudio: studio,
      // 已导入 = 目录里有 .mcstudio/studio.json；老项目（只有 project.json）也视为已导入
      imported: Boolean(marker) || studio,
      legacy: !marker && studio,
      projectId: marker?.projectId || '',
      importedAt: marker?.importedAt || '',
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

/** 读取构建脚本与 gradle.properties 的合并文本，用于判断加载器。 */
async function readBuildText(projectPath) {
  const parts = []
  for (const name of ['build.gradle', 'build.gradle.kts', 'gradle.properties', 'settings.gradle']) {
    const file = join(projectPath, name)
    if (await isFile(file)) parts.push(await fsp.readFile(file, 'utf8').catch(() => ''))
  }
  return parts.join('\n')
}

/**
 * 识别模组工程的描述文件。
 *
 * 描述文件里的值可能写成 `${mod_version}` 这类 Gradle 占位符（构建期才替换）。
 * 这里先用 gradle.properties 解析；解析不出来就当作「未提供」，
 * 避免被当成真实值参与冲突比对。
 */
async function detectDescriptor(projectPath, props = {}) {
  const resources = join(projectPath, 'src', 'main', 'resources')
  // 记录被解析过的占位符，供导入提示使用
  const placeholders = []
  const real = (value) => {
    if (typeof value === 'string' && value.includes('$')) {
      const resolved = realValue(value, props)
      placeholders.push(resolved ? `${value} → ${resolved}` : `${value}（未解析）`)
      return resolved
    }
    return value
  }

  const fabricFile = join(resources, 'fabric.mod.json')
  if (await isFile(fabricFile)) {
    const json = await readJson(fabricFile, null)
    const entry = {
      loader: 'fabric',
      modid: typeof json?.id === 'string' ? real(json.id) : '',
      name: typeof json?.name === 'string' ? real(json.name) : '',
      version: typeof json?.version === 'string' ? real(json.version) : '',
      description: typeof json?.description === 'string' ? real(json.description) : '',
      file: fabricFile,
    }
    entry.placeholders = placeholders
    return entry
  }

  const buildText = await readBuildText(projectPath)
  const looksNeoForge = /net\.neoforged|neoforged[\w.]*gradle|neo_version/i.test(buildText)

  for (const [file, baseLoader] of [
    [join(resources, 'META-INF', 'mods.toml'), 'forge'],
    [join(resources, 'META-INF', 'neoforge.mods.toml'), 'neoforge'],
  ]) {
    if (!(await isFile(file))) continue
    const text = await fsp.readFile(file, 'utf8').catch(() => '')
    // 1.20.1 的 NeoForge 与 Forge 共用 mods.toml，只能靠构建脚本区分
    const loader = baseLoader === 'forge' && looksNeoForge ? 'neoforge' : baseLoader
    const entry = {
      loader,
      modid: real(matchToml(text, 'modId')),
      name: real(matchToml(text, 'displayName')),
      version: real(matchToml(text, 'version')),
      description: real(matchToml(text, 'description')),
      file,
    }
    entry.placeholders = placeholders
    return entry
  }

  // gradle 兜底：只判断加载器类型
  const gradleFile = (await isFile(join(projectPath, 'build.gradle')))
    ? join(projectPath, 'build.gradle')
    : (await isFile(join(projectPath, 'build.gradle.kts')))
      ? join(projectPath, 'build.gradle.kts')
      : ''
  if (gradleFile) {
    const text = await fsp.readFile(gradleFile, 'utf8').catch(() => '')
    const loader = /fabric-loom/.test(text)
      ? 'fabric'
      : /net\.neoforged/.test(text)
        ? 'neoforge'
        : /net\.minecraftforge/.test(text)
          ? 'forge'
          : ''
    if (loader) return { loader, modid: '', name: '', version: '', description: '', file: gradleFile }
  }
  return null
}

/** 从 TOML 文本中取一个字符串值。 */
function matchToml(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'))
  return match ? match[1] : ''
}

/**
 * 扫描工程中的资源。
 *
 * 依据 docs/PROJECT-STRUCTURE.md 的固定位置：
 *   assets/<modid>/textures/item|block、models/item|block、blockstates、lang
 *   data/<modid>/recipes、loot_tables/blocks、tags/items|blocks、advancements
 */
async function scanProjectAssets(projectPath, modid) {
  const resources = join(projectPath, 'src', 'main', 'resources')
  const empty = {
    textures: [], blockTextures: [], models: [], blockModels: [],
    blockstates: [], langs: [], recipes: [], lootTables: [], tags: [], advancements: [],
    namespaces: [],
  }
  if (!modid) return empty

  const assetsDir = join(resources, 'assets')
  const dataDir = join(resources, 'data')
  const assetsRoot = join(assetsDir, modid)
  // P5：同时扫描 datagen 输出（src/generated/resources），main 优先去重
  const roots = [resources, join(projectPath, 'src', 'generated', 'resources')]

  /** 列出目录下的文件名（去掉扩展名），按扩展名过滤；合并 main 与 generated。 */
  const listIds = async (rel, ext) => {
    const out = new Set()
    for (const root of roots) {
      const dir = join(root, rel)
      for (const name of await fsp.readdir(dir).catch(() => [])) {
        if (new RegExp(`\\.${ext}$`, 'i').test(name)) out.add(name.replace(new RegExp(`\\.${ext}$`, 'i'), ''))
      }
    }
    return [...out].sort()
  }

  const emptyIf = async (rel, values) => {
    for (const root of roots) {
      if (await isDirectory(join(root, rel))) return values
    }
    return []
  }

  const textures = await listIds(join('assets', modid, 'textures', 'item'), 'png')
  const blockTextures = await listIds(join('assets', modid, 'textures', 'block'), 'png')
  const models = await listIds(join('assets', modid, 'models', 'item'), 'json')
  const blockModels = await listIds(join('assets', modid, 'models', 'block'), 'json')
  const blockstates = await listIds(join('assets', modid, 'blockstates'), 'json')
  const langs = await emptyIf(join('assets', modid, 'lang'), await listIds(join('assets', modid, 'lang'), 'json'))

  const recipes = await listIds(join('data', modid, 'recipes'), 'json')
  const lootTables = await listIds(join('data', modid, 'loot_tables', 'blocks'), 'json')
  const advancements = await listIds(join('data', modid, 'advancements'), 'json')
  const tags = [
    ...(await listIds(join('data', modid, 'tags', 'items'), 'json')).map((id) => `items/${id}`),
    ...(await listIds(join('data', modid, 'tags', 'blocks'), 'json')).map((id) => `blocks/${id}`),
  ].sort()

  // 工程里实际存在的命名空间（assets/ 与 data/ 下的子目录名）
  const namespaces = [
    ...new Set([
      ...(await fsp.readdir(assetsDir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory()).map((e) => e.name),
      ...(await fsp.readdir(dataDir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isDirectory()).map((e) => e.name),
    ]),
  ].sort()

  return {
    textures, blockTextures, models, blockModels, blockstates, langs,
    recipes, lootTables, tags, advancements, namespaces,
  }
}

/**
 * 扫描 Java 源码中的注册名。
 *
 * 创造模式标签也是注册项，但它不是物品：同一个文件里出现
 * `DeferredRegister<CreativeModeTab>` / `CreativeModeTab.builder` /
 * `Registries.CREATIVE_MODE_TAB` 时，把该文件的 register("id", ...) 归到标签。
 */
async function scanRegistryNames(projectPath) {
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const names = new Set()
  const creativeTabs = new Set()
  async function walk(dir, depth) {
    if (depth > 12) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.java')) {
        const stat = await fsp.stat(full).catch(() => null)
        if (!stat || stat.size > 512 * 1024) continue
        const text = await fsp.readFile(full, 'utf8').catch(() => '')
        // 实体等非物品注册文件不参与旧扫描（注册优先扫描会单独归类）
        if (/EntityType|ENTITY_TYPES/.test(text)) continue
        const isCreativeTab = /DeferredRegister\s*<\s*CreativeModeTab\s*>|CreativeModeTab\.builder|Registries\.CREATIVE_MODE_TAB/.test(text)
        const target = isCreativeTab ? creativeTabs : names
        for (const match of text.matchAll(/register\s*\(\s*"([a-z0-9_]+)"\s*,/g)) target.add(match[1])
        for (const match of text.matchAll(/register\s*\(\s*"([a-z0-9_]+)"\s*\)/g)) target.add(match[1])
      }
    }
  }
  if (await isDirectory(javaRoot)) await walk(javaRoot, 0)
  return { items: [...names].sort(), creativeTabs: [...creativeTabs].sort() }
}

/**
 * 导入一个已有模组工程。
 *
 * 流程（见 docs/plans/IMPORT-PLAN.md）：
 *   1. 校验目录
 *   2. 读 gradle.properties 补全信息（缺失必需项 → 抛异常）
 *   3. 判定是否已在工坊中（注册表 / 工坊标记）
 *   4. 扫描资源并创建条目
 *   5. 写元数据、标记与快照
 */
export async function importProject(input) {
  const path = await requireProjectPath(input.path)

  // ── 步骤 2：解析身份信息 ────────────────────────────────
  const identity = await resolveIdentity(path, input)

  // ── 步骤 3：重复判定 ────────────────────────────────────
  // 已在项目列表中 → 报错，引导直接打开
  // 有工坊数据但不在列表（曾移除）→ 继续走添加流程，并补登记
  const existing = await readProjectMeta(path)
  const registered = await isRegisteredProject(path)
  if (registered && !input.force) {
    throw new Error('该目录已经是工坊项目，可直接打开')
  }

  const meta = {
    schemaVersion: 1,
    name: identity.name,
    modid: identity.modid,
    version: identity.version,
    description: identity.description,
    loader: identity.loader,
    minecraft: identity.minecraft,
    authors: identity.authors,
    license: identity.license,
    group: identity.group,
    minecraftRange: identity.minecraftRange,
    loaderVersion: identity.loaderVersion,
    loaderRange: identity.loaderRange,
    source: identity.source,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const { result, backupDir } = await runWithProjectBackup(path, async () => {
    await fsp.mkdir(itemsDir(path), { recursive: true })
    await writeJson(projectMetaFile(path), meta)

    // ── 步骤 4：扫描并创建条目 ──────────────────────────────
    const scanResult = await syncEntries(path, identity.modid, { mode: 'merge' })

    if (!(await isFile(featuresFile(path)))) {
      await writeJson(featuresFile(path), { schemaVersion: 1, features: [] })
    }
    await writeStudioMarker(path, { source: existing ? 'reimport' : 'import' })
    await fsp.mkdir(docsDir(path), { recursive: true })

    const snapshot = await writeSnapshot(path, scanResult)

    // 生成代码结构文档：确定性扫描，让 agent 不必反复 grep 源码。
    // 失败不影响导入——结构文档是可重建的派生数据。
    const structure = await refreshStructure(path).catch(() => null)

    return {
      ...(await readProject(path)),
      imported: {
        ...scanResult,
        snapshot,
        notices: identity.notices ?? [],
        structure: structure
          ? { files: structure.totals.files, classes: structure.totals.classes, mode: structure.mode }
          : null,
      },
    }
  }, 'import')
  result.imported.backup = backupDir
  return result
}

/**
 * 重新导入：保留用户改过的字段，只同步新增条目与指定冲突项。
 *
 * mode:
 *   'merge'     新增条目，保留现有（默认）
 *   'overwrite' 新增条目，并把类型冲突项改成扫描结果
 */
export async function reimportProject(input) {
  const path = await requireProjectPath(input.path)
  const meta = await readProjectMeta(path)
  if (!meta) throw new Error('该目录还不是工坊项目，请先「导入已有工程」')

  const identity = await resolveIdentity(path, {})
  if (input.proof) {
    const currentAnalysis = await analyzeImport({ path })
    if (input.proof !== currentAnalysis.proof) {
      throw new Error('预览后工程内容或条目已变化，请重新分析导入差异')
    }
  }

  const { result, backupDir } = await runWithProjectBackup(path, async () => {
    const patched = {
      ...meta,
      name: identity.name || meta.name,
      modid: identity.modid || meta.modid,
      version: identity.version || meta.version,
      loader: identity.loader || meta.loader,
      minecraft: identity.minecraft || meta.minecraft,
      authors: identity.authors || meta.authors,
      license: identity.license || meta.license,
      group: identity.group || meta.group,
      minecraftRange: identity.minecraftRange || meta.minecraftRange,
      loaderVersion: identity.loaderVersion || meta.loaderVersion,
      loaderRange: identity.loaderRange || meta.loaderRange,
      updatedAt: new Date().toISOString(),
    }
    await writeJson(projectMetaFile(path), patched)

    const mode = input.mode === 'overwrite' ? 'overwrite' : 'merge'
    const scanResult = await syncEntries(path, patched.modid, { mode })

    await writeStudioMarker(path, { source: 'reimport' })
    await fsp.mkdir(docsDir(path), { recursive: true })
    const snapshot = await writeSnapshot(path, scanResult)

    // 重新导入同样刷新结构文档，并按文件哈希增量保留已有注解
    const structure = await refreshStructure(path).catch(() => null)

    return {
      ...(await readProject(path)),
      imported: {
        ...scanResult,
        snapshot,
        notices: identity.notices ?? [],
        structure: structure
          ? { files: structure.totals.files, classes: structure.totals.classes, mode: structure.mode }
          : null,
      },
    }
  }, 'reimport')
  result.imported.backup = backupDir
  return result
}

/**
 * 分析导入/重新导入会产生什么变化，不写任何文件。
 *
 * 用于界面上的「确认差异」步骤：先算清楚再让用户决定。
 */
export async function analyzeImport(input) {
  const path = await requireProjectPath(input.path)
  const meta = await readProjectMeta(path)
  const marker = await readStudioMarker(path)

  // 身份解析失败时不让整个分析崩掉，把错误带回前端展示
  let identity = null
  let identityError = ''
  try {
    identity = await resolveIdentity(path, input)
  } catch (error) {
    identityError = error?.message || String(error)
  }

  const modid = identity?.modid || meta?.modid || ''
  const scan = modid ? await scanProjectAssets(path, modid) : null
  const registry = await scanRegistryNames(path)
  const existingItems = meta ? await listItems(path) : []

  const diff = scan
    ? diffEntries(scan, registry.items, existingItems, registry.creativeTabs)
    : { incoming: [], created: [], kept: [], typeConflicts: [], missing: [], blocks: [] }

  // 三分支判定（见 docs/plans/IMPORT-PLAN.md 步骤 3）：
  //   registered —— 在项目列表里（注册表），可直接打开
  //   orphan     —— 有工坊数据但不在列表（曾被移除），走添加流程
  //   new        —— 全新目录
  const registered = await isRegisteredProject(path)
  let kind = 'new'
  if (registered) kind = 'registered'
  else if (meta || marker) kind = 'orphan'

  const analysis = {
    path,
    kind,
    registered,
    hasStudioData: Boolean(meta || marker),
    marker: marker ? { projectId: marker.projectId, importedAt: marker.importedAt, source: marker.source } : null,
    identity,
    identityError,
    conflicts: identity?.conflicts ?? [],
    missing: identity?.missing ?? [],
    notices: identity?.notices ?? [],
    meta: meta ? {
      name: meta.name,
      modid: meta.modid,
      version: meta.version,
      loader: meta.loader,
      minecraft: meta.minecraft,
      authors: meta.authors,
      license: meta.license,
      group: meta.group,
      minecraftRange: meta.minecraftRange,
      loaderVersion: meta.loaderVersion,
      updatedAt: meta.updatedAt,
      items: existingItems.length,
    } : null,
    scan,
    diff,
    creativeTabs: registry.creativeTabs,
  }
  return { ...analysis, proof: importProof(analysis) }
}

/**
 * 预览证明：把「扫描结果 + 当前项目状态」压成哈希。
 * 预览与执行之间只要工程内容或条目变了，proof 就不一致，避免按过期预览覆盖。
 */
function importProof(analysis) {
  const identity = analysis.identity
    ? {
        name: analysis.identity.name,
        modid: analysis.identity.modid,
        version: analysis.identity.version,
        loader: analysis.identity.loader,
        minecraft: analysis.identity.minecraft,
        authors: analysis.identity.authors,
        license: analysis.identity.license,
        group: analysis.identity.group,
        minecraftRange: analysis.identity.minecraftRange,
        loaderVersion: analysis.identity.loaderVersion,
        loaderRange: analysis.identity.loaderRange,
        source: analysis.identity.source,
      }
    : null
  const scan = analysis.scan
    ? Object.fromEntries(Object.entries(analysis.scan).map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value].sort() : value,
      ]))
    : null
  return createHash('sha256')
    .update(JSON.stringify({
      path: analysis.path,
      kind: analysis.kind,
      identity,
      identityError: analysis.identityError,
      creativeTabs: analysis.creativeTabs,
      metaUpdatedAt: analysis.meta?.updatedAt ?? '',
      itemCount: analysis.meta?.items ?? 0,
      scan,
      diff: analysis.diff,
    }))
    .digest('hex')
}

/** 逐条比对扫描结果与已有条目。 */
function diffEntries(assets, registryNames, existingItems, creativeTabs = [], registrations = null) {
  const rawBlocks = [...assets.blockstates, ...assets.blockModels, ...assets.blockTextures]
  const { ids: mergedBlocks, variants: blockVariants } = groupBlockVariants(rawBlocks)
  const blockIds = new Set(mergedBlocks)
  const tabIds = new Set(creativeTabs)
  const itemIds = new Set([...assets.textures, ...assets.models, ...registryNames])
  for (const id of blockIds) itemIds.delete(id)
  for (const id of tabIds) itemIds.delete(id)

  // P5/P1：注册优先——能解析到注册项时，以注册名作为条目来源；实体等类型排除
  const registryMode = Boolean(registrations && (registrations.blocks.length || registrations.items.length))
  const foreignIds = foreignRegistrationIds(registrations)
  const incomingType = new Map()
  if (registryMode) {
    const regBlocks = new Set(registrations.blocks.filter((id) => !foreignIds.has(id)))
    const regItems = new Set(registrations.items.filter((id) => !regBlocks.has(id) && !foreignIds.has(id)))
    const regTabs = new Set(registrations.creativeTabs)
    for (const id of [...regBlocks].sort()) {
      if (!regTabs.has(id)) incomingType.set(id, 'block')
    }
    for (const id of [...regItems].sort()) {
      if (!regTabs.has(id)) incomingType.set(id, 'item')
    }
    for (const id of [...regTabs].sort()) incomingType.set(id, 'creative_tab')
  } else {
    for (const id of [...blockIds].sort()) incomingType.set(id, 'block')
    // 创造模式标签不是物品，单独归类；即使同名贴图存在也不当物品。
    for (const id of [...tabIds].sort()) incomingType.set(id, 'creative_tab')
    for (const id of [...itemIds].sort()) incomingType.set(id, 'item')
  }

  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  const created = []
  const kept = []
  const typeConflicts = []

  for (const [id, type] of incomingType) {
    const current = existingById.get(id)
    if (!current) { created.push({ id, type }); continue }
    if (current.type !== type) typeConflicts.push({ id, from: current.type, to: type })
    else kept.push({ id, type })
  }

  const missing = existingItems
    .filter((item) => !incomingType.has(item.id))
    .map((item) => ({ id: item.id, type: item.type }))

  // 资源扫描可解释、但不在注册表的旧条目：可以安全清理（P5）
  const resourceIds = new Set([
    ...assets.textures, ...assets.models,
    ...assets.blockTextures, ...assets.blockModels, ...assets.blockstates,
  ])
  const removed = registryMode
    ? existingItems
        .filter((item) => !incomingType.has(item.id) && (resourceIds.has(item.id) || foreignIds.has(item.id)))
        .map((item) => ({ id: item.id, type: item.type }))
    : []

  return {
    incoming: [...incomingType].map(([id, type]) => ({ id, type })),
    created,
    kept,
    typeConflicts,
    missing,
    removed,
    blocks: [...blockIds].sort(),
    variants: Object.fromEntries(blockVariants),
    registryMode,
    source: registryMode ? 'registry' : 'resource',
  }
}

/** 同一方块的部件后缀（门上下半、活板门、床、栅栏连接等）。 */
const VARIANT_SUFFIXES = ['_top', '_bottom', '_head', '_foot', '_inner', '_outer', '_corner', '_open']
/** wall 变体归并到本体（告示牌）。 */
const WALL_VARIANTS = [
  ['_wall_hanging_sign', '_hanging_sign'],
  ['_wall_sign', '_sign'],
]

/**
 * 把同一方块的形态归并到父 id：door_top/door_bottom → door，
 * crop_stage0..N → crop，oak_wall_sign → oak_sign。
 *
 * 只做「父 id 已存在」的归并，避免误伤独立方块。
 */
export function groupBlockVariants(ids) {
  const set = new Set(ids)
  const variants = new Map()
  const removed = new Set()
  const attach = (parent, child) => {
    removed.add(child)
    if (!variants.has(parent)) variants.set(parent, [])
    variants.get(parent).push(child)
  }
  for (const id of ids) {
    let grouped = false
    for (const [suffix, replacement] of WALL_VARIANTS) {
      if (!id.endsWith(suffix)) continue
      const parent = `${id.slice(0, -suffix.length)}${replacement}`
      if (set.has(parent)) { attach(parent, id); grouped = true; break }
    }
    if (grouped) continue
    const stage = id.match(/^(.*)_stage\d+$/)
    if (stage && set.has(stage[1])) { attach(stage[1], id); continue }
    for (const suffix of VARIANT_SUFFIXES) {
      if (!id.endsWith(suffix)) continue
      const parent = id.slice(0, -suffix.length)
      if (set.has(parent)) { attach(parent, id); break }
    }
  }
  return { ids: [...ids].filter((id) => !removed.has(id)), variants }
}

/** 按模式把扫描结果同步到 items/，返回统计。 */
async function syncEntries(path, modid, options = {}) {
  const mode = options.mode === 'overwrite' ? 'overwrite' : 'merge'
  const assets = await scanProjectAssets(path, modid)
  const registry = await scanRegistryNames(path)
  const registrations = await scanRegistrations(path)
  const existingItems = await listItems(path)
  const diff = diffEntries(assets, registry.items, existingItems, registry.creativeTabs, registrations)

  const now = new Date().toISOString()
  const existingById = new Map(existingItems.map((item) => [item.id, item]))
  const created = []
  const updated = []

  const buildDescription = (id, type) => {
    if (type === 'creative_tab') return '创造模式物品栏标签（不是物品）'
    const hasTexture = assets.textures.includes(id) || assets.blockTextures.includes(id)
    const hasModel = assets.models.includes(id) || assets.blockModels.includes(id)
    return [hasTexture ? '贴图已存在' : '缺贴图', hasModel ? '模型已存在' : '缺模型'].join('；')
  }

  // 新增条目（P2：合并从注册表达式提取的属性）
  const itemProps = await extractItemProps(path)
  for (const entry of diff.created) {
    const extracted = { ...(itemProps.properties?.[entry.id] ?? {}) }
    const { itemType, ...propPatch } = extracted
    const type = entry.type === 'item' && itemType && itemType !== 'item' ? itemType : entry.type
    const item = normalizeItem(
      {
        id: entry.id,
        displayName: entry.id,
        type,
        properties: { ...defaultProperties(), ...propPatch },
        description: buildDescription(entry.id, entry.type),
        createdAt: now,
        updatedAt: now,
      },
      entry.id,
    )
    await writeJson(join(itemsDir(path), `${entry.id}.json`), item)
    created.push(entry.id)
  }

  // 类型冲突：overwrite 模式全部改写；创造模式标签是旧版本误分类，
  // 即使 merge 也纠正为 creative_tab，其余字段保留。
  for (const conflict of diff.typeConflicts) {
    if (mode !== 'overwrite' && conflict.to !== 'creative_tab') continue
    const current = existingById.get(conflict.id)
    if (!current) continue
    const next = normalizeItem({ ...current, type: conflict.to, updatedAt: now }, conflict.id)
    await writeJson(join(itemsDir(path), `${conflict.id}.json`), next)
    updated.push(conflict.id)
  }

  // P2：已有条目只补空属性，不覆盖用户手改值
  const updatedSet = new Set(updated)
  for (const [id, extracted] of Object.entries(itemProps.properties ?? {})) {
    const current = existingById.get(id)
    if (!current || !extracted) continue
    const { itemType, ...extractedProps } = extracted
    const patch = {}
    for (const [key, value] of Object.entries(extractedProps)) {
      const present = current.properties?.[key]
      const empty = present === null || present === undefined || present === '' || present === 0
      if (empty) patch[key] = value
    }
    // 工具/武器/护甲：默认堆叠 64 改为 1
    if (itemType && ['tool', 'weapon', 'armor'].includes(itemType) && current.properties?.maxStackSize === 64) {
      patch.maxStackSize = 1
    }
    const typePatch = itemType && itemType !== 'item' && current.type === 'item' ? { type: itemType } : {}
    if (!Object.keys(patch).length && !Object.keys(typePatch).length) continue
    const next = normalizeItem({
      ...current,
      ...typePatch,
      properties: { ...current.properties, ...patch },
      updatedAt: now,
    }, id)
    await writeJson(join(itemsDir(path), `${id}.json`), next)
    if (!updatedSet.has(id)) {
      updated.push(id)
      updatedSet.add(id)
    }
  }

  // P5：清理「资源可解释但不在注册表」的自动残留（如 corn_crop_stageN）
  const deleted = []
  for (const entry of diff.removed ?? []) {
    const file = join(itemsDir(path), `${entry.id}.json`)
    const exists = await fsp.stat(file).then((stat) => stat.isFile()).catch(() => false)
    if (!exists) continue
    await fsp.rm(file, { force: true })
    deleted.push(entry.id)
  }

  await touchMeta(path)

  return {
    assets,
    registryNames: registry.items,
    creativeTabs: registry.creativeTabs,
    created,
    updated,
    kept: diff.kept.map((entry) => entry.id),
    typeConflicts: diff.typeConflicts,
    missing: diff.missing,
    removed: diff.removed,
    deleted,
    blocks: diff.blocks,
    registryMode: diff.registryMode,
    source: diff.source,
    mode,
  }
}

/**
 * 解析项目身份：gradle.properties 优先，描述文件兜底，表单输入最高优先。
 *
 * 规则：
 *   - modid / 名称 / 版本 在三处出现不同值时抛异常，要求人工介入；
 *   - 描述文件里的 `${...}` 占位符会先用 gradle.properties 解析，
 *     解析不出来按「未提供」处理，不参与冲突比对；
 *   - modid、minecraft_version、加载器版本三者全缺失时抛异常；
 *   - 其余字段缺失留空。
 */
async function resolveIdentity(projectPath, input = {}) {
  const gradle = await readGradleProperties(projectPath).catch(() => ({ exists: false, meta: null, props: {} }))
  const props = gradle?.props ?? {}
  const detected = await detectDescriptor(projectPath, props).catch(() => null)

  const g = gradle?.meta ?? null
  const d = detected ?? null

  /** 合并单个字段，冲突时记录。 */
  const conflicts = []
  const merge = (label, { form, gradleValue, descriptorValue, normalize = (v) => String(v).trim() }) => {
    const candidates = []
    if (form) candidates.push({ value: normalize(form), from: '导入表单' })
    if (gradleValue) candidates.push({ value: normalize(gradleValue), from: 'gradle.properties' })
    if (descriptorValue) candidates.push({ value: normalize(descriptorValue), from: '工程描述文件' })
    if (!candidates.length) return ''
    const distinct = new Set(candidates.map((c) => c.value.toLowerCase()))
    if (distinct.size > 1) conflicts.push({ field: label, values: candidates.map((c) => `${c.value}（${c.from}）`) })
    return candidates[0].value
  }

  const modid = merge('modid', {
    form: input.modid,
    gradleValue: g?.modid,
    descriptorValue: d?.modid,
    normalize: (v) => String(v).trim().toLowerCase(),
  })
  const name = merge('项目名称', { form: input.name, gradleValue: g?.name, descriptorValue: d?.name })
  const version = merge('版本', { form: input.version, gradleValue: g?.version, descriptorValue: d?.version })

  // 加载器：gradle 可判定时以其为准，否则用描述文件
  const loader = g?.loader || d?.loader || ''
  if (g?.loader && d?.loader && g.loader !== d.loader) {
    conflicts.push({
      field: '加载器',
      values: [`${g.loader}（gradle.properties）`, `${d.loader}（工程描述文件）`],
    })
  }

  const minecraft = g?.minecraft || MC_VERSION
  const minecraftRange = g?.minecraftRange || ''

  const loaderVersion = g?.neoVersion
    ? `NeoForge ${g.neoVersion}`
    : g?.forgeVersion
      ? `Forge ${g.forgeVersion}`
      : g?.loaderVersion
        ? `Fabric Loader ${g.loaderVersion}`
        : ''

  const loaderRange = g?.neoVersion || g?.forgeVersion || g?.loaderVersion || ''

  const missing = []
  if (!modid) missing.push('modid（mod_id / archives_base_name）')
  if (!minecraft && !minecraftRange) missing.push('minecraft_version')
  if (!loaderRange) missing.push('加载器版本（neo_version / forge_version / loader_version）')
  if (!loader) missing.push('加载器类型')

  if (conflicts.length) {
    const detail = conflicts.map((c) => `${c.field}：${c.values.join(' ≠ ')}`).join('；')
    throw new Error(`项目信息存在冲突，请修正后重试 —— ${detail}`)
  }
  if (missing.length) {
    throw new Error(
      `gradle.properties 与工程描述文件都缺少必要信息：${missing.join('、')}。`
      + '请在导入表单中手动填写 modid，或补全 gradle.properties。',
    )
  }
  if (!isValidModId(modid)) {
    throw new Error('无法确定合法的 modid，请在导入时手动填写')
  }

  // 记录判定过程中的关键结论，供界面与 agent 了解「系统替你做了什么判断」
  const notices = []
  if (!gradle?.exists) {
    notices.push({
      level: 'info',
      code: 'source.descriptor',
      message: '未找到 gradle.properties，元数据取自工程描述文件',
    })
  }
  if (g?.loader && d?.loader && g.loader === d.loader) {
    notices.push({
      level: 'info',
      code: 'loader.gradle',
      message: `加载器由 gradle.properties 判定为 ${loader}`,
    })
  } else if (g?.loader && d?.loader) {
    notices.push({
      level: 'info',
      code: 'loader.gradle',
      message: `加载器由 gradle.properties 判定为 ${loader}（描述文件写作 ${d.loader}）`,
    })
  } else if (d?.loader && !g?.loader) {
    notices.push({
      level: 'info',
      code: 'loader.descriptor',
      message: `加载器取自工程描述文件：${d.loader}`,
    })
  }
  if (d?.placeholders?.length) {
    notices.push({
      level: 'info',
      code: 'descriptor.placeholder',
      message: `描述文件中的占位符已用 gradle.properties 解析：${d.placeholders.join('、')}`,
    })
  }

  return {
    modid,
    name: name || modid,
    version: version || '0.1.0',
    description: g?.description || d?.description || '',
    loader,
    minecraft,
    minecraftRange,
    loaderVersion,
    loaderRange,
    authors: g?.authors || '',
    license: g?.license || '',
    group: g?.group || '',
    source: gradle?.exists ? 'gradle.properties' : 'descriptor',
    notices,
    conflicts: [],
    missing: [],
  }
}

/** 写出项目快照文档，返回相对路径。 */
export async function writeSnapshot(projectPath, info) {
  const meta = await readProjectMeta(projectPath)
  const assets = info.assets ?? {}
  const registryNames = info.registryNames ?? []
  const creativeTabs = info.creativeTabs ?? []
  const created = info.created ?? []
  const blocks = info.blocks ?? []
  const file = join(docsDir(projectPath), 'mcstudio-snapshot.md')

  const list = (key) => (Array.isArray(assets[key]) ? assets[key] : [])
  const lines = [
    `# 项目快照：${meta?.name ?? basename(projectPath)}`,
    '',
    `> 由「模组工坊」导入时自动生成于 ${new Date().toLocaleString('zh-CN')}。`,
    '',
    '## 基本信息',
    '',
    '| 项目 | 值 |',
    '| --- | --- |',
    `| 目录 | \`${projectPath}\` |`,
    `| modid | \`${meta?.modid ?? ''}\` |`,
    `| 名称 | ${meta?.name ?? ''} |`,
    `| 版本 | \`${meta?.version ?? ''}\` |`,
    `| 加载器 | \`${meta?.loader ?? ''}\` |`,
    `| 目标版本 | Minecraft ${meta?.minecraft ?? MC_VERSION} |`,
    meta?.minecraftRange ? `| MC 版本范围 | \`${meta.minecraftRange}\` |` : '',
    meta?.loaderVersion ? `| 加载器版本 | \`${meta.loaderVersion}\` |` : '',
    meta?.authors ? `| 作者 | ${meta.authors} |` : '',
    meta?.license ? `| 许可证 | \`${meta.license}\` |` : '',
    meta?.group ? `| 包名 / group | \`${meta.group}\` |` : '',
    meta?.source ? `| 信息来源 | ${meta.source} |` : '',
    '',
    '## 资源扫描',
    '',
    '| 类型 | 路径 | 数量 |',
    '| --- | --- | --- |',
    `| 物品贴图 | \`assets/<modid>/textures/item/\` | ${list('textures').length} |`,
    `| 方块贴图 | \`assets/<modid>/textures/block/\` | ${list('blockTextures').length} |`,
    `| 物品模型 | \`assets/<modid>/models/item/\` | ${list('models').length} |`,
    `| 方块模型 | \`assets/<modid>/models/block/\` | ${list('blockModels').length} |`,
    `| 方块状态 | \`assets/<modid>/blockstates/\` | ${list('blockstates').length} |`,
    `| 语言文件 | \`assets/<modid>/lang/\` | ${list('langs').length} |`,
    `| 配方 | \`data/<modid>/recipes/\` | ${list('recipes').length} |`,
    `| 战利品表 | \`data/<modid>/loot_tables/blocks/\` | ${list('lootTables').length} |`,
    `| 标签 | \`data/<modid>/tags/\` | ${list('tags').length} |`,
    `| 进度 | \`data/<modid>/advancements/\` | ${list('advancements').length} |`,
    `| Java 注册名（物品） | \`src/main/java/\` | ${registryNames.length} |`,
    `| 创造模式标签 | \`src/main/java/\` | ${creativeTabs.length} |`,
    '',
    `本次新建条目：${created.length} 个（方块 ${blocks.length} 个，创造模式标签 ${creativeTabs.filter((id) => created.includes(id)).length} 个）。`,
    '',
  ]

  const section = (title, values, render) => {
    if (!values.length) return
    lines.push(`### ${title}`, '', ...values.map(render), '')
  }

  section('物品贴图', list('textures'), (t) => `- \`textures/item/${t}.png\``)
  section('方块贴图', list('blockTextures'), (t) => `- \`textures/block/${t}.png\``)
  section('物品模型', list('models'), (m) => `- \`models/item/${m}.json\``)
  section('方块模型', list('blockModels'), (m) => `- \`models/block/${m}.json\``)
  section('方块状态', list('blockstates'), (b) => `- \`blockstates/${b}.json\``)
  section('语言文件', list('langs'), (l) => `- \`lang/${l}.json\``)
  section('配方', list('recipes'), (r) => `- \`recipes/${r}.json\``)
  section('战利品表', list('lootTables'), (l) => `- \`loot_tables/blocks/${l}.json\``)
  section('标签', list('tags'), (t) => `- \`tags/${t}.json\``)
  section('进度', list('advancements'), (a) => `- \`advancements/${a}.json\``)
  section('注册名清单', registryNames, (r) => `- \`${r}\``)
  section('创造模式标签', creativeTabs, (r) => `- \`${r}\``)

  if (list('namespaces').length) {
    lines.push(
      '### 检测到的命名空间',
      '',
      ...list('namespaces').map((ns) => `- \`${ns}\`${ns === meta?.modid ? '（本项目）' : '（其他，未纳入）'}`),
      '',
    )
  }

  await writeText(file, lines.join('\n'))
  return relative(projectPath, file).replace(/\\/g, '/')
}

/**
 * 清理「非注册」的自动条目（P5）。
 *
 * 只删除：类型为 block/item、不在注册表、且资源扫描可解释的条目；
 * 手动创建的条目（无对应资源）不受影响。dryRun 只返回候选。
 */
export async function pruneNonRegistryEntries(projectPath, options = {}) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')
  const registrations = await scanRegistrations(projectPath)
  const registryMode = Boolean(registrations.blocks.length || registrations.items.length)
  if (!registryMode) throw new Error('没有解析到注册项，无法清理（请确认 Java 源码包含 DeferredRegister）')
  const assets = await scanProjectAssets(projectPath, meta.modid)
  const resourceIds = new Set([
    ...assets.textures, ...assets.models,
    ...assets.blockTextures, ...assets.blockModels, ...assets.blockstates,
  ])
  const registryIds = new Set([...registrations.blocks, ...registrations.items])
  const foreignIds = foreignRegistrationIds(registrations)
  const items = await listItems(projectPath)
  const candidates = items.filter((item) => {
    if (item.type === 'creative_tab') return false
    if (registryIds.has(item.id)) return false
    return resourceIds.has(item.id) || foreignIds.has(item.id)
  }).map((item) => ({ id: item.id, type: item.type }))

  const removed = []
  if (options.dryRun !== true) {
    for (const item of candidates) {
      await fsp.rm(join(itemsDir(projectPath), `${item.id}.json`), { force: true })
      removed.push(item.id)
    }
    await touchMeta(projectPath)
  }
  return {
    registryMode,
    dryRun: options.dryRun === true,
    candidates,
    removed,
  }
}

