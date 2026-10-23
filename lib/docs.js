/**
 * Markdown 文档导出。
 *
 * 每个项目导出到 `<project>/docs/`：
 *   - FEATURES.md       模组构想清单
 *   - ITEMS.md          物品总览
 *   - ITEMS/<id>.md     单个物品的属性文档
 *   - ASSETS.md         贴图与模型清单（含缺失提示）
 *   - README.md         文档索引
 *
 * 文档内容完全来自 `.mcstudio/` 中的数据，可安全地提交进 git。
 */

import { join } from 'node:path'
import { promises as fsp } from 'node:fs'

import { writeText } from './registry.js'
import {
  FEATURE_PRIORITY,
  FEATURE_STATUS,
  ITEM_FIELDS,
  ITEM_TYPES,
  LOADERS,
  MC_VERSION,
  docsDir,
  listFeatures,
  listItems,
  readProjectMeta,
} from './project.js'
import { listAssets } from './assets.js'

/** 状态标签。 */
function statusLabel(id) {
  return FEATURE_STATUS.find((s) => s.id === id)?.label ?? id
}

/** 优先级标签。 */
function priorityLabel(id) {
  return FEATURE_PRIORITY.find((p) => p.id === id)?.label ?? id
}

/** 类型标签。 */
function typeLabel(id) {
  return ITEM_TYPES.find((t) => t.id === id)?.label ?? id
}

/** 加载器标签。 */
function loaderLabel(id) {
  return LOADERS.find((l) => l.id === id)?.label ?? id
}

/** 把属性值格式化为可读文本。 */
function formatValue(field, value) {
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'boolean') return value ? '是' : '否'
  if (field.type === 'select') {
    return field.options?.find((o) => o.value === value)?.label ?? String(value)
  }
  if (field.type === 'tags') {
    return Array.isArray(value) && value.length ? value.map((v) => `\`${v}\``).join('、') : '—'
  }
  if (field.type === 'number') return `${value}${field.unit ? ` ${field.unit}` : ''}`
  return String(value)
}

