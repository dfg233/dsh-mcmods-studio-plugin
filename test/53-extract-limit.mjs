/**
 * 用例 53：ZIP 解压输出上限（Q06）。
 *
 * 通过一个小型本地头 + 高压缩比 deflate 数据，验证 readEntryData 拒绝超限输出。
 */

import { deflateRawSync } from 'node:zlib'

import { equal, must, runSuite } from './helpers.mjs'
import { readEntryData } from '../lib/mdk.js'

const LIMIT = 64 * 1024 * 1024

function makeEntry(compressibleBytes, declaredBytes = compressibleBytes) {
  const payload = Buffer.alloc(compressibleBytes, 0x61)
  const deflated = deflateRawSync(payload, { level: 9 })
  const name = Buffer.from('test', 'utf8')
  const buffer = Buffer.alloc(30 + name.length + deflated.length)
  buffer.writeUInt32LE(0x04034b50, 0)
  buffer.writeUInt16LE(8, 8)
  buffer.writeUInt32LE(deflated.length, 18)
  buffer.writeUInt32LE(declaredBytes, 22)
  buffer.writeUInt16LE(name.length, 26)
  name.copy(buffer, 30)
  deflated.copy(buffer, 30 + name.length)
  return {
    zip: { buf: buffer, entries: [] },
    entry: { name: 'test', method: 8, compressed: deflated.length, uncompressed: declaredBytes, localOffset: 0 },
  }
}

const cases = [
  {
    name: '正常条目解压正常',
    async run() {
      const { zip, entry } = makeEntry(1024)
      const data = readEntryData(zip, entry)
      equal(data.length, 1024, '解压长度正确')
    },
  },
  {
    name: '声明小、实际膨胀大被拒绝',
    async run() {
      // 声明 1KB，实际解压约 80MB：必须按上限拒绝
      const { zip, entry } = makeEntry(LIMIT + 16 * 1024 * 1024, 1024)
      let code = ''
      try {
        readEntryData(zip, entry)
      } catch (error) {
        code = error.code || ''
      }
      equal(code, 'EXTRACT_LIMIT', '应抛出 EXTRACT_LIMIT')
    },
  },
]

process.exitCode = await runSuite('53 · ZIP 解压边界', cases)
