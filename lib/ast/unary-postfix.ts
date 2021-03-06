import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Unary, { AST_Unary_Props } from './unary'

export default class AST_UnaryPostfix extends AST_Unary {
  public _prepend_comments_check (_node: AST_Node) {
    return true
  }

  protected _optimize (compressor: Compressor): any {
    return this.lift_sequences(compressor)
  }

  public _dot_throw () { return false }
  protected _codegen (output: OutputStream) {
    this.expression.print(output)
    output.print(this.operator)
  }

  public static documentation = 'Unary postfix expression, i.e. `i++`'

  public static PROPS =AST_Unary.PROPS
}

export interface AST_UnaryPostfix_Props extends AST_Unary_Props {
}
