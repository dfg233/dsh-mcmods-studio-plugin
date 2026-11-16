/**
 * 用例 40：代码风格检查（agent.validate 的 style 区段）。
 */

import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'

async function scaffoldProject(ws, modid) {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: 'Style', modid, loader: 'forge', authors: 'Besson' })
  await ws.call('scaffold.apply', { path: dir, loader: 'forge', modid, name: 'Style', authors: 'Besson' })
  return dir
}

async function writeFile(root, rel, content) {
  const file = join(root, rel)
  await fsp.mkdir(dirname(file), { recursive: true })
  await fsp.writeFile(file, content, 'utf8')
}

const cases = [
  {
    name: '标准项目返回 style 区段',
    async run(ws) {
      const dir = await scaffoldProject(ws, 'style_ok')
      const result = await ws.call('agent.validate', { path: dir })
      must(result.style, '应返回 style 区段')
      equal(result.style.errors, 0, '标准骨架不应有风格错误')
      must(result.errors.every((item) => !String(item.code).startsWith('style.')), 'errors 中不应有 style 错误')
    },
  },
  {
    name: 'WoodType 无命名空间报错',
    async run(ws) {
      const dir = await scaffoldProject(ws, 'style_wood')
      await writeFile(dir, 'src/main/java/com/besson/style_wood/block/BadWood.java', [
        'package com.besson.style_wood.block;',
        '',
        'import net.minecraft.world.level.block.state.properties.BlockSetType;',
        'import net.minecraft.world.level.block.state.properties.WoodType;',
        '',
        'public class BadWood {',
        '    public static final WoodType BAD = new WoodType("badwood", BlockSetType.OAK);',
        '}',
        '',
      ].join('\n'))
      const result = await ws.call('agent.validate', { path: dir })
      must(result.errors.some((item) => item.code === 'style.woodtype'), '应报 style.woodtype')
    },
  },
  {
    name: '方块缺 BlockItem 警告',
    async run(ws) {
      const dir = await scaffoldProject(ws, 'style_blockitem')
      await writeFile(dir, 'src/main/java/com/besson/style_blockitem/block/ModBlocks.java', [
        'package com.besson.style_blockitem.block;',
        '',
        'import net.minecraft.world.level.block.Block;',
        '',
        'public final class ModBlocks {',
        '    public static final net.minecraftforge.registries.RegistryObject<Block> GHOST = registerBlock("ghost", () -> new Block(net.minecraft.world.level.block.state.BlockBehaviour.Properties.of()));',
        '}',
        '',
      ].join('\n'))
      const result = await ws.call('agent.validate', { path: dir })
      must(result.warnings.some((item) => item.code === 'style.blockitem'), '应报 style.blockitem')
    },
  },
  {
    name: 'gradle.properties 缺关键键报错',
    async run(ws) {
      const dir = await scaffoldProject(ws, 'style_props')
      const propsPath = join(dir, 'gradle.properties')
      const props = await fsp.readFile(propsPath, 'utf8')
      await fsp.writeFile(propsPath, props.replace(/^mod_id=.*$/m, '# mod_id removed'), 'utf8')
      const result = await ws.call('agent.validate', { path: dir })
      must(result.errors.some((item) => item.code === 'style.properties'), '应报 style.properties')
    },
  },
]

process.exitCode = await runSuite('40 · 代码风格检查', cases)
