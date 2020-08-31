import { OutputStream } from '../output'
import AST_Definitions, { AST_Definitions_Props } from './definitions'
import { def_size } from '../utils'

export default class AST_Var extends AST_Definitions {
  _size (): number {
    return def_size(4, this)
  }

  _codegen (output: OutputStream) {
    this._do_print(output, 'var')
  }

  static documentation = 'A `var` statement'

  static PROPS = AST_Definitions.PROPS
}

export interface AST_Var_Props extends AST_Definitions_Props {
}
