import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Definitions, { AST_Definitions_Props } from './definitions'
import { def_size, to_moz } from '../utils'
import { MozillaAst } from '../types'

export default class AST_Const extends AST_Definitions {
  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'VariableDeclaration',
      kind: 'const',
      declarations: this.definitions.map(to_moz)
    }
  }

  public _size (): number {
    return def_size(6, this)
  }

  protected _codegen (output: OutputStream) {
    this._do_print(output, 'const')
  }

  public static documentation = 'A `const` statement'

  public static PROPS =AST_Definitions.PROPS
}

export interface AST_Const_Props extends AST_Definitions_Props {
}
