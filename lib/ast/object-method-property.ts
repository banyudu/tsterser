import { OutputStream } from '../output'
import AST_ObjectProperty, { AST_ObjectProperty_Props } from './object-property'
import AST_Accessor from './accessor'
import { is_ast_symbol_method, print_property_name } from '../utils'

export default class AST_ObjectMethodProperty extends AST_ObjectProperty {
  value: AST_Accessor
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
}

export interface AST_ObjectMethodProperty_Props extends AST_ObjectProperty_Props { }
