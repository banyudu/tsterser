import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Node from './node'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import { make_node, print_property_name, key_size, is_ast_node, is_ast_arrow, is_ast_symbol, is_ast_function, is_ast_symbol_ref, is_ast_object_key_val, is_ast_default_assign } from '../utils'
import { is_identifier_string, RESERVED_WORDS } from '../parse'

export default class AST_ObjectKeyVal extends AST_ObjectProperty {
  quote: string
  key: any
  value: AST_Node

  to_fun_args (croak: Function): any {
    this.value = this.value.to_fun_args(croak)
    return this
  }

  _to_mozilla_ast_computed (): boolean {
    const string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    let computed = string_or_num ? false : !(is_ast_symbol(this.key)) || is_ast_symbol_ref(this.key)
    if (is_ast_object_key_val(this)) {
      computed = !string_or_num
    }
    return computed
  }

  _to_mozilla_ast_kind (): string | undefined {
    if (is_ast_object_key_val(this)) {
      return 'init'
    }
    return undefined
  }

  _optimize (compressor: Compressor): any {
    this.lift_key(compressor)
    // p:function(){} ---> p(){}
    // p:function*(){} ---> *p(){}
    // p:async function(){} ---> async p(){}
    // p:()=>{} ---> p(){}
    // p:async()=>{} ---> async p(){}
    const unsafe_methods = compressor.option('unsafe_methods')
    if (unsafe_methods &&
          compressor.option('ecma') >= 2015 &&
          (!(unsafe_methods instanceof RegExp) || unsafe_methods.test(this.key + ''))) {
      const key = this.key
      const value = this.value
      if (((is_ast_arrow(value) && Array.isArray(value.body) && !value.contains_this()) ||
        is_ast_function(value)) && !value.name) {
        return make_node('AST_ConciseMethod', this, {
          async: value.async,
          is_generator: value.is_generator,
          key: is_ast_node(key) ? key : make_node('AST_SymbolMethod', this, {
            name: key
          }),
          value: make_node('AST_Accessor', value, value),
          quote: this.quote
        })
      }
    }
    return this
  }

  computed_key () {
    return is_ast_node(this.key)
  }

  shallow_cmp_props: any = { key: 'eq' }
  _size (): number {
    return key_size(this.key) + 1
  }

  _codegen (output: OutputStream) {
    function get_name (self: any) {
      const def = self.definition()
      return def ? def.mangled_name || def.name : self.name
    }

    const allowShortHand = output.option('shorthand')
    if (allowShortHand &&
                is_ast_symbol(this.value) &&
                is_identifier_string(this.key, (output.option('ecma') as unknown as number) >= 2015) &&
                get_name(this.value) === this.key &&
                !RESERVED_WORDS.has(this.key)
    ) {
      print_property_name(this.key, this.quote, output)
    } else if (allowShortHand &&
                is_ast_default_assign(this.value) &&
                is_ast_symbol(this.value.left) &&
                is_identifier_string(this.key, (output.option('ecma') as unknown as number) >= 2015) &&
                get_name(this.value.left) === this.key
    ) {
      print_property_name(this.key, this.quote, output)
      output.space()
      output.print('=')
      output.space()
      this.value.right.print(output)
    } else {
      if (!(is_ast_node(this.key))) {
        print_property_name(this.key, this.quote, output)
      } else {
        output.with_square(() => {
          this.key.print(output)
        })
      }
      output.colon()
      this.value.print(output)
    }
  }

  static documentation = 'A key: value object property'
  static propdoc = {
    quote: '[string] the original quote character'
  }

  static PROPS = AST_ObjectProperty.PROPS.concat(['quote'])
  constructor (args: AST_ObjectKeyVal_Props) {
    super(args)
    this.quote = args.quote ?? ''
    this.value = args.value
  }
}

export interface AST_ObjectKeyVal_Props extends AST_ObjectProperty_Props {
  quote?: string | undefined
  value: AST_Node
}
