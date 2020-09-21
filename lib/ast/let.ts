import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Definitions, { AST_Definitions_Props } from './definitions'
import { def_size, to_moz } from '../utils'
import { MozillaAst } from '../types'

export default class AST_Let extends AST_Definitions {
  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'VariableDeclaration',
      kind: 'let',
      declarations: this.definitions.map(to_moz)
    }
  }

  public _size (): number {
    return def_size(4, this)
  }

  protected _codegen (output: OutputStream) {
    this._do_print(output, 'let')
  }

  static documentation = 'A `let` statement'

  static PROPS = AST_Definitions.PROPS
}

export interface AST_Let_Props extends AST_Definitions_Props {
}
