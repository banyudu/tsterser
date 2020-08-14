import { in_function_defs, redefined_catch_def, keep_name } from './utils'
import { MASK_EXPORT_DONT_MANGLE } from './constants'

export default class SymbolDef {
  name: any
  orig: any[]
  init: any
  eliminated: number
  assignments: number
  scope: any
  replaced: number
  global: boolean
  export: number
  mangled_name: any
  undeclared: boolean
  id: number
  static next_id: any
  chained: boolean
  direct_access: boolean
  escaped: number
  recursive_refs: number
  references: any[]
  should_replace: any
  single_use: boolean
  fixed: any
  constructor (scope: any | null, orig: { name: string }, init?: boolean) {
    this.name = orig.name
    this.orig = [orig]
    this.init = init
    this.eliminated = 0
    this.assignments = 0
    this.scope = scope
    this.replaced = 0
    this.global = false
    this.export = 0
    this.mangled_name = null
    this.undeclared = false
    this.id = SymbolDef.next_id++
    this.chained = false
    this.direct_access = false
    this.escaped = 0
    this.recursive_refs = 0
    this.references = []
    this.should_replace = undefined
    this.single_use = false
    this.fixed = false
    Object.seal(this)
  }

  fixed_value () {
    if (!this.fixed || this.fixed?.isAst?.('AST_Node')) return this.fixed
    return this.fixed()
  }

  unmangleable (options: any) {
    if (!options) options = {}

    if (in_function_defs(this.id) && keep_name(options.keep_fnames, this.orig[0].name)) return true

    return this.global && !options.toplevel ||
            (this.export & MASK_EXPORT_DONT_MANGLE) ||
            this.undeclared ||
            !options.eval && this.scope.pinned() ||
            (this.orig[0]?.isAst?.('AST_SymbolLambda') ||
                  this.orig[0]?.isAst?.('AST_SymbolDefun')) && keep_name(options.keep_fnames, this.orig[0].name) ||
            this.orig[0]?.isAst?.('AST_SymbolMethod') ||
            (this.orig[0]?.isAst?.('AST_SymbolClass') ||
                  this.orig[0]?.isAst?.('AST_SymbolDefClass')) && keep_name(options.keep_classnames, this.orig[0].name)
  }

  mangle (options: any) {
    const cache = options.cache && options.cache.props
    if (this.global && cache && cache.has(this.name)) {
      this.mangled_name = cache.get(this.name)
    } else if (!this.mangled_name && !this.unmangleable(options)) {
      var s = this.scope
      var sym = this.orig[0]
      if (options.ie8 && sym?.isAst?.('AST_SymbolLambda')) { s = s.parent_scope }
      const redefinition = redefined_catch_def(this)
      this.mangled_name = redefinition
        ? redefinition.mangled_name || redefinition.name
        : s.next_mangled(options, this)
      if (this.global && cache) {
        cache.set(this.name, this.mangled_name)
      }
    }
  }
}

SymbolDef.next_id = 1
