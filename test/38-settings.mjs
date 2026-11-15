/**
 * 用例 38：设定、热键、附魔、效果、声音与粒子。
 */

import { equal, must, runSuite } from './helpers.mjs'

async function newProject(ws, modid = 'm38') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '资料扩展测试', modid, loader: 'forge' })
  return dir
}

const cases = [
  {
    name: '设定与热键保存',
    async run(ws) {
      const dir = await newProject(ws, 'settingkey')
      const setting = await ws.call('content.setting.save', {
        path: dir,
        setting: { id: 'ruby_lore', name: '红宝石传说', kind: 'lore', description: '远古红宝石的故事' },
      })
      equal(setting.setting.kind, 'lore', '设定类型保存')
      const keybind = await ws.call('content.keybind.save', {
        path: dir,
        keybind: { id: 'ruby_key', name: '打开红宝石界面' },
      })
      equal(keybind.keybind.key, 'K', '热键默认 K')
      const settings = await ws.call('content.setting.list', { path: dir })
      equal(settings.settings.length, 1, '设定列表')
    },
  },
  {
    name: '附魔与状态效果默认值',
    async run(ws) {
      const dir = await newProject(ws, 'encheffect')
      const enchantment = await ws.call('content.enchantment.save', {
        path: dir,
        enchantment: { id: 'ruby_affinity', name: '红宝石亲和', maxLevel: 3 },
      })
      equal(enchantment.enchantment.maxLevel, 3, '最大等级保存')
      equal(enchantment.enchantment.rarity, 'common', '稀有度默认')
      const effect = await ws.call('content.effect.save', {
        path: dir,
        effect: { id: 'ruby_boost', name: '红宝石增益', type: 'buff' },
      })
      equal(effect.effect.duration, 200, '持续时间默认')
      equal(effect.effect.amplifier, 0, '等级默认')
      const list = await ws.call('content.effect.list', { path: dir })
      equal(list.effects.length, 1, '效果列表')
    },
  },
  {
    name: '声音与粒子保存',
    async run(ws) {
      const dir = await newProject(ws, 'soundparticle')
      const sound = await ws.call('content.sound.save', { path: dir, sound: { id: 'ruby_chime', name: '红宝石清脆声' } })
      equal(sound.sound.event, 'ruby_chime.sound', '声音事件默认')
      const particle = await ws.call('content.particle.save', { path: dir, particle: { id: 'ruby_spark', name: '红宝石火花' } })
      equal(particle.particle.id, 'ruby_spark', '粒子保存')
      const particles = await ws.call('content.particle.list', { path: dir })
      equal(particles.particles.length, 1, '粒子列表')
    },
  },
  {
    name: '设定与热键模板渲染',
    async run(ws) {
      const dir = await newProject(ws, 'extratpl')
      const command = await ws.call('template.render', {
        path: dir,
        id: 'command-basic',
        params: { id: 'ruby', displayName: '红宝石命令', commandName: 'ruby' },
      })
      const commandJava = command.files.find((file) => file.path.includes('Command.java'))
      must(commandJava.content.includes('dispatcher.register'), '命令骨架应含注册')
      const keybind = await ws.call('template.render', {
        path: dir,
        id: 'keybind-basic',
        params: { id: 'ruby_key', displayName: '打开红宝石' },
      })
      const keybindJava = keybind.files.find((file) => file.path.includes('Keybind.java'))
      must(keybindJava.content.includes('GLFW_KEY_K'), '热键骨架应含键位')
      const effect = await ws.call('template.render', {
        path: dir,
        id: 'effect-basic',
        params: { id: 'ruby_boost', displayName: '红宝石增益' },
      })
      const effectJava = effect.files.find((file) => file.path.includes('Effect.java'))
      must(effectJava.content.includes('MobEffectCategory'), '效果骨架应含分类')
    },
  },
  {
    name: 'catalog 计入设定与效果',
    async run(ws) {
      const dir = await newProject(ws, 'extracatalog')
      await ws.call('content.setting.save', { path: dir, setting: { id: 'lore_one' } })
      await ws.call('content.enchantment.save', { path: dir, enchantment: { id: 'ench_one' } })
      await ws.call('content.effect.save', { path: dir, effect: { id: 'effect_one' } })
      const catalog = await ws.call('content.catalog', { path: dir })
      equal(catalog.categories.find((item) => item.id === 'setting').count, 1, '设定计数')
      equal(catalog.categories.find((item) => item.id === 'enchantment').count, 1, '附魔计数')
      equal(catalog.categories.find((item) => item.id === 'effect').count, 1, '效果计数')
    },
  },
]

process.exitCode = await runSuite('38 · 设定与扩展资料', cases)
