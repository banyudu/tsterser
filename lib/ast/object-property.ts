import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import { lift_key, make_sequence, to_moz, print_property_name, is_ast_node, is_ast_symbol, is_ast_symbol_ref, is_ast_class, is_ast_object_key_val, is_ast_symbol_method } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_ObjectProperty extends AST_Node {
  key: any
  value: any
  quote: any
  static: boolean

  computed_key () { return false }

  _optimize (compressor: Compressor) {
    return lift_key(this, compressor)
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement?: Function | boolean) {
    const computed_key = is_ast_object_key_val(this) && is_ast_node(this.key)
    const key = computed_key && this.key.drop_side_effect_free(compressor, first_in_statement)
    const value = this.value.drop_side_effect_free(compressor, first_in_statement)
    if (key && value) {
      return make_sequence(this, [key, value])
    }
    return key || value
  }

  may_throw (compressor: Compressor) {
    // TODO key may throw too
    return this.value.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return (
      this.computed_key() && this.key.has_side_effects(compressor) ||
              this.value.has_side_effects(compressor)
    )
  }

  is_constant_expression () {
    return !(is_ast_node(this.key)) && this.value.is_constant_expression()
  }

  _dot_throw () { return false }
  _walk (visitor: any) {
    return visitor._visit(this, function (this) {
      if (is_ast_node(this.key)) { this.key._walk(visitor) }
      this.value._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.value)
    if (is_ast_node(this.key)) push(this.key)
  }

  shallow_cmp () {
    return true
  }

  _transform (tw: TreeWalker) {
    if (is_ast_node(this.key)) {
      this.key = this.key.transform(tw)
    }
    if (this.value) this.value = this.value.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
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
    let kind
    const string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    const computed = string_or_num ? false : !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key)
    if (is_ast_class(parent)) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: (this as any).static,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(this.value)
    }
  }

  _print_getter_setter (type: string, output: OutputStream) {
    const self = this
    if (self.static) {
      output.print('static')
      output.space()
    }
    if (type) {
      output.print(type)
      output.space()
    }
    if (is_ast_symbol_method(self.key)) {
      print_property_name(self.key.name, self.quote, output)
    } else {
      output.with_square(function () {
        self.key.print(output)
      })
    }
    self.value._do_print(output, true)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start, this.key) }
  static documentation = 'Base class for literal object properties'
  static propdoc = {
    key: '[string|AST_Node] property name. For ObjectKeyVal this is a string. For getters, setters and computed property this is an AST_Node.',
    value: '[AST_Node] property value.  For getters and setters this is an AST_Accessor.'
  } as any

  static PROPS = AST_Node.PROPS.concat(['key', 'value'])
  constructor (args?: AST_ObjectProperty_Props) {
    super(args)
    this.key = args.key
    this.value = args.value
  }
}

export interface AST_ObjectProperty_Props extends AST_Node_Props {
  key?: any | undefined
  value?: any | undefined
}
