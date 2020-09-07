import AST_Node from './node'
import { OutputStream } from '../output'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import Compressor from '../compressor'
import { to_moz, key_size, static_size, make_node, lift_key, lambda_modifiers, is_ast_object, is_ast_symbol_method, is_ast_return, is_ast_symbol, is_ast_symbol_ref } from '../utils'
import AST_Lambda from './lambda'
import AST_Arrow from './arrow'
import { MozillaAst } from '../types'

export default class AST_ConciseMethod extends AST_ObjectProperty {
  async: boolean
  is_generator: boolean
  static: boolean
  quote: string|undefined
  value: AST_Lambda

  _optimize (compressor: Compressor): AST_ConciseMethod {
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
      const arrow = make_node('AST_Arrow', this.value, this.value) as AST_Arrow
      arrow.async = this.async
      arrow.is_generator = this.is_generator
      return make_node('AST_ObjectKeyVal', this, {
        key: is_ast_symbol_method(this.key) ? this.key.name : this.key,
        value: arrow,
        quote: this.quote
      }) as AST_ConciseMethod
    }
    return this
  }

  drop_side_effect_free (): AST_Node | null {
    return this.computed_key() ? this.key as any : null
  }

  may_throw (compressor: Compressor) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  computed_key () {
    return !(is_ast_symbol_method(this.key))
  }

  _size (): number {
    return static_size(this.static) + key_size(this.key) + lambda_modifiers(this)
  }

  shallow_cmp_props: any = {
    static: 'eq',
    is_generator: 'eq',
    async: 'eq'
  }

  _to_mozilla_ast (parent: AST_Node): MozillaAst {
    if (is_ast_object(parent)) {
      return {
        type: 'Property',
        computed: !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key),
        kind: 'init',
        method: true,
        shorthand: false,
        key: to_moz(this.key),
        value: to_moz(this.value)
      } as any
    }
    return {
      type: 'MethodDefinition',
      computed: !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key),
      kind: (this.key as any) === 'constructor' ? 'constructor' : 'method',
      static: this.static,
      key: to_moz(this.key),
      value: to_moz(this.value)
    }
  }

  _codegen (output: OutputStream) {
    let type
    if (this.is_generator && this.async) {
      type = 'async*'
    } else if (this.is_generator) {
      type = '*'
    } else if (this.async) {
      type = 'async'
    }
    this._print_getter_setter(type, output)
  }

  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] is this method static (classes only)',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }

  static documentation = 'An ES6 concise method inside an object or class'

  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static', 'is_generator', 'async'])
  constructor (args: AST_ConciseMethod_Props) {
    super(args)
    this.quote = args.quote
    this.static = args.static
    this.is_generator = args.is_generator
    this.async = args.async
  }
}

export interface AST_ConciseMethod_Props extends AST_ObjectProperty_Props {
  quote?: string|undefined | undefined
  static?: boolean | undefined
  is_generator?: boolean | undefined
  async?: boolean | undefined
}
