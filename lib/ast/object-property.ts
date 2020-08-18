import AST_Node from './node'
import { lift_key, make_sequence, return_false, to_moz, pass_through, print_property_name } from '../utils'

export default class AST_ObjectProperty extends AST_Node {
  key: any
  value: any
  quote: any

  _optimize (self, compressor) {
    return lift_key(self, compressor)
  }

  drop_side_effect_free = function (compressor: any, first_in_statement) {
    const computed_key = this.isAst('AST_ObjectKeyVal') && this.key?.isAst?.('AST_Node')
    const key = computed_key && this.key.drop_side_effect_free(compressor, first_in_statement)
    const value = this.value.drop_side_effect_free(compressor, first_in_statement)
    if (key && value) {
      return make_sequence(this, [key, value])
    }
    return key || value
  }

  may_throw = function (compressor: any) {
    // TODO key may throw too
    return this.value.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return (
      this.computed_key() && this.key.has_side_effects(compressor) ||
          this.value.has_side_effects(compressor)
    )
  }

  is_constant_expression = function () {
    return !(this.key?.isAst?.('AST_Node')) && this.value.is_constant_expression()
  }

  _dot_throw = return_false
  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.key?.isAst?.('AST_Node')) { this.key._walk(visitor) }
      this.value._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.value)
    if (this.key?.isAst?.('AST_Node')) push(this.key)
  }

  shallow_cmp = pass_through as any
  _transform (self, tw: any) {
    if (self.key?.isAst?.('AST_Node')) {
      self.key = self.key.transform(tw)
    }
    if (self.value) self.value = self.value.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    var key = this.key?.isAst?.('AST_Node') ? to_moz(this.key) : {
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
    var kind
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key?.isAst?.('AST_Symbol')) || this.key?.isAst?.('AST_SymbolRef')
    if (parent?.isAst?.('AST_Class')) {
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

  _print_getter_setter = function (this: any, type: string, output: any) {
    var self = this
    if (self.static) {
      output.print('static')
      output.space()
    }
    if (type) {
      output.print(type)
      output.space()
    }
    if (self.key?.isAst?.('AST_SymbolMethod')) {
      print_property_name(self.key.name, self.quote, output)
    } else {
      output.with_square(function () {
        self.key.print(output)
      })
    }
    self.value._do_print(output, true)
  }

  add_source_map = function (output) { output.add_mapping(this.start, this.key) }
  static documentation = 'Base class for literal object properties'
  static propdoc = {
    key: '[string|AST_Node] property name. For ObjectKeyVal this is a string. For getters, setters and computed property this is an AST_Node.',
    value: '[AST_Node] property value.  For getters and setters this is an AST_Accessor.'
  } as any

  static PROPS = AST_Node.PROPS.concat(['key', 'value'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.key = args.key
    this.value = args.value
  }
}
