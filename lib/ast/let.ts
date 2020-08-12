import AST_Definitions from './definitions'
import { def_size, to_moz } from '../utils'

export default class AST_Let extends AST_Definitions {
  _to_mozilla_ast (parent) {
    return {
      type: 'VariableDeclaration',
      kind: 'let',
      declarations: this.definitions.map(to_moz)
    }
  }

  _size = function (): number {
    return def_size(4, this)
  }

  _codegen = function (self, output) {
    self._do_print(output, 'let')
  }

  static documentation = 'A `let` statement'

  TYPE = 'Let'
  static PROPS = AST_Definitions.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}