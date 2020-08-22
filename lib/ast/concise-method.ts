import AST_ObjectProperty from './object-property'
import Compressor from '../compressor'
import { to_moz, key_size, static_size, mkshallow, make_node, lift_key, lambda_modifiers, is_ast_object, is_ast_symbol_method, is_ast_return, is_ast_symbol, is_ast_symbol_ref } from '../utils'

export default class AST_ConciseMethod extends AST_ObjectProperty {
  async: any
  is_generator: any
  static: any
  quote: any

  _optimize (compressor) {
    lift_key(this, compressor)
    // p(){return x;} ---> p:()=>x
    if (compressor.option('arrows') &&
          is_ast_object(compressor.parent()) &&
          !this.is_generator &&
          !this.value.uses_arguments &&
          !this.value.pinned() &&
          this.value.body.length == 1 &&
          is_ast_return(this.value.body[0]) &&
          this.value.body[0].value &&
          !this.value.contains_this()) {
      const arrow = make_node('AST_Arrow', this.value, this.value)
      arrow.async = this.async
      arrow.is_generator = this.is_generator
      return make_node('AST_ObjectKeyVal', this, {
        key: is_ast_symbol_method(this.key) ? this.key.name : this.key,
        value: arrow,
        quote: this.quote
      })
    }
    return this
  }

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: Compressor) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: Compressor) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  computed_key () {
    return !(is_ast_symbol_method(this.key))
  }

  _size = function (): number {
    return static_size(this.static) + key_size(this.key) + lambda_modifiers(this)
  }

  shallow_cmp = mkshallow({
    static: 'eq',
    is_generator: 'eq',
    async: 'eq'
  })

  _to_mozilla_ast (parent) {
    if (is_ast_object(parent)) {
      return {
        type: 'Property',
        computed: !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key),
        kind: 'init',
        method: true,
        shorthand: false,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'MethodDefinition',
      computed: !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key),
      kind: this.key === 'constructor' ? 'constructor' : 'method',
      static: this.static,
      key: to_moz(this.key),
      value: to_moz(this.value)
    }
  }

  _codegen = function (self, output) {
    let type
    if (self.is_generator && self.async) {
      type = 'async*'
    } else if (self.is_generator) {
      type = '*'
    } else if (self.async) {
      type = 'async'
    }
    self._print_getter_setter(type, output)
  }

  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] is this method static (classes only)',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }

  static documentation = 'An ES6 concise method inside an object or class'

  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static', 'is_generator', 'async'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
    this.is_generator = args.is_generator
    this.async = args.async
  }
}
