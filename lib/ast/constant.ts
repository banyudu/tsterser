import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { To_Moz_Literal } from '../utils'
import Compressor from '../compressor'

export default class AST_Constant extends AST_Node {
  public value: any
  public literal?: any

  public drop_side_effect_free (): any { return null }
  public may_throw (_compressor: Compressor) { return false }
  public has_side_effects (_compressor: Compressor) { return false }
  public _eval (_arg: any) {
    return this.getValue()
  }

  public is_constant_expression () { return true }
  public _dot_throw () { return false }
  public getValue () {
    return this.value
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return To_Moz_Literal(this)
  }

  protected _codegen (output: OutputStream) {
    output.print(this.getValue())
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'Base class for all constants'

  public static PROPS =AST_Node.PROPS
}

export interface AST_Constant_Props extends AST_Node_Props {
}
