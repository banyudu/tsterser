import AST_Node from './node'
import { OutputStream } from '../output'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import Compressor from '../compressor'
import { to_moz, print_property_name, static_size, make_sequence, is_ast_node, is_ast_symbol_class_property, is_ast_symbol, is_ast_symbol_ref } from '../utils'
import { MozillaAst } from '../types'

export default class AST_ClassProperty extends AST_ObjectProperty {
  public quote: string
  public static: boolean
  public key: AST_Node

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    const key = this._to_mozilla_ast_key()
    const string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    const computed = string_or_num ? false : !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key)
    return {
      type: 'FieldDefinition',
      computed,
      key,
      value: to_moz(this.value),
      static: this.static
    }
  }

  public drop_side_effect_free (compressor: Compressor): any {
    const key = this.computed_key() && this.key.drop_side_effect_free(compressor)

    const value = this.static && this.value &&
              this.value.drop_side_effect_free(compressor)

    if (key && value) return make_sequence(this, [key, value])
    return key || value || null
  }

  public may_throw (compressor: Compressor) {
    return (
      (this.computed_key() && this.key.may_throw(compressor)) ||
              (this.static && this.value && this.value.may_throw(compressor))
    )
  }

  public has_side_effects (compressor: Compressor) {
    return (
      (this.computed_key() && this.key.has_side_effects(compressor)) ||
              (this.static && this.value && this.value.has_side_effects(compressor))
    )
  }

  protected walkInner () {
    const result: AST_Node[] = []
    if (is_ast_node(this.key)) { result.push(this.key) }
    if (is_ast_node(this.value)) { result.push(this.value) }
    return result
  }

  public _children_backwards (push: Function) {
    if (is_ast_node(this.value)) push(this.value)
    if (is_ast_node(this.key)) push(this.key)
  }

  public computed_key () {
    return !(is_ast_symbol_class_property(this.key))
  }

  public _size (): number {
    return (
      static_size(this.static) +
                (typeof this.key === 'string' ? (this.key as any).length + 2 : 0) +
                (this.value ? 1 : 0)
    )
  }

  public shallow_cmp_props: any = {
    static: 'eq'
  }

  protected _codegen (output: OutputStream) {
    if (this.static) {
      output.print('static')
      output.space()
    }

    if (is_ast_symbol_class_property(this.key)) {
      print_property_name(this.key.name, this.quote, output)
    } else {
      output.print('[')
      this.key.print(output)
      output.print(']')
    }

    if (this.value) {
      output.print('=')
      this.value.print(output)
    }

    output.semicolon()
  }

  public static documentation = 'A class property'
  public static propdoc ={
    static: '[boolean] whether this is a static key',
    quote: '[string] which quote is being used'
  }

  public static PROPS =AST_ObjectProperty.PROPS.concat(['static', 'quote'])
  public constructor (args: AST_ClassProperty_Props) {
    super(args)
    this.static = args.static ?? false
    this.quote = args.quote ?? ''
    this.key = args.key
  }
}

export interface AST_ClassProperty_Props extends AST_ObjectProperty_Props {
  static?: boolean | undefined
  quote?: string | undefined
  key: AST_Node
}
