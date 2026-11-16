/**
 * 代码风格检查（v0.5.1）：按 PROJECT-STRUCTURE / 12 条规则输出分级问题。
 *
 * 只读静态扫描（Java 源码 + 资源 + Gradle 配置），不修改任何文件。
 * 返回 { errors[], warnings[], infos[] }，每条 { level, code, message, target }。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { readJson } from './registry.js'
import { readProjectMeta } from './meta.js'
import { listItems } from './entries.js'

async function walkFiles(root, rel = '', out = []) {
  const dir = rel ? join(root, rel) : root
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'build' || entry.name === '.gradle') continue
    const childRel = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) await walkFiles(root, childRel, out)
    else if (entry.isFile()) out.push(childRel)
  }
  return out
}

function entry(level, code, message, target = '') {
  return { level, code, message, target }
}

/** 风格检查。 */
export async function checkStyle(projectPath) {
  const errors = []
  const warnings = []
  const infos = []
  const meta = await readProjectMeta(projectPath)
  if (!meta) return { errors, warnings, infos }

  const modid = String(meta.modid ?? '')
  const javaRoot = join(projectPath, 'src', 'main', 'java')
  const files = await walkFiles(javaRoot)
  const texts = []
  for (const rel of files) {
    if (!rel.endsWith('.java')) continue
    texts.push([rel, await fsp.readFile(join(javaRoot, rel), 'utf8').catch(() => '')])
  }

  // 1. 标准注册类存在
  for (const name of ['ModItems', 'ModBlocks', 'ModDataGenerator']) {
    const found = files.some((rel) => rel.endsWith(`/${name}.java`))
    if (!found) {
      warnings.push(entry('warning', 'style.structure', `缺少标准注册类 ${name}.java`, `src/main/java/.../${name}.java`))
    }
  }

  // 2. WoodType 必须带命名空间
  for (const [rel, text] of texts) {
    for (const match of text.matchAll(/new\s+WoodType\s*\(\s*"([^"]+)"/g)) {
      if (!match[1].includes(':')) {
        errors.push(entry('error', 'style.woodtype', `WoodType 名「${match[1]}」缺少命名空间（应为 ${modid}:...）`, rel))
      }
    }
  }

  // 3. 不手动注册 sign/hanging sign 模型层
  for (const [rel, text] of texts) {
    if (/createSignModelName|createHangingSignModelName/.test(text)) {
      warnings.push(entry('warning', 'style.modellayer', '手动注册 sign/hanging sign 模型层可能与 Forge 自动生成冲突', rel))
    }
  }

  // 4. 方块与 BlockItem 配对
  const blockRegs = new Set()
  const itemRegs = new Set()
  for (const [, text] of texts) {
    for (const match of text.matchAll(/registerBlock\(\s*"([^"]+)"/g)) blockRegs.add(match[1])
    for (const match of text.matchAll(/ITEMS\.register\(\s*"([^"]+)"/g)) itemRegs.add(match[1])
  }
  for (const id of blockRegs) {
    if (!itemRegs.has(id)) {
      warnings.push(entry('warning', 'style.blockitem', `方块「${id}」缺少对应 BlockItem`, 'ModBlocks.java'))
    }
  }

  // 5. 创造栏覆盖
  const items = await listItems(projectPath)
  const tabText = texts.find(([rel]) => rel.endsWith('ModCreativeModeTabs.java'))?.[1] ?? ''
  const accepted = (tabText.match(/output\.accept\(/g) || []).length
  if (items.length && accepted < items.length) {
    warnings.push(entry('warning', 'style.creativetab', `创造栏只收录 ${accepted} 项，物品有 ${items.length} 项`, 'ModCreativeModeTabs.java'))
  }

  // 6. datagen 与 build.gradle
  const dataGenText = texts.find(([rel]) => rel.endsWith('ModDataGenerator.java'))?.[1] ?? ''
  if (dataGenText && !/addProvider\s*\(/.test(dataGenText)) {
    warnings.push(entry('warning', 'style.datagen', 'ModDataGenerator 还没有注册任何 provider', 'ModDataGenerator.java'))
  }
  const build = await fsp.readFile(join(projectPath, 'build.gradle'), 'utf8').catch(() => '')
  if (build && !/runs\s*\{[\s\S]*?data\s*\{/.test(build)) {
    warnings.push(entry('warning', 'style.build', 'build.gradle 缺少 runs.data', 'build.gradle'))
  }
  if (build && !/generated\/resources/.test(build)) {
    warnings.push(entry('warning', 'style.build', 'build.gradle 缺少 generated/resources', 'build.gradle'))
  }

  // 7. gradle.properties 关键键
  const props = await fsp.readFile(join(projectPath, 'gradle.properties'), 'utf8').catch(() => '')
  if (props) {
    for (const key of ['mod_id', 'mod_group_id', 'mapping_channel']) {
      if (!new RegExp(`^${key}=`, 'm').test(props)) {
        errors.push(entry('error', 'style.properties', `gradle.properties 缺少 ${key}`, 'gradle.properties'))
      }
    }
  }

  // 8. 资源目录
  const assets = join(projectPath, 'src', 'main', 'resources', 'assets', modid)
  for (const sub of ['lang', 'models', 'textures']) {
    const exists = await fsp.stat(join(assets, sub)).then((stat) => stat.isDirectory()).catch(() => false)
    if (!exists) {
      warnings.push(entry('warning', 'style.assets', `缺少资源目录 assets/${modid}/${sub}`, `assets/${modid}/${sub}`))
    }
  }

  // 9. 语言键 itemGroup
  const en = await readJson(join(assets, 'lang', 'en_us.json'), {})
  if (!Object.keys(en ?? {}).some((key) => key.startsWith('itemGroup.'))) {
    warnings.push(entry('warning', 'style.lang', 'en_us.json 缺少 itemGroup.* 语言键', 'lang/en_us.json'))
  }

  // 10. 世界生成（info）
  const worldgen = await fsp.stat(join(projectPath, 'src', 'main', 'resources', 'data', modid, 'worldgen')).then((stat) => stat.isDirectory()).catch(() => false)
  if (!worldgen) infos.push(entry('info', 'style.worldgen', '未发现 worldgen 目录（暂无世界生成内容）', `data/${modid}/worldgen`))

  return { errors, warnings, infos }
}
