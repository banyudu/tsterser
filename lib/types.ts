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
  ecma: ECMA
  evaluate?: boolean
  expression?: boolean
  global_defs?: object
  hoist_funs?: boolean
  hoist_props?: boolean
  hoist_vars?: boolean
  ie8?: boolean
  if_return?: boolean
  inline: boolean | InlineFunctions
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
  toplevel?: boolean | string
  top_retain?: null | string | string[] | RegExp
  typeofs?: boolean
  unsafe_arrows?: boolean
  unsafe?: boolean
  unsafe_comps?: boolean
  unsafe_Function?: boolean
  unsafe_math: boolean
  unsafe_symbols?: boolean
  unsafe_methods?: boolean | RegExp
  unsafe_proto?: boolean
  unsafe_regexp?: boolean
  unsafe_undefined?: boolean
  unused?: boolean | string
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
  properties?: ManglePropertiesOptions
  reserved?: Set<string>
  safari10?: boolean
  toplevel?: boolean
  cache?: { props: Map<string, string> }
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
  preamble?: string | null
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
  loc?: any
  range?: [number, number]
  start?: MozillaAst | number
  superClass?: MozillaAst | null
  prefix?: boolean
  arguments?: Array<MozillaAst | null>
  callee?: MozillaAst
  operator?: string
  param?: MozillaAst
  delegate?: boolean
  await?: boolean
  update?: MozillaAst
  cases?: Array<MozillaAst | null>
  discriminant?: MozillaAst
  init?: MozillaAst | null
  label?: MozillaAst
  exported?: MozillaAst
  alternate?: MozillaAst
  imported?: MozillaAst
  meta?: MozillaAst
  local?: MozillaAst
  specifiers?: MozillaAst[]
  test?: MozillaAst
  declarations?: Array<MozillaAst | null>
  regex?: any
  raw?: any
  declaration?: MozillaAst | null
  source?: MozillaAst | null
  method?: boolean
  consequent?: Array<MozillaAst | null> | MozillaAst
  type: string
  body?: MozillaAst | Array<MozillaAst | null>
  elements?: Array<MozillaAst | null>
  properties?: Array<MozillaAst | null>
  left?: MozillaAst | null
  right?: MozillaAst
  argument?: MozillaAst | null
  expressions?: Array<MozillaAst | null>
  value?: any
  quasis?: Array<MozillaAst | null>
  quasi?: MozillaAst
  tag?: MozillaAst
  id?: MozillaAst | null
  params?: Array<MozillaAst | null>
  generator?: boolean
  async?: boolean
  expression?: MozillaAst | null
  handlers?: Array<MozillaAst | null>
  guardedHandlers?: any[]
  block?: MozillaAst
  key?: MozillaAst
  handler?: MozillaAst
  kind?: string
  computed?: boolean
  name?: any
  finalizer?: MozillaAst | null
  property?: MozillaAst
  object?: MozillaAst
  static?: boolean
  end?: any
}

export interface MozillaAstArrayPattern extends MozillaAst {
  elements: Array<MozillaAst | null>
}

export interface MozillaAstArrayExpression extends MozillaAst {
  elements: Array<MozillaAst | null>
}

export interface MozillaAstObjectPattern extends MozillaAst {
  properties: MozillaAst[]
}

export interface MozillaAstObjectExpression extends MozillaAst {
  properties: MozillaAst[]
}

export interface MozillaAstTemplateLiteral extends MozillaAst {
  expressions: Array<MozillaAst | null>
}

export interface MozillaAstSequenceExpression extends MozillaAst {
  expressions: Array<MozillaAst | null>
}

export interface MozillaAstProperty extends MozillaAst {
  key: MozillaAst
}

export interface MozillaAstMethodDefinition extends MozillaAst {
  key: MozillaAst
}

export interface MozillaAstFieldDefinition extends MozillaAst {
  key: MozillaAst
}

export interface MozillaAstFunctionDeclaration extends MozillaAst {
  params: Array<MozillaAst | null>
}

export interface MozillaAstFunctionExpression extends MozillaAst {
  params: Array<MozillaAst | null>
}

export interface MozillaAstArrowFunctionExpression extends MozillaAst {
  params: Array<MozillaAst | null>
}

export interface MozillaAstMemberExpression extends MozillaAst {
  property: MozillaAst
}

export interface MozillaAstVariableDeclaration extends MozillaAst {
  declarations: Array<MozillaAst | null>
}

export interface MozillaAstImportDeclaration extends MozillaAst {
  specifiers: MozillaAst[]
}

export interface MozillaAstMetaProperty extends MozillaAst {
  meta: MozillaAst
  property: MozillaAst
}

export interface MozillaAstSwitchStatement extends MozillaAst {
  cases: Array<MozillaAst | null>
}

export interface MozillaAstNewExpression extends MozillaAst {
  arguments: Array<MozillaAst | null>
}

export interface MozillaAstCallExpression extends MozillaAst {
  arguments: Array<MozillaAst | null>
}

export interface MozillaAstBinaryExpression extends MozillaAst {
  operator: string
}

export interface MozillaAstLogicalExpression extends MozillaAst {
  operator: string
}

export interface MozillaAstAssignmentExpression extends MozillaAst {
  operator: string
}

export interface MinifyOptions {
  compress?: false | CompressOptions
  ecma?: ECMA
  ie8?: boolean
  keep_classnames?: boolean | RegExp
  keep_fnames?: boolean | RegExp
  mangle?: MangleOptions
  module?: boolean
  nameCache?: AnyObject
  output?: OutputOptions
  parse?: ParseOptions
  safari10?: boolean
  sourceMap?: false | SourceMapOptions
  toplevel?: boolean
  warnings?: boolean | 'verbose'
  timings?: boolean
  rename?: boolean
  wrap?: boolean
  enclose?: boolean
}
