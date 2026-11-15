/**
 * 设定、热键、附魔、状态效果、声音与粒子资料。
 *
 * 数据文件：`.mcstudio/<分类>.json`（settings / keybinds / enchantments / effects / sounds / particles）。
 * P4 只存意图与参数；Java/JSON 骨架由模板生成。
 */

import { readJson, writeJson } from './registry.js'
import { catalogFile } from './paths.js'
import { touchMeta } from './meta.js'

export const SETTING_KINDS = ['term', 'command', 'lore']
export const EFFECT_TYPES = ['buff', 'debuff']
export const ENCHANTMENT_RARITIES = ['common', 'uncommon', 'rare', 'very_rare']
export const STATUS = ['planned', 'implementing', 'stable']

const ID_RE = /^[a-z0-9_]{2,64}$/

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function number(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function now() {
  return new Date().toISOString()
}

function requireId(raw, label) {
  const id = text(raw.id).trim()
  if (!ID_RE.test(id)) throw new Error(`${label} id 只能使用小写字母、数字和下划线（2-64）`)
  return id
}

function base(raw, id, name) {
  return {
    schemaVersion: 1,
    id,
    name: name || id,
    status: STATUS.includes(raw.status) ? raw.status : 'planned',
    notes: text(raw.notes),
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
  }
}

export function normalizeSetting(raw = {}) {
  const id = requireId(raw, '设定')
  return {
    ...base(raw, id, text(raw.name).trim()),
    kind: SETTING_KINDS.includes(raw.kind) ? raw.kind : 'term',
    command: text(raw.command).trim(),
    description: text(raw.description),
  }
}

export function normalizeKeybind(raw = {}) {
  const id = requireId(raw, '热键')
  const key = text(raw.key).trim()
  return {
    ...base(raw, id, text(raw.name).trim()),
    key: key || 'K',
    description: text(raw.description),
  }
}

export function normalizeEnchantment(raw = {}) {
  const id = requireId(raw, '附魔')
  return {
    ...base(raw, id, text(raw.name).trim()),
    maxLevel: number(raw.maxLevel, 1, 1, 10),
    rarity: ENCHANTMENT_RARITIES.includes(raw.rarity) ? raw.rarity : 'common',
  }
}

export function normalizeEffect(raw = {}) {
  const id = requireId(raw, '状态效果')
  return {
    ...base(raw, id, text(raw.name).trim()),
    type: EFFECT_TYPES.includes(raw.type) ? raw.type : 'buff',
    duration: number(raw.duration, 200, 1, 1000000),
    amplifier: number(raw.amplifier, 0, 0, 255),
  }
}

export function normalizeSound(raw = {}) {
  const id = requireId(raw, '声音')
  return {
    ...base(raw, id, text(raw.name).trim()),
    event: text(raw.event).trim() || `${id}.sound`,
  }
}

export function normalizeParticle(raw = {}) {
  const id = requireId(raw, '粒子')
  return base(raw, id, text(raw.name).trim())
}

async function readList(projectPath, file, key) {
  const raw = await readJson(catalogFile(projectPath, file), { [key]: [] })
  return Array.isArray(raw?.[key]) ? raw[key] : []
}

async function listEntries(projectPath, file, key, normalize) {
  return (await readList(projectPath, file, key)).map((item) => normalize(item))
}

async function saveEntry(projectPath, file, key, normalize, raw) {
  const entry = normalize(raw)
  const list = await listEntries(projectPath, file, key, normalize)
  const index = list.findIndex((item) => item.id === entry.id)
  const stamp = now()
  if (index >= 0) {
    entry.createdAt = list[index].createdAt ?? stamp
    list[index] = { ...entry, createdAt: entry.createdAt, updatedAt: stamp }
  } else {
    entry.createdAt = stamp
    entry.updatedAt = stamp
    list.push(entry)
  }
  await writeJson(catalogFile(projectPath, file), { schemaVersion: 1, [key]: list })
  await touchMeta(projectPath)
  return list.find((item) => item.id === entry.id)
}

async function deleteEntry(projectPath, file, key, normalize, id) {
  const list = (await listEntries(projectPath, file, key, normalize)).filter((item) => item.id !== id)
  await writeJson(catalogFile(projectPath, file), { schemaVersion: 1, [key]: list })
  await touchMeta(projectPath)
  return list
}

export async function listSettings(projectPath) {
  return listEntries(projectPath, 'settings', 'settings', normalizeSetting)
}

export async function saveSetting(projectPath, entry = {}) {
  return saveEntry(projectPath, 'settings', 'settings', normalizeSetting, entry)
}

export async function deleteSetting(projectPath, id) {
  return deleteEntry(projectPath, 'settings', 'settings', normalizeSetting, id)
}

export async function listKeybinds(projectPath) {
  return listEntries(projectPath, 'keybinds', 'keybinds', normalizeKeybind)
}

export async function saveKeybind(projectPath, entry = {}) {
  return saveEntry(projectPath, 'keybinds', 'keybinds', normalizeKeybind, entry)
}

export async function deleteKeybind(projectPath, id) {
  return deleteEntry(projectPath, 'keybinds', 'keybinds', normalizeKeybind, id)
}

export async function listEnchantments(projectPath) {
  return listEntries(projectPath, 'enchantments', 'enchantments', normalizeEnchantment)
}

export async function saveEnchantment(projectPath, entry = {}) {
  return saveEntry(projectPath, 'enchantments', 'enchantments', normalizeEnchantment, entry)
}

export async function deleteEnchantment(projectPath, id) {
  return deleteEntry(projectPath, 'enchantments', 'enchantments', normalizeEnchantment, id)
}

export async function listEffects(projectPath) {
  return listEntries(projectPath, 'effects', 'effects', normalizeEffect)
}

export async function saveEffect(projectPath, entry = {}) {
  return saveEntry(projectPath, 'effects', 'effects', normalizeEffect, entry)
}

export async function deleteEffect(projectPath, id) {
  return deleteEntry(projectPath, 'effects', 'effects', normalizeEffect, id)
}

export async function listSounds(projectPath) {
  return listEntries(projectPath, 'sounds', 'sounds', normalizeSound)
}

export async function saveSound(projectPath, entry = {}) {
  return saveEntry(projectPath, 'sounds', 'sounds', normalizeSound, entry)
}

export async function deleteSound(projectPath, id) {
  return deleteEntry(projectPath, 'sounds', 'sounds', normalizeSound, id)
}

export async function listParticles(projectPath) {
  return listEntries(projectPath, 'particles', 'particles', normalizeParticle)
}

export async function saveParticle(projectPath, entry = {}) {
  return saveEntry(projectPath, 'particles', 'particles', normalizeParticle, entry)
}

export async function deleteParticle(projectPath, id) {
  return deleteEntry(projectPath, 'particles', 'particles', normalizeParticle, id)
}
