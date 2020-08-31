import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Unary, { AST_Unary_Props } from './unary'

export default class AST_UnaryPostfix extends AST_Unary {
  _prepend_comments_check (node: AST_Node) {
    return true
  }

  _optimize (compressor: Compressor) {
    return this.lift_sequences(compressor)
  }

  _dot_throw () { return false }
  _codegen (output: OutputStream) {
    this.expression.print(output)
    output.print(this.operator)
  }

  static documentation = 'Unary postfix expression, i.e. `i++`'

  static PROPS = AST_Unary.PROPS
}

export interface AST_UnaryPostfix_Props extends AST_Unary_Props {
}
