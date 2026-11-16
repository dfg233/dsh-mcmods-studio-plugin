/**
 * 用例 42：原版参考（reference get/search/decompile）。
 *
 * 用临时项目 + 伪造反编译缓存验证读取；不触发 CFR 下载与真实反编译。
 */

import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { referenceCacheDir } from '../lib/reference.js'

async function newProject(ws, modid = 'm42') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Reference', modid, loader: 'forge', authors: 'Besson' })
  return dir
}

const cases = [
  {
    name: '读取反编译缓存源码',
    async run(ws) {
      const dir = await newProject(ws, 'm42cache')
      const cache = referenceCacheDir(dir)
      await fsp.mkdir(join(cache, 'net/minecraft/world/item'), { recursive: true })
      await fsp.writeFile(join(cache, 'net/minecraft/world/item/BoatItem.java'), [
        'package net.minecraft.world.item;',
        '',
        'public class BoatItem extends Item {',
        '    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {',
        '        return InteractionResultHolder.pass(player.getItemInHand(hand));',
        '    }',
        '}',
        '',
      ].join('\n'), 'utf8')
      const result = await ws.call('reference.get', { path: dir, className: 'net.minecraft.world.item.BoatItem' })
      equal(result.source, 'decompiled', '应读缓存源码')
      must(result.content.includes('BoatItem'), '应包含类名')
      must(result.lineCount >= 5, '应返回行数')
    },
  },
  {
    name: '搜索反编译缓存',
    async run(ws) {
      const dir = await newProject(ws, 'm42search')
      const cache = referenceCacheDir(dir)
      await fsp.mkdir(join(cache, 'net/minecraft/world/item'), { recursive: true })
      await fsp.writeFile(join(cache, 'net/minecraft/world/item/Item.java'), 'package net.minecraft.world.item;\npublic class Item {}\n', 'utf8')
      const result = await ws.call('reference.search', { path: dir, query: 'Item' })
      must(result.results.some((item) => item.className === 'net.minecraft.world.item.Item'), '应命中 Item')
    },
  },
  {
    name: '非法类名被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'm42bad')
      let message = ''
      try {
        await ws.call('reference.get', { path: dir, className: 'bad name!' })
      } catch (error) { message = error.message }
      must(message.includes('类名不合法'), `应拒绝，实际「${message}」`)
    },
  },
]

process.exitCode = await runSuite('42 · 原版参考', cases)
