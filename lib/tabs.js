/**
 * 创造标签成员（`.mcstudio/creative_tabs.json`）。
 *
 * 1.20.1 的创造标签是代码注册；这里维护成员清单并给出代码片段，
 * 由任务/模板写入标记块。
 */

import { readJson, writeJson } from './registry.js'
import { catalogFile } from './paths.js'
import { touchMeta } from './meta.js'

const TAB_ID_RE = /^[a-z0-9_]{2,64}$/
const ITEM_ID_RE = /^[a-z0-9_]{1,64}$/

function membersOf(raw) {
  return Array.isArray(raw) ? [...new Set(raw.map((item) => String(item)).filter(Boolean))] : []
}

export async function readTabs(projectPath) {
  const raw = await readJson(catalogFile(projectPath, 'creative_tabs'), { tabs: [] })
  return Array.isArray(raw.tabs)
    ? raw.tabs.map((tab) => ({
      schemaVersion: 1,
      id: String(tab.id || ''),
      name: String(tab.name || tab.id || ''),
      members: membersOf(tab.members),
    }))
    : []
}

async function writeTabs(projectPath, tabs) {
  await writeJson(catalogFile(projectPath, 'creative_tabs'), { schemaVersion: 1, tabs })
  await touchMeta(projectPath)
}

export async function tabMembers(projectPath, id) {
  const tabs = await readTabs(projectPath)
  const tab = tabs.find((item) => item.id === id)
  if (!tab) throw new Error(`创造标签不存在：${id}`)
  return tab
}

export async function addTabMember(projectPath, id, itemId) {
  if (!TAB_ID_RE.test(String(id))) throw new Error('创造标签 id 只能使用小写字母、数字和下划线（2-64）')
  if (!ITEM_ID_RE.test(String(itemId))) throw new Error('物品 id 不合法')
  const tabs = await readTabs(projectPath)
  let tab = tabs.find((item) => item.id === id)
  if (!tab) {
    tab = { schemaVersion: 1, id, name: id, members: [] }
    tabs.push(tab)
  }
  if (!tab.members.includes(itemId)) tab.members.push(itemId)
  await writeTabs(projectPath, tabs)
  return { ...tab, snippet: `output.accept(ModItems.${String(itemId).toUpperCase()}.get());` }
}

export async function removeTabMember(projectPath, id, itemId) {
  const tabs = await readTabs(projectPath)
  const tab = tabs.find((item) => item.id === id)
  if (!tab) throw new Error(`创造标签不存在：${id}`)
  tab.members = tab.members.filter((item) => item !== itemId)
  await writeTabs(projectPath, tabs)
  return tab
}
