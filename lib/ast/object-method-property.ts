import { OutputStream } from '../output'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import AST_Accessor from './accessor'
import { is_ast_symbol_method, print_property_name, is_ast_node } from '../utils'

export default class AST_ObjectMethodProperty extends AST_ObjectProperty {
  value: AST_Accessor
  protected _print_getter_setter (type: string, output: OutputStream) {
    const self = this
    if (self.static) {
      output.print('static')
      output.space()
    }
    if (type) {
      output.print(type)
      output.space()
    }
    const key = self.key
    if (is_ast_symbol_method(key)) {
      print_property_name(key.name, self.quote, output)
    } else if (is_ast_node(key)) {
      output.with_square(function () {
        key.print(output)
      })
    }
    self.value._do_print(output, true)
  }

  constructor (args: AST_ObjectMethodProperty_Props) {
    super(args)
    this.value = args.value
  }
}

export interface AST_ObjectMethodProperty_Props extends AST_ObjectProperty_Props {
  value: AST_Accessor
}
