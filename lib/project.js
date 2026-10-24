/**
 * 项目数据模型的统一出口。
 *
 * 原本这里是 1200 行的大模块，现已按职责拆分：
 *   paths.js    路径与校验
 *   schema.js   字段与枚举定义
 *   meta.js     项目元数据与工坊标记
 *   entries.js  构想与物品条目
 *   import.js   工程扫描与导入
 *
 * 本文件只做转发，保持既有 import 路径不变。
 */

export * from './paths.js'
export * from './schema.js'
export * from './meta.js'
export * from './entries.js'
export * from './import.js'
