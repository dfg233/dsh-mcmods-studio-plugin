/**
 * 任务上下文包：把任务需要的签名、代码、资源与约束裁进预算。
 *
 * 设计约束（见 docs/major/V0.3.0-PLAN.md 第 6 节）：
 *   - 默认预算：10 个文件、12KB、20 个 API 类；
 *   - 超限时按 resources → class excerpt → api 的顺序裁剪，并记录 truncated；
 *   - 没有 API 索引时标记 apiUnknown，不假装知道；
 *   - codeRefs 从 structure.json 解析到路径与摘录。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { listSystems, listTasks } from './workbench.js'
import { readStructure } from './structure.js'
import { apiContext } from './api-index.js'
import { getTemplate } from './templates.js'

const DEFAULT_BUDGET = { files: 10, bytes: 12000, apiClasses: 20, apiBytes: 4096 }
const MAX_BYTES = 256 * 1024

/** UTF-8 字节数（P5：不再用字符串长度冒充字节）。 */
function byteLength(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return Buffer.byteLength(text ?? '', 'utf8')
}

function normalizeBudget(input = {}) {
  const bytes = Number(input.bytes) || DEFAULT_BUDGET.bytes
  const apiBytes = Number(input.apiBytes) || DEFAULT_BUDGET.apiBytes
  return {
    files: Math.max(1, Number(input.files) || DEFAULT_BUDGET.files),
    bytes: Math.min(MAX_BYTES, Math.max(1024, bytes)),
    apiClasses: Math.max(1, Number(input.apiClasses) || DEFAULT_BUDGET.apiClasses),
    apiBytes: Math.min(MAX_BYTES, Math.max(1024, apiBytes)),
  }
}

function stripPrefix(ref) {
  return String(ref ?? '').replace(/^class:/, '').trim()
}

function findClassInStructure(structure, ref) {
  const name = stripPrefix(ref)
  if (!structure || !Array.isArray(structure.files)) return null
  for (const file of structure.files) {
    for (const cls of file.classes ?? []) {
      if (cls.name === name || cls.name === `class:${name}`) {
        return { path: file.path, name: cls.name }
      }
    }
  }
  return null
}

async function readExcerpt(projectPath, relPath) {
  const text = await fsp.readFile(join(projectPath, relPath), 'utf8').catch(() => '')
  if (!text) return ''
  return text.split(/\r?\n/).slice(0, 40).join('\n')
}

function normalizePaths(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    if (typeof item === 'string') return { path: item, mode: 'modify' }
    return { path: String(item?.path ?? ''), mode: item?.mode === 'create' ? 'create' : 'modify' }
  }).filter((item) => item.path)
}

function collectResources(task) {
  // 模板文件已由 templates[].files 描述，不重复计入 resources（避免占用文件预算）。
  const resources = []
  for (const ref of task.contextRefs ?? []) {
    const text = String(ref ?? '')
    if (text.startsWith('resource:')) {
      resources.push({ path: text.slice('resource:'.length), kind: 'resource' })
    }
  }
  return resources
}

