/**
 * 用例 16：持久化与导入可靠性。
 *
 * 覆盖：
 *   - writeJson 写入后无临时文件残留；
 *   - 项目备份在失败时恢复、成功时保留；
 *   - 导入 proof 能拒绝过期预览，并按新 proof 完成重新导入。
 */

import { access, mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { equal, must, rejects, runSuite, writeNeoForgeProject } from './helpers.mjs'
import { runWithProjectBackup } from '../lib/backup.js'
import { writeJson } from '../lib/registry.js'

const cases = [
  {
    name: 'writeJson 持久写入且不残留临时文件',
    async run(ws) {
      const file = ws.path('durable', 'data.json')
      await writeJson(file, { hello: '世界', n: 1 })
      await writeJson(file, { hello: '世界', n: 2 })

      const value = JSON.parse(await readFile(file, 'utf8'))
      equal(value.n, 2, '应写入最后一次的内容')
      const names = await readdir(dirname(file))
      must(!names.some((name) => name.endsWith('.tmp')), '写入后不应残留 .tmp 文件')
    },
  },
  {
    name: '项目备份在操作失败时恢复原数据',
    async run(ws) {
      const dir = ws.path('backup-fail')
      const dataDir = join(dir, '.mcstudio')
      await mkdir(dataDir, { recursive: true })
      await mkdir(join(dir, 'docs'), { recursive: true })
      await writeJson(join(dataDir, 'project.json'), { name: '原项目' })
      await writeJson(join(dir, 'docs', 'mcstudio-snapshot.md'), { v: '原快照' })

      await rejects(
        () => runWithProjectBackup(dir, async () => {
          await writeJson(join(dataDir, 'project.json'), { name: '被改坏的项目' })
          await writeJson(join(dir, 'docs', 'mcstudio-snapshot.md'), { v: '新快照' })
          throw new Error('模拟导入失败')
        }, 'test'),
        '模拟导入失败',
        '备份保护下应抛出原始错误',
      )

      const restored = JSON.parse(await readFile(join(dataDir, 'project.json'), 'utf8'))
      equal(restored.name, '原项目', '失败后应恢复备份中的原数据')
      const snapshot = JSON.parse(await readFile(join(dir, 'docs', 'mcstudio-snapshot.md'), 'utf8'))
      equal(snapshot.v, '原快照', '失败后应恢复导入前快照')
      const backups = await readdir(join(ws.home, 'mcmods-studio', 'backups'))
      must(backups.length > 0, '应保留本次备份目录')
    },
  },
  {
    name: '项目备份在操作成功时保留新数据',
    async run(ws) {
      const dir = ws.path('backup-ok')
      const dataDir = join(dir, '.mcstudio')
      await mkdir(dataDir, { recursive: true })
      await writeJson(join(dataDir, 'project.json'), { name: '旧项目' })

      const { result, backupDir } = await runWithProjectBackup(dir, async () => {
        await writeJson(join(dataDir, 'project.json'), { name: '新项目' })
        return 'done'
      }, 'test')

      equal(result, 'done', '应返回回调结果')
      must(backupDir, '成功时也应保留备份目录')
      const current = JSON.parse(await readFile(join(dataDir, 'project.json'), 'utf8'))
      equal(current.name, '新项目', '成功时不应回滚')
      await access(join(backupDir, 'mcstudio', 'project.json'))
    },
  },
  {
    name: '首次导入失败时清理新建的工坊数据与快照',
    async run(ws) {
      const dir = ws.path('new-fail')
      await mkdir(dir, { recursive: true })

      await rejects(
        () => runWithProjectBackup(dir, async () => {
          await mkdir(join(dir, '.mcstudio'), { recursive: true })
          await writeJson(join(dir, '.mcstudio', 'project.json'), { name: '半成品' })
          await mkdir(join(dir, 'docs'), { recursive: true })
          await writeJson(join(dir, 'docs', 'mcstudio-snapshot.md'), { v: '半成品快照' })
          throw new Error('首次导入失败')
        }, 'import'),
        '首次导入失败',
        '首次导入失败应抛出原始错误',
      )

      await rejects(() => access(join(dir, '.mcstudio')), '', '失败后不应留下 .mcstudio')
      await rejects(() => access(join(dir, 'docs', 'mcstudio-snapshot.md')), '', '失败后不应留下新建快照')
    },
  },
  {
    name: '过期 proof 拒绝重新导入，新 proof 正常执行',
    async run(ws) {
      const dir = await writeNeoForgeProject(ws, ws.path('proof'), {
        modid: 'proofmod', items: ['ruby'], blocks: [],
      })
      await ws.call('project.import', { path: dir })

      const first = await ws.call('project.analyzeImport', { path: dir })
      must(first.proof, '分析结果应带 proof')

      // 预览后工程多了一个资源，旧 proof 必须失效
      await ws.write(join(dir, 'src/main/resources/assets/proofmod/textures/item/sapphire.png'), 'png')
      await rejects(
        () => ws.call('project.reimport', { path: dir, proof: first.proof }),
        '已变化',
        '过期 proof 应被拒绝',
      )

      const second = await ws.call('project.analyzeImport', { path: dir })
      must(second.proof !== first.proof, '工程变化后 proof 应不同')
      const result = await ws.call('project.reimport', { path: dir, proof: second.proof })

      must(result.imported.created.includes('sapphire'), '应新增 sapphire')
      must(result.imported.backup, '重新导入应返回备份目录')
      await access(join(result.imported.backup, 'mcstudio', 'project.json'))
    },
  },
]

process.exitCode = await runSuite('16 · 持久化与导入可靠性', cases)
