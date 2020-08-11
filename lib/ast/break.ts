import AST_LoopControl from './loop-control'
import { to_moz } from '../utils'

export default class AST_Break extends AST_LoopControl {
  _size () {
    return this.label ? 6 : 5
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'BreakStatement',
      label: to_moz(this.label)
    }
  }

  _codegen (self, output) {
    self._do_print(output, 'break')
  }

  static documentation = 'A `break` statement'

  TYPE = 'Break'
  static PROPS = AST_LoopControl.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
