import TreeWalker from '../tree-walker'
import AST_Node from './node'
import { OutputStream } from '../output'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import Compressor from '../compressor'
import { to_moz, print_property_name, static_size, make_sequence, is_ast_node, is_ast_symbol_class_property, is_ast_symbol, is_ast_symbol_ref } from '../utils'

export default class AST_ClassProperty extends AST_ObjectProperty {
  quote: string
  static: boolean

  _to_mozilla_ast (parent: AST_Node) {
    let key: any = is_ast_node(this.key) ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
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

  drop_side_effect_free (compressor: Compressor) {
    const key = this.computed_key() && this.key.drop_side_effect_free(compressor)

    const value = this.static && this.value &&
              this.value.drop_side_effect_free(compressor)

    if (key && value) return make_sequence(this, [key, value])
    return key || value || null
  }

  may_throw (compressor: Compressor) {
    return (
      this.computed_key() && this.key.may_throw(compressor) ||
              this.static && this.value && this.value.may_throw(compressor)
    )
  }

  has_side_effects (compressor: Compressor) {
    return (
      this.computed_key() && this.key.has_side_effects(compressor) ||
              this.static && this.value && this.value.has_side_effects(compressor)
    )
  }

  walkInner = (visitor: TreeWalker) => {
    if (is_ast_node(this.key)) { this.key._walk(visitor) }
    if (is_ast_node(this.value)) { this.value._walk(visitor) }
  }

  _children_backwards (push: Function) {
    if (is_ast_node(this.value)) push(this.value)
    if (is_ast_node(this.key)) push(this.key)
  }

  computed_key () {
    return !(is_ast_symbol_class_property(this.key))
  }

  _size (): number {
    return (
      static_size(this.static) +
                (typeof this.key === 'string' ? this.key.length + 2 : 0) +
                (this.value ? 1 : 0)
    )
  }

  shallow_cmp_props: any = {
    static: 'eq'
  }

  _codegen (output: OutputStream) {
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

  static documentation = 'A class property'
  static propdoc = {
    static: '[boolean] whether this is a static key',
    quote: '[string] which quote is being used'
  }

  static PROPS = AST_ObjectProperty.PROPS.concat(['static', 'quote'])
  constructor (args?: AST_ClassProperty_Props) {
    super(args)
    this.static = args.static
    this.quote = args.quote
  }
}

export interface AST_ClassProperty_Props extends AST_ObjectProperty_Props {
  static?: boolean | undefined
  quote?: string | undefined
}
