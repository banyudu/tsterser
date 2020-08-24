import Compressor from '../compressor'
import AST_Node from './node'
import AST_Binary from './binary'
import { make_node_from_constant, best_of_expression } from '../utils'

export default class AST_DefaultAssign extends AST_Binary {
  to_fun_args (to_fun_args, insert_default, croak, default_seen_above?: AST_Node): any {
    this.left = to_fun_args(this.left, 0, [this.left])
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
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
