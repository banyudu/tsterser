import { OutputStream } from '../output'
import AST_Unary from './unary'

export default class AST_UnaryPostfix extends AST_Unary {
  _prepend_comments_check (node) {
    return true
  }

  _optimize (compressor) {
    return this.lift_sequences(compressor)
  }

  _dot_throw () { return false }
  _codegen (self, output: OutputStream) {
    self.expression.print(output)
    output.print(self.operator)
  }

  static documentation = 'Unary postfix expression, i.e. `i++`'

  static PROPS = AST_Unary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
