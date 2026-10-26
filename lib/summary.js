/**
 * 项目摘要（`.mcstudio/summary.json`）。
 *
 * 用途：让 agent 一次读取掌握项目全貌，不必逐个读 project.json、
 * features.json、items/*.json。它同时是派生数据——损坏或缺失都能重建。
 *
 * 体积参考：12 个物品 + 8 条构想约 1.2 KB，
 * 而逐文件读取约 8 KB（12 个物品文件各约 400 字节，加元数据与构想）。
 */

import { join } from 'node:path'

import { writeJson } from './registry.js'
import { projectDataDir } from './paths.js'
import { readProjectMeta } from './meta.js'
import { listFeatures, listItems } from './entries.js'
import { listAssets } from './assets.js'

/** 摘要文件名。 */
export const SUMMARY_FILE = 'summary.json'

/** 摘要文件路径。 */
export function summaryFile(projectPath) {
  return join(projectDataDir(projectPath), SUMMARY_FILE)
}

/**
 * 重建摘要并写盘。
 *
 * 返回的对象同时用于接口响应，因此字段只保留 agent 需要的最小集合：
 * id、名称、类型、状态，不包含 19 个属性字段。
 */
export async function rebuildSummary(projectPath) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('该目录不是「模组工坊」项目')

  const features = await listFeatures(projectPath)
  const items = await listItems(projectPath)
  const assets = await listAssets(projectPath).catch(() => null)

  const summary = {
    schemaVersion: 1,
    meta: {
      name: meta.name,
      modid: meta.modid,
      version: meta.version,
      loader: meta.loader,
      minecraft: meta.minecraft,
      loaderVersion: meta.loaderVersion || '',
    },
    counts: {
      ideas: features.length,
      ideasDone: features.filter((item) => item.status === 'done').length,
      items: items.filter((item) => item.type !== 'block').length,
      blocks: items.filter((item) => item.type === 'block').length,
      totalEntries: items.length,
    },
    ideas: features.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      priority: item.priority,
    })),
    items: items.map((item) => {
      const hasTexture = Boolean(assets?.textures?.some((entry) => entry.id === item.id))
      const hasModel = Boolean(assets?.models?.some((entry) => entry.id === item.id))
      return {
        id: item.id,
        name: item.displayName,
        type: item.type,
        texture: hasTexture,
        model: hasModel,
      }
    }),
    missing: assets ? { ids: assets.missing, count: assets.missing.length } : { ids: [], count: 0 },
    updatedAt: new Date().toISOString(),
  }

  await writeJson(summaryFile(projectPath), summary)
  return summary
}
