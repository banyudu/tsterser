import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { To_Moz_Literal } from '../utils'
import Compressor from '../compressor'

export default class AST_Constant extends AST_Node {
  value: any
  literal?: any

  drop_side_effect_free () { return null }
  may_throw (compressor: Compressor) { return false }
  has_side_effects (compressor: Compressor) { return false }
  _eval (_arg: any) {
    return this.getValue()
  }

  is_constant_expression () { return true }
  _dot_throw () { return false }
  getValue () {
    return this.value
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return To_Moz_Literal(this)
  }

  _codegen (output: OutputStream) {
    output.print(this.getValue())
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Base class for all constants'

  static PROPS = AST_Node.PROPS
}

export interface AST_Constant_Props extends AST_Node_Props {
}
