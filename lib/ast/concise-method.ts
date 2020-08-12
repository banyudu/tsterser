import AST_ObjectProperty from './object-property'
import AST_SymbolMethod from './symbol-method'
import AST_Return from './return'
import AST_Object from './object'
import AST_Symbol from './symbol'
import { to_moz, key_size, static_size, mkshallow, make_node, lift_key, lambda_modifiers } from '../utils'

export default class AST_ConciseMethod extends AST_ObjectProperty {
  async: any
  is_generator: any
  static: any
  quote: any

  _optimize = function (self, compressor) {
    lift_key(self, compressor)
    // p(){return x;} ---> p:()=>x
    if (compressor.option('arrows') &&
          compressor.parent() instanceof AST_Object &&
          !self.is_generator &&
          !self.value.uses_arguments &&
          !self.value.pinned() &&
          self.value.body.length == 1 &&
          self.value.body[0] instanceof AST_Return &&
          self.value.body[0].value &&
          !self.value.contains_this()) {
      var arrow = make_node('AST_Arrow', self.value, self.value)
      arrow.async = self.async
      arrow.is_generator = self.is_generator
      return make_node('AST_ObjectKeyVal', self, {
        key: self.key instanceof AST_SymbolMethod ? self.key.name : self.key,
        value: arrow,
        quote: self.quote
      })
    }
    return self
  }

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: any) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
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
    if (parent instanceof AST_Object) {
      return {
        type: 'Property',
        computed: !(this.key instanceof AST_Symbol) || this.key?.isAst?.('AST_SymbolRef'),
        kind: 'init',
        method: true,
        shorthand: false,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'MethodDefinition',
      computed: !(this.key instanceof AST_Symbol) || this.key?.isAst?.('AST_SymbolRef'),
      kind: this.key === 'constructor' ? 'constructor' : 'method',
      static: this.static,
      key: to_moz(this.key),
      value: to_moz(this.value)
    }
  }

  _codegen = function (self, output) {
    var type
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

  TYPE = 'ConciseMethod'
  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static', 'is_generator', 'async'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
    this.is_generator = args.is_generator
    this.async = args.async
  }
}
