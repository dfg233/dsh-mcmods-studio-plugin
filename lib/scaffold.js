/**
 * Gradle 脚手架：为新建项目生成完整可编译的 MC 工程。
 *
 * 设计约束（见 docs/major/V0.4.0-PLAN.md 第 7 节）：
 *   - 参数由 AI 推断或用户显式提供，推断失败回退表单，不猜；
 *   - 只覆盖版本矩阵内的组合（1.20.1 × forge / neoforge / fabric）；
 *   - 已存在文件默认跳过，不覆盖用户已有工程；
 *   - 写入前记录 created 列表，失败时删除本次新增文件；
 *   - 构建验证可选（verifyBuild），失败不误报成功。
 */

import { promises as fsp } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isFile, readJson } from './registry.js'
import { readProjectMeta } from './meta.js'
import { refreshStructure } from './structure.js'
import { listMatrix, resolveMatrix, SUPPORTED_MC } from './version-matrix.js'

const here = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_ROOT = join(here, '..', 'templates', 'scaffold')

const MODID_RE = /^[a-z][a-z0-9_]{1,63}$/
const LOADERS = ['forge', 'neoforge', 'fabric']

function pascal(text) {
  return String(text)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function slug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

function renderText(text, params) {
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = params[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

async function walkFiles(root, base = root, out = []) {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) await walkFiles(full, base, out)
    else if (entry.isFile()) out.push(full.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out
}

/** 读取某组合的模板文件（文本 .tpl + shared 二进制）。 */
export async function listTemplateFiles(loader, minecraft = SUPPORTED_MC) {
  const dir = join(TEMPLATE_ROOT, loader, minecraft)
  const files = []
  for (const rel of await walkFiles(dir)) {
    if (!rel.endsWith('.tpl')) continue
    const content = await fsp.readFile(join(dir, rel), 'utf8').catch(() => '')
    files.push({ path: rel.slice(0, -4), content, binary: false })
  }
  const sharedDir = join(TEMPLATE_ROOT, 'shared')
  for (const rel of await walkFiles(sharedDir)) {
    files.push({ path: rel, binary: true, source: join(sharedDir, rel) })
  }
  return files
}

/** 从 description / 显式字段推断脚手架参数。 */
export function inferParams(input = {}, meta = null) {
  const description = String(input.description ?? '')
  const lower = description.toLowerCase()

  let loader = String(input.loader ?? '').trim().toLowerCase()
  if (!loader) {
    if (lower.includes('neoforge')) loader = 'neoforge'
    else if (lower.includes('fabric')) loader = 'fabric'
    else if (lower.includes('forge')) loader = 'forge'
    else loader = 'forge'
  }
  if (!LOADERS.includes(loader)) {
    throw new Error(`不支持的组合：${loader} / ${input.minecraft ?? SUPPORTED_MC}；可用：${listMatrix().map((item) => `${item.loader}/${item.minecraft}`).join(', ')}`)
  }

  let minecraft = String(input.minecraft ?? '').trim()
  if (!minecraft) {
    const match = description.match(/1\.\d+(?:\.\d+)?/)
    minecraft = match ? match[0] : SUPPORTED_MC
  }
  const matrix = resolveMatrix(loader, minecraft)
  if (!matrix) {
    throw new Error(`不支持的组合：${loader} / ${minecraft}；可用：${listMatrix().map((item) => `${item.loader}/${item.minecraft}`).join(', ')}`)
  }

  const name = String(input.name ?? meta?.name ?? '').trim()
  let modid = String(input.modid ?? meta?.modid ?? '').trim().toLowerCase()
  if (!modid) modid = slug(name) || 'examplemod'
  if (!MODID_RE.test(modid)) throw new Error('modid 只能包含小写字母、数字和下划线，长度 2-64')

  const packageName = String(input.package ?? meta?.group ?? '').trim() || `com.example.${modid}`
  const className = String(input.ClassName ?? '').trim() || `${pascal(modid)}Mod`
  const version = String(input.version ?? meta?.version ?? '1.0.0').trim()
  const authors = String(input.authors ?? meta?.authors ?? '').trim()
  const license = String(input.license ?? meta?.license ?? 'All Rights Reserved').trim()
  const descriptionText = String(input.modDescription ?? input.summary ?? description).trim()

  return {
    loader,
    minecraft,
    loaderVersion: matrix.loaderVersion,
    fabricVersion: matrix.fabricVersion ?? '',
    mappings: matrix.mappings,
    javaVersion: String(matrix.javaVersion),
    gradleVersion: matrix.gradleVersion,
    modid,
    name: name || modid,
    version,
    package: packageName,
    packagePath: packageName.replace(/\./g, '/'),
    ClassName: className,
    authors,
    license,
    modDescription: descriptionText || `${name || modid} 模组`,
    description,
  }
}

function ensureInside(projectPath, target) {
  const root = resolve(projectPath)
  const full = resolve(root, target)
  if (full !== root && !full.startsWith(root + sep)) throw new Error(`脚手架路径越界：${target}`)
  return full
}

/**
 * 预览脚手架：返回参数与逐文件动作，不写盘。
 */
export async function previewScaffold(projectPath, input = {}) {
  const meta = await readProjectMeta(projectPath)
  const params = inferParams(input, meta)
  const templates = await listTemplateFiles(params.loader, params.minecraft)

  const files = []
  const conflicts = []
  for (const template of templates) {
    const relPath = renderText(template.path, params).replace(/\\/g, '/')
    const target = ensureInside(projectPath, relPath)
    const exists = await isFile(target)
    const action = exists ? 'skip' : 'create'
    if (exists) conflicts.push({ path: relPath, reason: '已存在，默认不覆盖' })
    files.push({
      path: relPath,
      action,
      binary: template.binary,
      ...(template.binary ? {} : { content: renderText(template.content, params) }),
    })
  }

  return { params, files, conflicts, templateRoot: TEMPLATE_ROOT }
}

function runCommand(command, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: process.env,
    })
    let output = ''
    let errorText = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`命令超时（${timeoutMs}ms）`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { errorText += chunk })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error((errorText || output).split(/\r?\n/).slice(0, 20).join('\n')))
    })
  })
}

