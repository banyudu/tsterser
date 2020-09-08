import AST_Node from './node'
import AST_Accessor from './accessor'
import { OutputStream } from '../output'
import AST_ObjectMethodProperty, { AST_ObjectMethodProperty_Props } from './object-method-property'
import Compressor from '../compressor'
import { key_size, static_size, is_ast_symbol_method } from '../utils'

export default class AST_ObjectGetter extends AST_ObjectMethodProperty {
  static: boolean
  quote: string|undefined
  key: AST_Node
  value: AST_Accessor

  _to_mozilla_ast_kind (): string | undefined {
    return 'get'
  }

  drop_side_effect_free (): AST_Node | null {
    return this.computed_key() ? this.key : null
  }

  may_throw (compressor: Compressor) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  _dot_throw () { return true }
  computed_key () {
    return !(is_ast_symbol_method(this.key))
  }

  _size (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  }

  shallow_cmp_props: any = {
    static: 'eq'
  }

  _codegen (output: OutputStream) {
    this._print_getter_setter('get', output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start, this.key.name) }
  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static getter (classes only)'
  }

  static documentation = 'An object getter property'

  static PROPS = AST_ObjectMethodProperty.PROPS.concat(['quote', 'static'])
  constructor (args: AST_ObjectGetter_Props) {
    super(args)
    this.quote = args.quote
    this.static = args.static
  }
}

export interface AST_ObjectGetter_Props extends AST_ObjectMethodProperty_Props {
  quote?: string|undefined | undefined
  static?: boolean | undefined
}