function trimContext(context, budget, truncated) {
  // 1) 文件数：classes + resources 超过预算时先截 resources，再截 classes。
  const fileCount = () => context.classes.length + context.resources.length
  while (fileCount() > budget.files && context.resources.length) {
    const removed = context.resources.pop()
    truncated.push({ id: removed.path, reason: 'file-budget' })
  }
  while (fileCount() > budget.files && context.classes.length) {
    const removed = context.classes.pop()
    truncated.push({ id: removed.id, reason: 'file-budget' })
  }

  // 2) 字节数（UTF-8）：先截长文本，再去 excerpt，再裁 api，最后保留最小签名。
  const trimText = (value, max, id) => {
    if (typeof value !== 'string' || byteLength(value) <= max) return value
    truncated.push({ id, reason: 'byte-budget' })
    let cut = value
    while (byteLength(cut) > max) cut = cut.slice(0, Math.max(0, cut.length - 1))
    return `${cut}…`
  }
  if (byteLength(context) > budget.bytes) {
    context.task.goal = trimText(context.task.goal, 800, 'task.goal')
    context.task.acceptance = (context.task.acceptance ?? []).map((entry, index) => trimText(entry, 200, `acceptance[${index}]`))
    context.task.nonGoals = (context.task.nonGoals ?? []).map((entry, index) => trimText(entry, 200, `nonGoals[${index}]`))
  }
  if (byteLength(context) > budget.bytes) {
    for (const cls of context.classes) {
      if (cls.excerpt) {
        cls.excerpt = ''
        truncated.push({ id: cls.id, reason: 'byte-budget' })
      }
    }
  }
  while (byteLength(context) > budget.bytes && context.api.length > 1) {
    const removed = context.api.pop()
    truncated.push({ id: removed.name, reason: 'byte-budget' })
  }
  if (byteLength(context) > budget.bytes && context.api.length) {
    context.api = context.api.map((cls) => ({ name: cls.name, kind: cls.kind, methods: [], fields: [] }))
    truncated.push({ id: 'api-signatures', reason: 'byte-budget' })
  }

  // 3) 兜底：最小元数据仍超时，继续清列表与次要字段
  if (byteLength(context) > budget.bytes) {
    context.task.acceptance = []
    context.task.nonGoals = []
    context.task.verify = []
    truncated.push({ id: 'task.lists', reason: 'byte-budget' })
  }
  if (byteLength(context) > budget.bytes) {
    context.system = context.system ? { id: context.system.id } : null
    context.templates = context.templates.map((template) => ({ id: template.id, version: template.version }))
    context.invariants = []
    truncated.push({ id: 'minimal-meta', reason: 'byte-budget' })
  }
  if (byteLength(context) > budget.bytes) {
    context.resources = []
    context.classes = []
    context.codeRefs = []
    context.allowedPaths = context.allowedPaths.slice(0, 10)
    context.guardPaths = context.guardPaths.slice(0, 10)
    truncated.push({ id: 'resources/classes', reason: 'byte-budget' })
  }
  if (byteLength(context) > budget.bytes) {
    context.task = { id: context.task.id, title: context.task.title, status: context.task.status }
    truncated.push({ id: 'task.minimal', reason: 'byte-budget' })
  }

  const used = byteLength(context)
  context.budget = {
    ...budget,
    used,
    truncated,
    overBudget: used > budget.bytes,
    ...(used > budget.bytes ? { error: `上下文超过预算（${used} > ${budget.bytes} 字节）` } : {}),
  }
  return context
}

/**
 * 打包任务上下文。
 *
 * @param {string} projectPath
 * @param {string} taskId
 * @param {{budget?: object}} [options]
 */
export async function packContext(projectPath, taskId, options = {}) {
  const budget = normalizeBudget(options.budget)
  const tasks = await listTasks(projectPath)
  const task = tasks.find((item) => item.id === taskId)
  if (!task) throw new Error(`任务不存在：${taskId}`)

  const systems = await listSystems(projectPath)
  const system = systems.find((item) => item.id === task.systemId) ?? null

  const templates = []
  const apiRefs = new Set(Array.isArray(task.apiRefs) ? task.apiRefs : [])
  for (const ref of task.templateRefs ?? []) {
    const manifest = await getTemplate(ref.id).catch(() => null)
    if (!manifest) continue
    templates.push({
      id: manifest.id,
      version: ref.version ?? manifest.version,
      name: manifest.name,
      parameters: ref.parameters ?? {},
      files: (manifest.files ?? []).map((file) => file.path),
    })
    for (const apiRef of manifest.apiRefs ?? []) apiRefs.add(apiRef)
  }

  const api = apiRefs.size
    ? await apiContext(projectPath, [...apiRefs], {
      apiClasses: budget.apiClasses,
      apiBytes: budget.apiBytes,
    })
    : { available: false, apiUnknown: true, classes: [], truncated: [] }

  const structure = await readStructure(projectPath)
  const classes = []
  const missingRefs = []
  for (const ref of task.codeRefs ?? []) {
    const found = findClassInStructure(structure, ref)
    if (!found) {
      missingRefs.push(ref)
      continue
    }
    classes.push({
      id: ref,
      path: found.path,
      className: found.name,
      excerpt: await readExcerpt(projectPath, found.path),
    })
  }

  const context = {
    task: {
      id: task.id,
      title: task.title,
      goal: task.goal,
      nonGoals: task.nonGoals ?? [],
      acceptance: task.acceptance ?? [],
      verify: task.verify ?? [],
      status: task.status,
    },
    system: system
      ? { id: system.id, name: system.name, responsibility: system.responsibility ?? '', invariants: system.invariants ?? [] }
      : null,
    templates,
    api: api.classes ?? [],
    classes,
    resources: collectResources(task),
    invariants: Array.isArray(system?.invariants) ? system.invariants : [],
    allowedPaths: normalizePaths(task.allowedPaths),
    guardPaths: (task.guardPaths ?? []).map(String),
    codeRefs: (task.codeRefs ?? []).map((ref) => ({ id: ref })),
    apiUnknown: !api.available,
    missingRefs,
    budget,
  }

  return trimContext(context, budget, [])
}
