/**
 * 性能基准：100 物品 / 20 模块 / 50 模板任务的计划、上下文与结构读取。
 *
 * 用法：node scripts/benchmark.mjs
 * 输出：控制台表格 + JSON；不写入项目仓库，临时目录用完即删。
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import { dispatch } from '../lib/api.js'
import { forgetProject } from '../lib/registry.js'
import { readPlan, exportPlan, buildHandoff } from '../lib/workbench.js'
import { rebuildSummary } from '../lib/summary.js'
import { refreshStructure } from '../lib/structure.js'
import { packContext } from '../lib/context.js'

const ITEMS = 100
const MODULES = 20
const TASKS = 50

async function time(label, fn) {
  const start = performance.now()
  const value = await fn()
  return { label, ms: Math.round((performance.now() - start) * 100) / 100, value }
}

async function buildFixture() {
  const base = await mkdtemp(join(tmpdir(), 'mcmods-bench-'))
  const projectPath = join(base, 'bench')
  await dispatch('project.create', { path: projectPath, name: 'Bench', modid: 'benchmod', loader: 'forge' })
  for (let index = 0; index < ITEMS; index += 1) {
    await dispatch('items.save', {
      path: projectPath,
      item: { id: `item_${index}`, displayName: `Item ${index}`, type: 'item' },
    })
  }
  for (let index = 0; index < MODULES; index += 1) {
    await dispatch('modules.save', {
      path: projectPath,
      module: { id: `module-${index}`, name: `Module ${index}`, responsibility: `职责 ${index}` },
    })
    await dispatch('stages.save', {
      path: projectPath,
      stage: { id: `stage-${index}`, moduleId: `module-${index}`, name: `阶段 ${index}`, order: 0 },
    })
  }
  for (let index = 0; index < TASKS; index += 1) {
    await dispatch('tasks.save', {
      path: projectPath,
      task: {
        id: `task_${index}`,
        title: `Task ${index}`,
        moduleId: `module-${index % MODULES}`,
        stageId: `stage-${index % MODULES}`,
        allowedPaths: [`src/main/java/benchmod/task_${index}.java`],
      },
    })
  }
  return { base, projectPath }
}

const { base, projectPath } = await buildFixture()
const results = []
try {
  results.push(await time('workbench.plan', () => readPlan(projectPath)))
  results.push(await time('plan.export', () => exportPlan(projectPath)))
  results.push(await time('plan.handoff', () => buildHandoff(projectPath)))
  results.push(await time('summary.rebuild', () => rebuildSummary(projectPath)))
  results.push(await time('structure.refresh', () => refreshStructure(projectPath, { mode: 'static' })))
  results.push(await time('context.pack', () => packContext(projectPath, 'task_0')))
} finally {
  // fixture 只用于计时：先移除注册表登记，再删临时目录，避免污染项目列表。
  await forgetProject(projectPath).catch(() => {})
  await rm(base, { recursive: true, force: true })
}

console.log(`fixture: ${ITEMS} items / ${MODULES} modules / ${TASKS} tasks`)
for (const item of results) {
  console.log(`${item.label.padEnd(20)} ${String(item.ms).padStart(8)} ms`)
}
console.log(JSON.stringify({ fixture: { items: ITEMS, modules: MODULES, tasks: TASKS }, results: results.map(({ label, ms }) => ({ label, ms })) }, null, 2))
