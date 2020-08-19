import AST_ObjectProperty from './object-property'
import Compressor from '../compressor'
import { to_moz, key_size, static_size, mkshallow, return_true } from '../utils'

export default class AST_ObjectGetter extends AST_ObjectProperty {
  static: any
  quote: any

  _to_mozilla_ast (parent) {
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
    if (this?.isAst?.('AST_ObjectGetter')) {
      kind = 'get'
    }
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

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: Compressor) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: Compressor) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  _dot_throw = return_true
  computed_key () {
    return !(this.key?.isAst?.('AST_SymbolMethod'))
  }

  _size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  }

  shallow_cmp = mkshallow({
    static: 'eq'
  })

  _codegen = function (self, output) {
    self._print_getter_setter('get', output)
  }

  add_source_map = function (output) { output.add_mapping(this.start, this.key.name) }
  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static getter (classes only)'
  }

  static documentation = 'An object getter property'

  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
  }
}
