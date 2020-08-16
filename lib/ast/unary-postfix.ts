import AST_Unary from './unary'
import { return_false } from '../utils'

export default class AST_UnaryPostfix extends AST_Unary {
  _prepend_comments_check (node) {
    return true
  }

  _optimize (self, compressor) {
    return self.lift_sequences(compressor)
  }

  _dot_throw = return_false
  _codegen (self, output) {
    self.expression.print(output)
    output.print(self.operator)
  }

  static documentation = 'Unary postfix expression, i.e. `i++`'

  static PROPS = AST_Unary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