async function verifyBuild(projectPath) {
  const hasBat = await isFile(join(projectPath, 'gradlew.bat'))
  const hasSh = await isFile(join(projectPath, 'gradlew'))
  if (!hasBat && !hasSh) return { verified: false, error: '工程没有 gradlew，无法验证构建' }
  const wrapper = hasBat ? 'gradlew.bat' : './gradlew'
  try {
    await runCommand(wrapper, ['compileJava', '--console=plain', '-q'], projectPath, 180000)
    return { verified: true, error: '' }
  } catch (error) {
    return { verified: false, error: error.message }
  }
}

/**
 * 应用脚手架：写入缺失文件，刷新结构，可选验证构建；失败删除本次新增文件。
 */
export async function applyScaffold(projectPath, input = {}) {
  const preview = await previewScaffold(projectPath, input)
  const writes = preview.files.filter((file) => file.action === 'create')
  const created = []
  try {
    for (const file of writes) {
      const target = ensureInside(projectPath, file.path)
      await fsp.mkdir(dirname(target), { recursive: true })
      if (file.binary) {
        const source = join(TEMPLATE_ROOT, 'shared', file.path)
        await fsp.copyFile(source, target)
      } else {
        await fsp.writeFile(target, file.content, 'utf8')
      }
      created.push(file.path)
    }
    await refreshStructure(projectPath).catch(() => {})
  } catch (error) {
    for (const relPath of created) {
      await fsp.rm(join(projectPath, relPath), { force: true }).catch(() => {})
    }
    throw error
  }

  let build = { verified: null, error: '' }
  if (input.verifyBuild) {
    build = await verifyBuild(projectPath)
  }

  return {
    params: preview.params,
    files: preview.files,
    conflicts: preview.conflicts,
    created,
    skipped: preview.files.length - writes.length,
    buildVerified: build.verified,
    buildError: build.error,
  }
}

/** 读取项目里已存在的 gradle 工程标记（供向导判断是否已是工程）。 */
export async function readScaffoldState(projectPath) {
  const checks = ['build.gradle', 'settings.gradle', 'gradlew', 'gradlew.bat', 'gradle.properties']
  const state = {}
  for (const name of checks) state[name] = await isFile(join(projectPath, name))
  return state
}
