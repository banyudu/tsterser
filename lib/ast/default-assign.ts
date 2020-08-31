import Compressor from '../compressor'
import AST_Binary from './binary'
import { make_node_from_constant, best_of_expression } from '../utils'

export default class AST_DefaultAssign extends AST_Binary {
  to_fun_args (croak: Function): any {
    this.left = this.left.to_fun_args(croak)
    return this
  }

  _optimize (compressor: Compressor) {
    let self: any = this
    if (!compressor.option('evaluate')) {
      return self
    }
    let evaluateRight = self.right.evaluate(compressor)

    // `[x = undefined] = foo` ---> `[x] = foo`
    if (evaluateRight === undefined) {
      self = self.left
    } else if (evaluateRight !== self.right) {
      evaluateRight = make_node_from_constant(evaluateRight, self.right)
      self.right = best_of_expression(evaluateRight, self.right)
    }

    return self
  }

  static documentation = 'A default assignment expression like in `(a = 3) => a`'

  static PROPS = AST_Binary.PROPS
}