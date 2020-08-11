import AST_LoopControl from './loop-control'
import { to_moz } from '../utils'

export default class AST_Continue extends AST_LoopControl {
  _size = function () {
    return this.label ? 9 : 8
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ContinueStatement',
      label: to_moz(this.label)
    }
  }

  _codegen = function (self, output) {
    self._do_print(output, 'continue')
  }

  static documentation = 'A `continue` statement'

  TYPE = 'Continue'
  static PROPS = AST_LoopControl.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
