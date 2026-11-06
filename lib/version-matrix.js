/**
 * 版本能力表：脚手架与模板可用的 loader × MC 版本组合。
 *
 * v0.4 只覆盖 1.20.1；不在表内的组合直接拒绝，避免生成不可编译的工程。
 */

export const SUPPORTED_MC = '1.20.1'

const MATRIX = {
  forge: {
    '1.20.1': {
      loader: 'forge',
      minecraft: '1.20.1',
      loaderVersion: '47.4.16',
      mappings: 'parchment 2023.09.03-1.20.1',
      javaVersion: 17,
      gradleVersion: '8.1.1',
    },
  },
  neoforge: {
    '1.20.1': {
      loader: 'neoforge',
      minecraft: '1.20.1',
      loaderVersion: '47.1.106',
      mappings: 'parchment 2023.09.03-1.20.1',
      javaVersion: 17,
      gradleVersion: '8.1.1',
    },
  },
  fabric: {
    '1.20.1': {
      loader: 'fabric',
      minecraft: '1.20.1',
      loaderVersion: '0.15.11',
      fabricVersion: '0.92.2+1.20.1',
      mappings: 'yarn 1.20.1+build.10',
      javaVersion: 17,
      gradleVersion: '8.1.1',
    },
  },
}

/** 查版本矩阵；不支持时返回 null。 */
export function resolveMatrix(loader, minecraft = SUPPORTED_MC) {
  const entry = MATRIX[String(loader ?? '').toLowerCase()]?.[String(minecraft ?? '')]
  return entry ? { ...entry } : null
}

/** 列出所有支持的组合（供界面与错误提示）。 */
export function listMatrix() {
  const list = []
  for (const [loader, versions] of Object.entries(MATRIX)) {
    for (const [minecraft, entry] of Object.entries(versions)) {
      list.push({ ...entry })
    }
  }
  return list
}

/** 该组合是否支持。 */
export function supports(loader, minecraft = SUPPORTED_MC) {
  return Boolean(resolveMatrix(loader, minecraft))
}
