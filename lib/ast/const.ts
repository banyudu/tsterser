import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Definitions, { AST_Definitions_Props } from './definitions'
import { def_size, to_moz } from '../utils'

export default class AST_Const extends AST_Definitions {
  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: this.definitions.map(to_moz)
    }
  }

  _size (): number {
    return def_size(6, this)
  }

  _codegen (output: OutputStream) {
    this._do_print(output, 'const')
  }

  static documentation = 'A `const` statement'

  static PROPS = AST_Definitions.PROPS
}

export interface AST_Const_Props extends AST_Definitions_Props {
}
