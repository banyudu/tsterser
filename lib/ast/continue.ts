import AST_Node from './node'
import { OutputStream } from '../output'
import AST_LoopControl from './loop-control'
import { to_moz } from '../utils'

export default class AST_Continue extends AST_LoopControl {
  _size () {
    return this.label ? 9 : 8
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'ContinueStatement',
      label: to_moz(this.label)
    }
  }

  _codegen (self: AST_Continue, output: OutputStream) {
    self._do_print(output, 'continue')
  }

  static documentation = 'A `continue` statement'

  static PROPS = AST_LoopControl.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