/** 转义表格单元格。 */
function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** 生成构想文档。 */
function renderFeatures(meta, features) {
  const lines = [
    `# ${meta.name} — 构想`,
    '',
    `> modid：\`${meta.modid}\` · 目标：Minecraft ${MC_VERSION} / ${loaderLabel(meta.loader)} · 生成时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    `共 ${features.length} 项构想。`,
    '',
    '| 构想 | 状态 | 优先级 | 目标版本 | 说明 |',
    '| --- | --- | --- | --- | --- |',
  ]
  if (features.length === 0) {
    lines.push('| — | — | — | — | 暂无功能 |')
  }
  for (const feature of features) {
    lines.push(
      `| ${cell(feature.name)} | ${statusLabel(feature.status)} | ${priorityLabel(feature.priority)} | ${cell(feature.version || '—')} | ${cell(feature.description)} |`,
    )
  }
  lines.push('')
  if (features.length) {
    lines.push('## 按状态汇总', '')
    for (const status of FEATURE_STATUS) {
      const group = features.filter((f) => f.status === status.id)
      if (!group.length) continue
      lines.push(`### ${status.label}（${group.length}）`, '')
      for (const feature of group) {
        lines.push(`- **${feature.name}**${feature.version ? `（目标 ${feature.version}）` : ''}${feature.description ? `：${feature.description}` : ''}`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}

/** 生成物品总览文档。 */
function renderItemsIndex(meta, items) {
  const lines = [
    `# ${meta.name} — 物品清单`,
    '',
    `> modid：\`${meta.modid}\` · 共 ${items.length} 个物品 · 生成时间：${new Date().toLocaleString('zh-CN')}`,
    '',
    '| 注册名 | 显示名 | 类型 | 最大堆叠 | 耐久 | 渲染 |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  if (items.length === 0) {
    lines.push('| — | — | — | — | — | 暂无物品 |')
  }
  for (const item of items) {
    const p = item.properties
    lines.push(
      `| \`${item.id}\` | ${cell(item.displayName)} | ${typeLabel(item.type)} | ${p.maxStackSize} | ${p.maxDamage > 0 ? p.maxDamage : '—'} | ${p.renderType} |`,
    )
  }
  lines.push('', '单个物品的完整属性见 `ITEMS/<注册名>.md`。', '')
  return lines.join('\n')
}

/** 生成单个物品的属性文档。 */
function renderItem(meta, item) {
  const lines = [
    `# ${item.displayName}（\`${item.id}\`）`,
    '',
    `> 项目 ${meta.name} · modid \`${meta.modid}\` · 类型：${typeLabel(item.type)}`,
    '',
  ]
  if (item.description) lines.push(item.description, '')

  const groups = []
  for (const field of ITEM_FIELDS) {
    if (!groups.includes(field.group)) groups.push(field.group)
  }
  for (const group of groups) {
    lines.push(`## ${group}`, '', '| 属性 | 值 | 说明 |', '| --- | --- | --- |')
    for (const field of ITEM_FIELDS.filter((f) => f.group === group)) {
      lines.push(
        `| ${field.label} | ${cell(formatValue(field, item.properties[field.key]))} | ${cell(field.hint)} |`,
      )
    }
    lines.push('')
  }

  if (item.tags?.length) {
    lines.push('## 自定义标签', '', ...item.tags.map((t) => `- \`${t}\``), '')
  }
  if (item.notes) lines.push('## 备注', '', item.notes, '')
  return lines.join('\n')
}

/** 生成素材清单文档。 */
function renderAssets(meta, assets) {
  const lines = [
    `# ${meta.name} — 贴图与模型`,
    '',
    `> modid：\`${meta.modid}\` · 素材根目录：\`${assets.root}\``,
    '',
    '## 贴图',
    '',
    '| 物品 | 尺寸 | 大小 | 路径 |',
    '| --- | --- | --- | --- |',
  ]
  if (!assets.textures.length) lines.push('| — | — | — | 暂无贴图 |')
  for (const texture of assets.textures) {
    lines.push(`| \`${texture.id}\` | ${texture.width}×${texture.height} | ${(texture.bytes / 1024).toFixed(1)} KB | \`${texture.relative}\` |`)
  }
  lines.push('', '## 模型', '', '| 物品 | 父模型 | 贴图引用 | 路径 |', '| --- | --- | --- | --- |')
  if (!assets.models.length) lines.push('| — | — | — | 暂无模型 |')
  for (const model of assets.models) {
    const refs = Object.entries(model.textures ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('；')
    lines.push(`| \`${model.id}\` | \`${model.parent || '—'}\` | ${cell(refs)} | \`${model.relative}\` |`)
  }
  lines.push('', '## 缺失素材', '')
  if (assets.missing.length) {
    lines.push('以下物品缺少贴图或模型：', '', ...assets.missing.map((id) => `- \`${id}\``))
  } else {
    lines.push('所有物品都已有贴图与模型。')
  }
  lines.push('')
  return lines.join('\n')
}

/** 生成文档索引。 */
function renderDocsIndex(meta, counts) {
  return [
    `# ${meta.name} — 文档`,
    '',
    `本项目文档由「模组工坊」生成，数据源为 \`.mcstudio/\`。`,
    '',
    '| 文档 | 内容 |',
    '| --- | --- |',
    `| [FEATURES.md](FEATURES.md) | 构想清单（${counts.features} 项） |`,
    `| [ITEMS.md](ITEMS.md) | 物品清单（${counts.items} 个） |`,
    `| [ITEMS/](ITEMS/) | 单个物品的完整属性文档 |`,
    `| [ASSETS.md](ASSETS.md) | 贴图与模型清单 |`,
    '',
    '> 直接修改本目录下的文件不会同步回插件；请通过插件页面编辑，再重新导出。',
    '',
  ].join('\n')
}

/**
 * 导出全部文档，返回生成的文件相对路径列表。
 */
export async function exportProjectDocs(projectPath) {
  const meta = await readProjectMeta(projectPath)
  if (!meta) throw new Error('项目不存在')

  const [features, items, assets] = await Promise.all([
    listFeatures(projectPath),
    listItems(projectPath),
    listAssets(projectPath),
  ])

  const outDir = docsDir(projectPath)
  const itemsOutDir = join(outDir, 'ITEMS')
  await fsp.mkdir(itemsOutDir, { recursive: true })

  const written = []
  const write = async (name, text) => {
    await writeText(join(outDir, name), text)
    written.push(`docs/${name}`)
  }

  await write('FEATURES.md', renderFeatures(meta, features))
  await write('ITEMS.md', renderItemsIndex(meta, items))
  await write('ASSETS.md', renderAssets(meta, assets))
  await write('README.md', renderDocsIndex(meta, { features: features.length, items: items.length }))

  for (const item of items) {
    await writeText(join(itemsOutDir, `${item.id}.md`), renderItem(meta, item))
    written.push(`docs/ITEMS/${item.id}.md`)
  }

  // 清理已经不存在的物品文档
  const valid = new Set(items.map((i) => `${i.id}.md`))
  for (const name of await fsp.readdir(itemsOutDir).catch(() => [])) {
    if (name.endsWith('.md') && !valid.has(name)) {
      await fsp.rm(join(itemsOutDir, name), { force: true })
    }
  }

  return { files: written, counts: { features: features.length, items: items.length } }
}
