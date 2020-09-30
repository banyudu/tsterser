import { in_function_defs, redefined_catch_def, keep_name, is_ast_node, is_ast_symbol_lambda, is_ast_symbol_defun, is_ast_symbol_method, is_ast_symbol_class, is_ast_symbol_def_class } from './utils'
import { MASK_EXPORT_DONT_MANGLE } from './constants'
import { MangleOptions } from './types'

export default class SymbolDef {
  public name: string
  public orig: any[]
  public init: boolean
  public eliminated: number
  public assignments: number
  public scope: any
  public replaced: number
  public global: boolean
  public export: number
  public mangled_name: any
  public undeclared: boolean
  public id: number
  public static next_id: any
  public chained: boolean
  public direct_access: boolean
  public escaped: number
  public recursive_refs: number
  public references: any[]
  public should_replace: any
  public single_use: string | boolean | undefined
  public fixed: any
  public constructor (scope: any | null, orig: { name: string }, init?: any) {
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

  protected fixed_value () {
    if (!this.fixed || is_ast_node(this.fixed)) return this.fixed
    return this.fixed()
  }

  public unmangleable (options: MangleOptions) {
    if (!options) options = {}
    const firstOrig = this.orig[0]
    if (in_function_defs(this.id) && keep_name(options.keep_fnames, firstOrig.name)) return true

    return (this.global && !options.toplevel) ||
            (this.export & MASK_EXPORT_DONT_MANGLE) ||
            this.undeclared ||
            (!options.eval && this.scope.pinned()) ||
            ((is_ast_symbol_lambda(firstOrig) ||
            is_ast_symbol_defun(firstOrig)) && keep_name(options.keep_fnames, firstOrig.name)) ||
            is_ast_symbol_method(firstOrig) ||
            ((is_ast_symbol_class(firstOrig) ||
              is_ast_symbol_def_class(firstOrig)) && keep_name(options.keep_classnames, firstOrig.name))
  }

  public mangle (options: MangleOptions) {
    const cache = options.cache?.props
    if (this.global && cache && cache.has(this.name)) {
      this.mangled_name = cache.get(this.name)
    } else if (!this.mangled_name && !this.unmangleable(options)) {
      let s = this.scope
      const sym = this.orig[0]
      if (options.ie8 && is_ast_symbol_lambda(sym)) { s = s.parent_scope }
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
