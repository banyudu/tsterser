import { OutputStream } from '../output'
import AST_Definitions from './definitions'
import { def_size } from '../utils'

export default class AST_Var extends AST_Definitions {
  _size (): number {
    return def_size(4, this)
  }

  _codegen (this: AST_Var, output: OutputStream) {
    this._do_print(output, 'var')
  }

  static documentation = 'A `var` statement'

  static PROPS = AST_Definitions.PROPS
}
