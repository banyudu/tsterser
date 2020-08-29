import { RawSourceMap } from 'source-map'

/** @deprecated since this versions basically do not exist */
type ECMA_UNOFFICIAL = 6 | 7 | 8 | 9 | 10 | 11

export type ECMA = 5 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | ECMA_UNOFFICIAL

export interface Comment {
  value: string
  type: 'comment1' | 'comment2' | 'comment3' | 'comment4' | 'comment5'
  pos: number
  line: number
  col: number
  nlb?: boolean
}

export interface SourceMapOptions {
  /** Source map object, 'inline' or source map file content */
  content?: RawSourceMap | string
  includeSources?: boolean
  filename?: string
  root?: string
  url?: string | 'inline'
  asObject?: any
  file?: string
  orig?: RawSourceMap
  orig_line_diff?: number
  dest_line_diff?: number
}

export interface ParseOptions {
  bare_returns?: boolean
  ecma?: ECMA
  html5_comments?: boolean
  shebang?: boolean
  toplevel?: any
  filename?: string
  strict?: boolean
  expression?: boolean
  module?: boolean
}

export interface CompressOptions {
  arguments?: boolean
  arrows?: boolean
  booleans_as_integers?: boolean
  booleans?: boolean
  collapse_vars?: boolean
  comparisons?: boolean
  computed_props?: boolean
  conditionals?: boolean
  dead_code?: boolean
  defaults?: boolean
  directives?: boolean
  drop_console?: boolean
  drop_debugger?: boolean
  ecma?: ECMA
  evaluate?: boolean
  expression?: boolean
  global_defs?: object
  hoist_funs?: boolean
  hoist_props?: boolean
  hoist_vars?: boolean
  ie8?: boolean
  if_return?: boolean
  inline?: boolean | InlineFunctions
  join_vars?: boolean
  keep_classnames?: boolean | RegExp
  keep_fargs?: boolean
  keep_fnames?: boolean | RegExp
  keep_infinity?: boolean
  loops?: boolean
  module?: boolean
  negate_iife?: boolean
  passes?: number
  properties?: boolean
  pure_funcs?: string[]
  pure_getters?: boolean | 'strict'
  reduce_funcs?: boolean
  reduce_vars?: boolean
  sequences?: boolean | number
  side_effects?: boolean
  switches?: boolean
  toplevel?: boolean
  top_retain?: null | string | string[] | RegExp
  typeofs?: boolean
  unsafe_arrows?: boolean
  unsafe?: boolean
  unsafe_comps?: boolean
  unsafe_Function?: boolean
  unsafe_math?: boolean
  unsafe_symbols?: boolean
  unsafe_methods?: boolean
  unsafe_proto?: boolean
  unsafe_regexp?: boolean
  unsafe_undefined?: boolean
  unused?: boolean
  warnings?: boolean | 'verbose'
}

export enum InlineFunctions {
  Disabled = 0,
  SimpleFunctions = 1,
  WithArguments = 2,
  WithArgumentsAndVariables = 3
}

export interface MangleOptions {
  ie8?: boolean
  eval?: boolean
  keep_classnames?: boolean | RegExp
  keep_fnames?: boolean | RegExp
  module?: boolean
  properties?: false | ManglePropertiesOptions
  reserved?: Set<string>
  safari10?: boolean
  toplevel?: boolean
  cache?: false | { props: Map<string, string> }
}

export interface ManglePropertiesOptions {
  builtins?: boolean
  debug?: boolean | string
  keep_quoted?: boolean | 'strict'
  regex?: RegExp | string
  reserved?: string[]
  cache?: any
  undeclared?: any
  only_cache?: boolean
}

export interface OutputOptions {
  ascii_only?: boolean
  beautify?: boolean
  braces?: boolean
  comments?: boolean | 'all' | 'some' | RegExp | ((node: any, comment: Comment) => boolean)
  ecma?: ECMA
  ie8?: boolean
  indent_level?: number
  indent_start?: number
  inline_script?: boolean
  keep_quoted_props?: boolean
  max_line_len?: number | false
  preamble?: string
  preserve_annotations?: boolean
  quote_keys?: boolean
  quote_style?: OutputQuoteStyle
  safari10?: boolean
  semicolons?: boolean
  shebang?: boolean
  shorthand?: boolean
  // source_map?: SourceMapOptions;
  source_map?: any
  webkit?: boolean
  width?: number
  wrap_iife?: boolean
  wrap_func_args?: boolean
  ast?: any
  code?: any
  keep_numbers?: boolean
}

export enum OutputQuoteStyle {
  PreferDouble = 0,
  AlwaysSingle = 1,
  AlwaysDouble = 2,
  AlwaysOriginal = 3
}

export interface MozillaAst {
  loc: any
  range: [number, number]
  start: MozillaAst
  superClass: MozillaAst
  prefix?: boolean
  arguments: MozillaAst[]
  callee: MozillaAst
  operator: string
  param: MozillaAst
  delegate: boolean
  await: boolean
  update: MozillaAst
  cases: MozillaAst[]
  discriminant: MozillaAst
  init: MozillaAst
  label: MozillaAst
  exported: MozillaAst
  alternate: MozillaAst
  imported: MozillaAst
  meta: MozillaAst
  local: MozillaAst
  specifiers: MozillaAst[]
  test: MozillaAst
  declarations: MozillaAst[]
  regex: any
  raw: any
  declaration: MozillaAst
  source: MozillaAst
  method: boolean
  consequent: MozillaAst[] | MozillaAst
  type: string
  body: MozillaAst | MozillaAst[]
  elements: MozillaAst[]
  properties: MozillaAst[]
  left: MozillaAst
  right: MozillaAst
  argument: MozillaAst
  expressions: MozillaAst[]
  value: any
  quasis: MozillaAst[]
  quasi: MozillaAst
  tag: MozillaAst
  id: MozillaAst
  params: MozillaAst[]
  generator: boolean
  async: boolean
  expression: MozillaAst
  handlers: MozillaAst[]
  guardedHandlers: any[]
  block: MozillaAst
  key: MozillaAst
  handler: MozillaAst
  kind: string
  computed: boolean
  name: any
  finalizer: MozillaAst
  property: MozillaAst
  object: MozillaAst
  static: boolean
}
