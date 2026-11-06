/**
 * 用例 26：Gradle 脚手架（版本矩阵、参数推断、预览、写入、幂等、拒绝）。
 */

import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { equal, must, runSuite } from './helpers.mjs'
import { inferParams } from '../lib/scaffold.js'
import { listMatrix, resolveMatrix, supports } from '../lib/version-matrix.js'

async function newProject(ws, modid = 'scaffoldmod', loader = 'forge') {
  const dir = ws.path(modid)
  await ws.call('project.create', { path: dir, name: '脚手架测试', modid, loader })
  return dir
}

const cases = [
  {
    name: '版本矩阵覆盖三个加载器',
    async run() {
      equal(listMatrix().length, 3, '应有 forge / neoforge / fabric 三组')
      equal(resolveMatrix('forge', '1.20.1').loaderVersion, '47.4.16', 'forge 版本')
      equal(resolveMatrix('neoforge', '1.20.1').loaderVersion, '47.1.106', 'neoforge 版本')
      equal(resolveMatrix('fabric', '1.20.1').loaderVersion, '0.15.11', 'fabric 版本')
      equal(supports('forge', '1.19.2'), false, '不支持的 MC 版本应拒绝')
      equal(resolveMatrix('unknown', '1.20.1'), null, '未知 loader 返回 null')
    },
  },
  {
    name: '从描述推断参数',
    async run(ws) {
      const dir = await newProject(ws, 'infermod', 'neoforge')
      const params = inferParams({
        description: '用 NeoForge 1.20.1 做一个 Ruby 物品模组',
        modid: 'rubymod',
        name: 'Ruby Mod',
      }, { name: 'Ruby Mod', modid: 'rubymod', loader: 'neoforge', group: 'com.example.rubymod' })
      equal(params.loader, 'neoforge', '应从描述识别 neoforge')
      equal(params.minecraft, '1.20.1', '默认 1.20.1')
      equal(params.ClassName, 'RubymodMod', '类名应由 modid 生成')
      equal(params.package, 'com.example.rubymod', '包名来自项目 group')
      equal(params.packagePath, 'com/example/rubymod', '包路径应转目录')
      must(params.modDescription.includes('Ruby'), '描述应保留')
    },
  },
  {
    name: '预览列出完整工程文件',
    async run(ws) {
      const dir = await newProject(ws, 'previewmod')
      const result = await ws.call('scaffold.preview', { path: dir, loader: 'forge', minecraft: '1.20.1' })
      equal(result.params.loader, 'forge', '参数应回显')
      const paths = result.files.map((file) => file.path)
      for (const expected of ['build.gradle', 'settings.gradle', 'gradle.properties', 'gradlew', 'gradlew.bat']) {
        must(paths.includes(expected), `应包含 ${expected}`)
      }
      must(paths.some((path) => path === 'src/main/java/com/example/previewmod/PreviewmodMod.java'), '应包含主类')
      must(paths.includes('src/main/resources/META-INF/mods.toml'), 'forge 应包含 mods.toml')
      equal(result.conflicts.length, 0, '空目录不应有冲突')
    },
  },
  {
    name: '已存在文件默认跳过',
    async run(ws) {
      const dir = await newProject(ws, 'conflictmod')
      await ws.write(join(dir, 'build.gradle'), '// existing\n')
      const result = await ws.call('scaffold.preview', { path: dir, loader: 'forge' })
      const build = result.files.find((file) => file.path === 'build.gradle')
      equal(build.action, 'skip', '已存在文件应跳过')
      must(result.conflicts.some((item) => item.path === 'build.gradle'), '应报告冲突')
    },
  },
  {
    name: '应用脚手架写入文件',
    async run(ws) {
      const dir = await newProject(ws, 'applymod')
      const result = await ws.call('scaffold.apply', { path: dir, loader: 'forge', modid: 'applymod', name: 'Apply Mod' })
      equal(result.created.length > 0, true, '应写入文件')
      equal(result.conflicts.length, 0, '空目录不应有冲突')
      const properties = await readFile(join(dir, 'gradle.properties'), 'utf8')
      must(properties.includes('mod_id=applymod'), 'gradle.properties 应写入 modid')
      const main = await readFile(join(dir, 'src/main/java/com/example/applymod/ApplymodMod.java'), 'utf8')
      must(main.includes('@Mod(ApplymodMod.MODID)'), '主类应写入 @Mod')
      const wrapper = await stat(join(dir, 'gradle/wrapper/gradle-wrapper.jar'))
      must(wrapper.size > 1000, '应复制 wrapper jar')
    },
  },
  {
    name: '重复应用不覆盖已有文件',
    async run(ws) {
      const dir = await newProject(ws, 'idempotentmod')
      const first = await ws.call('scaffold.apply', { path: dir, loader: 'forge' })
      must(first.created.length > 0, '首次应写入')
      const second = await ws.call('scaffold.apply', { path: dir, loader: 'forge' })
      equal(second.created.length, 0, '再次应用不应写入新文件')
      equal(second.skipped, first.created.length, '应全部跳过')
    },
  },
  {
    name: '非法组合与非法 modid 被拒绝',
    async run(ws) {
      const dir = await newProject(ws, 'invalidmod')
      let message = ''
      try {
        await ws.call('scaffold.preview', { path: dir, loader: 'minecraft', minecraft: '1.20.1' })
      } catch (error) { message = error.message }
      must(message.includes('不支持的组合'), `应拒绝未知加载器，实际「${message}」`)

      message = ''
      try {
        await ws.call('scaffold.preview', { path: dir, loader: 'forge', modid: 'Bad Mod' })
      } catch (error) { message = error.message }
      must(message.includes('modid'), `应拒绝非法 modid，实际「${message}」`)
    },
  },
  {
    name: 'scaffold 工具预览',
    async run(ws) {
      const dir = await newProject(ws, 'toolmod')
      const result = await ws.call('agent.call', {
        tool: 'scaffold',
        args: { action: 'preview', project: dir, description: '用 Fabric 1.20.1 建一个工具模组', modid: 'toolmod' },
      })
      equal(result.params.loader, 'fabric', '工具应从描述识别 fabric')
      must(result.files.some((file) => file.path === 'src/main/resources/fabric.mod.json'), 'fabric 应包含 fabric.mod.json')
    },
  },
]

process.exitCode = await runSuite('26 · Gradle 脚手架', cases)
