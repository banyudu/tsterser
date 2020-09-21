import AST_Node from './node'
import { OutputStream } from '../output'
import AST_ObjectMethodProperty, { AST_ObjectMethodProperty_Props } from './object-method-property'
import Compressor from '../compressor'
import { key_size, static_size, is_ast_symbol_method } from '../utils'

export default class AST_ObjectSetter extends AST_ObjectMethodProperty {
  public quote: string|undefined
  public static: boolean
  public key: AST_Node

  public _to_mozilla_ast_kind (): string | undefined {
    return 'set'
  }

  public drop_side_effect_free (): AST_Node | null {
    return this.computed_key() ? this.key : null
  }

  public may_throw (compressor: Compressor) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  public computed_key () {
    return !(is_ast_symbol_method(this.key))
  }

  public _size (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  }

  public shallow_cmp_props: any = {
    static: 'eq'
  }

  protected _codegen (output: OutputStream) {
    this._print_getter_setter('set', output)
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start, this.key.name) }
  public static propdoc ={
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static setter (classes only)'
  }

  public static documentation = 'An object setter property'

  public static PROPS =AST_ObjectMethodProperty.PROPS.concat(['quote', 'static'])
  public constructor (args: AST_ObjectSetter_Props) {
    super(args)
    this.quote = args.quote
    this.static = args.static ?? false
    this.key = args.key
  }
}

export interface AST_ObjectSetter_Props extends AST_ObjectMethodProperty_Props {
  quote: string|undefined | undefined
  static: boolean | undefined
  key: AST_Node
}
