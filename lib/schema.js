/**
 * 字段与枚举定义
 *
 * 加载器、构想状态与优先级、物品类型与 19 个属性字段。
 * 纯数据，不读写文件，供 Host 校验与 Client 渲染共用。
 */

import { MC_VERSION } from './paths.js'

export const LOADERS = [
  { id: 'forge', label: 'Forge', note: 'MinecraftForge 47.x（1.20.1）' },
  { id: 'neoforge', label: 'NeoForge', note: 'NeoForge 47.1.x（1.20.1）' },
  { id: 'fabric', label: 'Fabric', note: 'Fabric Loader 0.15.x + Fabric API' },
]

/** 功能状态。 */
export const FEATURE_STATUS = [
  { id: 'idea', label: '构思', tone: 'idle' },
  { id: 'planning', label: '规划中', tone: 'warn' },
  { id: 'implementing', label: '实现中', tone: 'brand' },
  { id: 'done', label: '已完成', tone: 'success' },
]

/** 优先级。 */
export const FEATURE_PRIORITY = [
  { id: 'high', label: '高' },
  { id: 'medium', label: '中' },
  { id: 'low', label: '低' },
]

/** 物品类型。 */
export const ITEM_TYPES = [
  { id: 'item', label: '普通物品' },
  { id: 'block', label: '方块' },
  { id: 'tool', label: '工具' },
  { id: 'weapon', label: '武器' },
  { id: 'armor', label: '盔甲' },
  { id: 'food', label: '食物' },
  { id: 'material', label: '材料' },
  { id: 'creative_tab', label: '创造模式标签' },
]

/**
 * 物品属性字段定义。
 *
 * Host 侧用于生成默认值与校验，Client 侧通过 `schema` 动作获取同一份定义来渲染表单，
 * 保证两边字段永远一致。
 */
export const ITEM_FIELDS = [
  // ── 基础属性 ──────────────────────────────────────────────
  {
    key: 'maxStackSize', label: '最大堆叠', type: 'number', group: '基础属性',
    default: 64, min: 1, max: 64, unit: '个',
    hint: '同一格中最多堆叠的数量。工具/盔甲通常为 1。',
  },
  {
    key: 'rarity', label: '稀有度', type: 'select', group: '基础属性', default: 'common',
    options: [
      { value: 'common', label: '普通' },
      { value: 'uncommon', label: '少见（黄字）' },
      { value: 'rare', label: '稀有（蓝字）' },
      { value: 'epic', label: '史诗（紫字）' },
    ],
    hint: '决定物品名称颜色与掉落修饰。',
  },
  {
    key: 'creativeTab', label: '创造模式分类', type: 'text', group: '基础属性', default: '',
    hint: '例如 mymod.items；留空表示不进入创造模式物品栏。',
  },
  {
    key: 'renderType', label: '渲染模型', type: 'select', group: '基础属性', default: 'generated',
    options: [
      { value: 'generated', label: 'item/generated（平面贴图）' },
      { value: 'handheld', label: 'item/handheld（手持工具）' },
      { value: 'block', label: '方块模型' },
      { value: 'custom', label: '自定义 JSON' },
    ],
    hint: '决定 models/item/<id>.json 使用的父模型。',
  },
  {
    key: 'glint', label: '附魔光效', type: 'boolean', group: '基础属性', default: false,
    hint: '是否始终带有附魔光效。',
  },
  // ── 数值属性 ──────────────────────────────────────────────
  {
    key: 'maxDamage', label: '最大耐久', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100000, unit: '点',
    hint: '0 表示不可损坏。工具/武器/盔甲通常大于 0。',
  },
  {
    key: 'enchantability', label: '附魔能力', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100,
    hint: '越高越容易获得好附魔。0 表示不可附魔。',
  },
  {
    key: 'repairMaterial', label: '修复材料', type: 'text', group: '数值属性', default: '',
    hint: '例如 minecraft:iron_ingot。留空表示不可修复。',
  },
  {
    key: 'burnTime', label: '燃烧时间', type: 'number', group: '数值属性',
    default: 0, min: 0, max: 100000, unit: 'tick',
    hint: '作为燃料时的燃烧时长（20 tick = 1 秒）。0 表示不可燃烧。',
  },
  // ── 行为属性 ──────────────────────────────────────────────
  {
    key: 'toolTier', label: '工具等级', type: 'select', group: '行为属性', default: 'none',
    options: [
      { value: 'none', label: '无' },
      { value: 'wood', label: '木' },
      { value: 'stone', label: '石' },
      { value: 'iron', label: '铁' },
      { value: 'gold', label: '金' },
      { value: 'diamond', label: '钻石' },
      { value: 'netherite', label: '下界合金' },
    ],
    hint: '决定采集等级与工具耐久倍率。',
  },
  {
    key: 'miningLevel', label: '采集等级', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 5,
    hint: '0=木 1=石 2=铁 3=钻石 4=下界合金。',
  },
  {
    key: 'attackDamage', label: '攻击伤害', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 100, unit: '点',
    hint: '作为武器时的额外攻击力。',
  },
  {
    key: 'attackSpeed', label: '攻击速度', type: 'number', group: '行为属性',
    default: 0, step: 0.1, unit: '倍',
    hint: '例如 1.6 表示剑的标准攻速；0 表示不加成。',
  },
  {
    key: 'armor', label: '护甲值', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 30, unit: '点',
    hint: '作为盔甲时提供的护甲点数。',
  },
  {
    key: 'foodNutrition', label: '食物恢复值', type: 'number', group: '行为属性',
    default: 0, min: 0, max: 20, unit: '点',
    hint: '每口恢复的饥饿值（鸡腿）。0 表示不可食用。',
  },
  {
    key: 'foodSaturation', label: '食物饱和度', type: 'number', group: '行为属性',
    default: 0, min: 0, step: 0.1,
    hint: '每口恢复的饱和度修正值。',
  },
  // ── 标签 ──────────────────────────────────────────────────
  {
    key: 'itemTags', label: '物品标签', type: 'tags', group: '标签属性', default: [],
    hint: '例如 minecraft:planks、c:gems。用于配方与模组联动。',
  },
  {
    key: 'blockTags', label: '方块标签', type: 'tags', group: '标签属性', default: [],
    hint: '仅方块类物品使用，例如 minecraft:mineable/pickaxe。',
  },
  // ── 兼容 ──────────────────────────────────────────────────
  {
    key: 'loaderNotes', label: '加载器差异备注', type: 'textarea', group: '兼容性', default: '',
    hint: '记录 Forge / NeoForge / Fabric 之间的注册方式或 API 差异。',
  },
]

/** 取字段定义表（供 API 与导出使用）。 */
export function itemSchema() {
  return {
    fields: ITEM_FIELDS,
    types: ITEM_TYPES,
    statuses: FEATURE_STATUS,
    priorities: FEATURE_PRIORITY,
    loaders: LOADERS,
    mcVersion: MC_VERSION,
  }
}

/** 按字段定义生成一份默认属性。 */
export function defaultProperties() {
  const out = {}
  for (const field of ITEM_FIELDS) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default
  }
  return out
}
