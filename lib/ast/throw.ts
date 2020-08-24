import { OutputStream } from '../output'
import AST_Exit from './exit'
import { to_moz } from '../utils'

export default class AST_Throw extends AST_Exit {
  _size = () => 6
  _to_mozilla_ast (parent): any {
    return {
      type: 'ThrowStatement',
      argument: to_moz(this.value)
    }
  }

  _codegen (self: AST_Throw, output: OutputStream) {
    self._do_print(output, 'throw')
  }

  static documentation = 'A `throw` statement'

  static PROPS = AST_Exit.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
