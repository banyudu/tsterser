import AST_Definitions from './definitions'
import { def_size } from '../utils'

export default class AST_Var extends AST_Definitions {
  _size = function (): number {
    return def_size(4, this)
  }

  _codegen = function (self, output) {
    self._do_print(output, 'var')
  }

  static documentation = 'A `var` statement'

  TYPE = 'Var'
  static PROPS = AST_Definitions.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
