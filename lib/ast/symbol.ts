import AST_Node from './node'
import { push_uniq, mkshallow } from '../utils'

let mangle_options

export default class AST_Symbol extends AST_Node {
  thedef: any
  name: any
  scope: any

  fixed_value = function () {
    var fixed = this.thedef.fixed
    if (!fixed || fixed instanceof AST_Node) return fixed
    return fixed()
  }

  mark_enclosed = function () {
    var def = this.definition()
    var s = this.scope
    while (s) {
      push_uniq(s.enclosed, def)
      if (s === def.scope) break
      s = s.parent_scope
    }
  }

  reference = function () {
    this.definition().references.push(this)
    this.mark_enclosed()
  }

  unmangleable = function (options: any) {
    var def = this.definition()
    return !def || def.unmangleable(options)
  }

  unreferenced = function () {
    return !this.definition().references.length && !this.scope.pinned()
  }

  definition = function () {
    return this.thedef
  }

  global = function () {
    return this.thedef.global
  }

  _size (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
      ? this.name.length
      : 2
  }

  shallow_cmp = mkshallow({
    name: 'eq'
  })

  _to_mozilla_ast (parent) {
    var def = this.definition()
    return {
      type: 'Identifier',
      name: def ? def.mangled_name || def.name : this.name
    }
  }

  _do_print = function (output: any) {
    var def = this.definition()
    output.print_name(def ? def.mangled_name || def.name : this.name)
  }

  _codegen = function (self, output) {
    self._do_print(output)
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static propdoc = {
    name: '[string] name of this symbol',
    scope: '[AST_Scope/S] the current scope (not necessarily the definition scope)',
    thedef: '[SymbolDef/S] the definition of this symbol'
  } as any

  static documentation = 'Base class for all symbols'

  TYPE = 'Symbol'
  static PROPS = AST_Node.PROPS.concat(['scope', 'name', 'thedef'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.scope = args.scope
    this.name = args.name
    this.thedef = args.thedef
  }
}
