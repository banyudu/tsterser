import AST_Node from './node'
import { return_false, return_null, return_true, To_Moz_Literal } from '../utils'

export default class AST_Constant extends AST_Node {
  value: any
  literal: any

  drop_side_effect_free = return_null
  may_throw = return_false
  has_side_effects = return_false
  _eval = function (_arg: any) {
    return this.getValue()
  }

  is_constant_expression = return_true
  _dot_throw = return_false
  getValue = function () {
    return this.value
  }

  _to_mozilla_ast = To_Moz_Literal as Function
  _codegen = function (self, output) {
    output.print(self.getValue())
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for all constants'

  TYPE = 'String'
  static PROPS = AST_Node.PROPS

  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
