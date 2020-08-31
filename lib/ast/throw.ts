import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Exit, { AST_Exit_Props } from './exit'
import { to_moz } from '../utils'

export default class AST_Throw extends AST_Exit {
  _size = () => 6
  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'ThrowStatement',
      argument: to_moz(this.value)
    }
  }

  _codegen (output: OutputStream) {
    this._do_print(output, 'throw')
  }

  static documentation = 'A `throw` statement'

  static PROPS = AST_Exit.PROPS
}

export interface AST_Throw_Props extends AST_Exit_Props {
}
