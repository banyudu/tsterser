import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { push_uniq, is_ast_node } from '../utils'
import SymbolDef from '../symbol-def'
import { MangleOptions, MozillaAst } from '../types'
import AST_Scope from './scope'

let mangle_options: MangleOptions | undefined

export default class AST_Symbol extends AST_Node {
  thedef: SymbolDef
  name: string
  scope: AST_Scope

  fixed_value () {
    const fixed = this.thedef.fixed
    if (!fixed || is_ast_node(fixed)) return fixed
    return fixed()
  }

  mark_enclosed () {
    const def = this.definition()
    let s = this.scope
    while (s) {
      push_uniq(s.enclosed, def)
      if (s === def.scope) break
      s = s.parent_scope
    }
  }

  reference () {
    this.definition().references.push(this)
    this.mark_enclosed()
  }

  unmangleable (options: MangleOptions): any {
    const def = this.definition()
    return !def || def.unmangleable(options)
  }

  unreferenced () {
    return !this.definition().references.length && !this.scope.pinned()
  }

  definition () {
    return this.thedef
  }

  global () {
    return this.thedef.global
  }

  _size (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
      ? this.name.length
      : 2
  }

  shallow_cmp_props: any = {
    name: 'eq'
  }

  _to_mozilla_ast (parent: AST_Node): MozillaAst {
    const def = this.definition()
    return {
      type: 'Identifier',
      name: def ? def.mangled_name || def.name : this.name
    }
  }

  _do_print (output: OutputStream) {
    const def = this.definition()
    output.print_name(def ? def.mangled_name || def.name : this.name)
  }

  _codegen (output: OutputStream) {
    this._do_print(output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static propdoc = {
    name: '[string] name of this symbol',
    scope: '[AST_Scope] the current scope (not necessarily the definition scope)',
    thedef: '[SymbolDef] the definition of this symbol'
  } as any

  static documentation = 'Base class for all symbols'

  static PROPS = AST_Node.PROPS.concat(['scope', 'name', 'thedef'])
  constructor (args?: AST_Symbol_Props) {
    super(args)
    this.scope = args.scope
    this.name = args.name
    this.thedef = args.thedef
  }
}

export interface AST_Symbol_Props extends AST_Node_Props {
  scope?: any | undefined
  name?: any | undefined
  thedef?: any | undefined
}
