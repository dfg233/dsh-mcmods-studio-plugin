/**
 * 检查器：任务级检查（允许路径、保护路径、结构差异、资源、注册配对、语言、编译）。
 *
 * 设计约束（见 docs/major/V0.3.0-PLAN.md 第 7 节）：
 *   - 检查由任务 `verify` 声明，执行者默认 host；
 *   - 结果结构：`{id, runner, status: pass|fail|skip, summary, details?}`；
 *   - 未注册的检查返回 skip，不阻断；
 *   - structure-diff 需要任务开始时的快照，缺失时降级为「未验证结构」。
 */

import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { dataDir, isFile, readJson } from './registry.js'
import { readProjectMeta } from './meta.js'
import { listItems } from './project.js'
import { readStructure, refreshStructure } from './structure.js'
import { listLanguages } from './lang.js'

const SNAPSHOT_DIR = 'cache/structure'
const IS_WINDOWS = process.platform === 'win32'

/* ── 路径匹配 ─────────────────────────────────────────────── */

function patternToRegex(pattern) {
  const text = String(pattern).replace(/\\/g, '/')
  const escaped = text.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const wildcards = escaped
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${wildcards}$`)
}

/** 判断路径是否匹配允许路径写法（支持 `*` 与 `**`）。 */
export function matchesPath(pattern, target) {
  return patternToRegex(pattern).test(String(target).replace(/\\/g, '/'))
}

function normalizePathSpec(spec) {
  if (typeof spec === 'string') return { path: spec.replace(/\\/g, '/'), mode: 'modify' }
  return {
    path: String(spec?.path ?? '').replace(/\\/g, '/'),
    mode: spec?.mode === 'create' ? 'create' : 'modify',
  }
}

function changesOf(task, options) {
  const list = Array.isArray(options.files) ? options.files : (task?.result?.files ?? [])
  return list
    .map((item) => ({ path: String(item?.path ?? '').replace(/\\/g, '/'), action: item?.action || item?.mode || 'modify' }))
    .filter((item) => item.path)
}

/* ── 检查实现 ─────────────────────────────────────────────── */

async function checkAllowedPaths(projectPath, task, options) {
  const changes = changesOf(task, options)
  if (!changes.length) return { status: 'skip', summary: '没有变更集，跳过允许路径检查' }
  const allowed = (task.allowedPaths ?? []).map(normalizePathSpec).filter((item) => item.path)
  if (!allowed.length) return { status: 'fail', summary: '任务没有声明 allowedPaths' }
  const violations = changes
    .filter((change) => !allowed.some((spec) => matchesPath(spec.path, change.path)))
    .map((change) => change.path)
  if (violations.length) {
    return {
      status: 'fail',
      summary: `越界修改 ${violations.length} 个文件：${violations.slice(0, 5).join(', ')}`,
      details: { violations },
    }
  }
  return { status: 'pass', summary: `${changes.length} 个变更均在允许路径内` }
}

async function checkGuardPaths(projectPath, task, options) {
  const changes = changesOf(task, options)
  const guards = (task.guardPaths ?? []).map(String)
  if (!guards.length) return { status: 'skip', summary: '没有 guardPaths' }
  if (!changes.length) return { status: 'skip', summary: '没有变更集，跳过保护路径检查' }
  const violations = changes
    .filter((change) => guards.some((guard) => matchesPath(guard, change.path)))
    .map((change) => change.path)
  if (violations.length) {
    return { status: 'fail', summary: `修改了保护路径：${violations.join(', ')}`, details: { violations } }
  }
  return { status: 'pass', summary: '保护路径未被修改' }
}

function hashText(text) {
  return createHash('sha256').update(String(text ?? '')).digest('hex').slice(0, 16)
}

function snapshotPath(projectPath, hash) {
  return join(dataDir(), SNAPSHOT_DIR, `${hash}.json`)
}

/** 保存当前结构快照，返回 hash；任务开始时调用。 */
export async function writeStructureSnapshot(projectPath) {
  const structure = await readStructure(projectPath)
  if (!structure) throw new Error('结构文档不存在，请先执行 structure.refresh')
  const text = JSON.stringify(structure)
  const hash = hashText(text)
  await fsp.mkdir(join(dataDir(), SNAPSHOT_DIR), { recursive: true })
  await fsp.writeFile(snapshotPath(projectPath, hash), text, 'utf8')
  return hash
}

function structureFiles(structure) {
  const map = new Map()
  for (const file of structure?.files ?? []) {
    const classes = (file.classes ?? []).map((cls) => cls.name).sort()
    map.set(file.path, classes)
  }
  return map
}

async function checkStructureDiff(projectPath, task, options) {
  const hash = task.baseStructureHash
  if (!hash) return { status: 'skip', summary: '任务没有 baseStructureHash，未验证结构' }
  const snapshot = await readJson(snapshotPath(projectPath, hash), null)
  if (!snapshot) return { status: 'skip', summary: `找不到结构快照 ${hash}，未验证结构` }

  await refreshStructure(projectPath).catch(() => {})
  const current = await readStructure(projectPath)
  if (!current) return { status: 'fail', summary: '无法读取当前结构文档' }

  const before = structureFiles(snapshot)
  const after = structureFiles(current)
  const allowed = (task.allowedPaths ?? []).map(normalizePathSpec).filter((item) => item.path)
  const guard = (task.guardPaths ?? []).map(String)
  const problems = []
  const warnings = []

  const allPaths = new Set([...before.keys(), ...after.keys()])
  for (const path of allPaths) {
    const oldClasses = before.get(path) ?? null
    const newClasses = after.get(path) ?? null
    if (oldClasses === null && newClasses !== null) {
      if (!allowed.some((spec) => matchesPath(spec.path, path))) problems.push(`新增文件不在允许路径：${path}`)
    } else if (oldClasses !== null && newClasses === null) {
      if (!allowed.some((spec) => matchesPath(spec.path, path))) problems.push(`删除文件不在允许路径：${path}`)
    } else if (oldClasses && newClasses && oldClasses.join(',') !== newClasses.join(',')) {
      if (guard.some((item) => matchesPath(item, path))) problems.push(`保护路径的类发生变化：${path}`)
      else warnings.push(`类变化：${path}`)
    }
  }

  if (problems.length) {
    return { status: 'fail', summary: problems.slice(0, 3).join('；'), details: { problems, warnings } }
  }
  return {
    status: 'pass',
    summary: warnings.length ? `结构变化在允许范围内（${warnings.length} 处警告）` : '结构变化符合任务范围',
    details: { warnings },
  }
}

async function checkResourceExists(projectPath, task, options) {
  const changes = changesOf(task, options)
  if (!changes.length) return { status: 'skip', summary: '没有变更集，跳过资源检查' }
  const resources = changes.filter((change) => /\.(json|png|mcmeta|ogg)$/i.test(change.path))
  if (!resources.length) return { status: 'skip', summary: '没有资源文件变更' }
  const missing = []
  for (const resource of resources) {
    if (!(await isFile(join(projectPath, resource.path)))) missing.push(resource.path)
  }
  if (missing.length) {
    return { status: 'fail', summary: `资源文件缺失：${missing.join(', ')}`, details: { missing } }
  }
  return { status: 'pass', summary: `${resources.length} 个资源文件存在` }
}

async function checkRegistrationPair(projectPath, task) {
  const meta = await readProjectMeta(projectPath).catch(() => null)
  if (!meta) return { status: 'fail', summary: '项目不存在' }
  const items = await listItems(projectPath).catch(() => [])
  const missing = []
  for (const item of items) {
    if (item.type === 'block') {
      const blockstate = join(projectPath, 'src/main/resources/assets', meta.modid, 'blockstates', `${item.id}.json`)
      if (!(await isFile(blockstate))) missing.push(`${meta.modid}:${item.id} 缺少 blockstate`)
    } else {
      const model = join(projectPath, 'src/main/resources/assets', meta.modid, 'models/item', `${item.id}.json`)
      if (!(await isFile(model))) missing.push(`${meta.modid}:${item.id} 缺少物品模型`)
    }
  }
  if (missing.length) {
    return { status: 'fail', summary: missing.slice(0, 5).join('；'), details: { missing } }
  }
  return { status: 'pass', summary: `${items.length} 个物品/方块的资源配对正常` }
}

async function checkLangKey(projectPath, task) {
  const languages = await listLanguages(projectPath).catch(() => null)
  if (!languages) return { status: 'skip', summary: '无法读取语言文件' }
  const missing = languages.entries.filter((entry) => entry.keyMissing || !entry.zh || !entry.en)
  if (missing.length) {
    return {
      status: 'fail',
      summary: `语言键缺失：${missing.slice(0, 5).map((entry) => entry.key).join(', ')}`,
      details: { missing: missing.map((entry) => entry.key) },
    }
  }
  return { status: 'pass', summary: `${languages.entries.length} 个语言键完整` }
}

function runCommand(command, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: IS_WINDOWS, windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error((stderr || stdout).split(/\r?\n/).slice(0, 20).join('\n')))
    })
  })
}

async function checkCompileJava(projectPath, task, options) {
  if (options.compile === false) return { status: 'skip', summary: '编译检查已关闭' }
  const hasBat = await isFile(join(projectPath, 'gradlew.bat'))
  const hasSh = await isFile(join(projectPath, 'gradlew'))
  if (!hasBat && !hasSh) return { status: 'skip', summary: '项目没有 gradlew，跳过编译检查' }
  const wrapper = hasBat ? 'gradlew.bat' : './gradlew'
  try {
    const output = await runCommand(wrapper, ['compileJava', '--offline', '--console=plain', '-q'], projectPath, 120000)
    return { status: 'pass', summary: output.trim() ? output.split(/\r?\n/).slice(-3).join(' ') : 'compileJava 通过' }
  } catch (error) {
    return { status: 'fail', summary: `compileJava 失败：${error.message.split(/\r?\n/).slice(0, 5).join(' ')}` }
  }
}

/** 已注册的检查。 */
export const CHECKS = {
  'allowed-paths': checkAllowedPaths,
  'guard-paths': checkGuardPaths,
  'structure-diff': checkStructureDiff,
  'resource-exists': checkResourceExists,
  'registration-pair': checkRegistrationPair,
  'lang-key': checkLangKey,
  'compile-java': checkCompileJava,
}

/** 检查 id 列表（供界面与文档）。 */
export function listCheckIds() {
  return Object.keys(CHECKS)
}

function normalizeVerify(verify) {
  if (!Array.isArray(verify)) return []
  return verify.map((item) => {
    if (typeof item === 'string') return { id: item, runner: 'host' }
    return { id: String(item?.id ?? ''), runner: item?.runner || 'host' }
  }).filter((item) => item.id)
}

/**
 * 执行任务声明的检查。
 *
 * @param {string} projectPath
 * @param {object} task
 * @param {{files?: Array, compile?: boolean}} [options]
 */
export async function runChecks(projectPath, task, options = {}) {
  const specs = normalizeVerify(task?.verify)
  const results = []
  for (const spec of specs) {
    const impl = CHECKS[spec.id]
    if (!impl) {
      results.push({ id: spec.id, runner: spec.runner, status: 'skip', summary: '未注册的检查' })
      continue
    }
    if (spec.runner !== 'host') {
      results.push({ id: spec.id, runner: spec.runner, status: 'skip', summary: `${spec.runner} 检查未在本地执行` })
      continue
    }
    try {
      const result = await impl(projectPath, task, options)
      results.push({
        id: spec.id,
        runner: spec.runner,
        status: result.status || 'pass',
        summary: result.summary || '',
        ...(result.details ? { details: result.details } : {}),
      })
    } catch (error) {
      results.push({ id: spec.id, runner: spec.runner, status: 'fail', summary: error.message })
    }
  }
  return results
}
