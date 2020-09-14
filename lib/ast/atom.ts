import AST_Node from './node'
import AST_Constant, { AST_Constant_Props } from './constant'
import { MozillaAst } from '../types'

export default class AST_Atom extends AST_Constant {
  shallow_cmp_props: any = {}
  _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'Identifier',
      name: String(this.value)
    }
  }

  static documentation = 'Base class for atoms'

  static PROPS = AST_Constant.PROPS
}

export interface AST_Atom_Props extends AST_Constant_Props {
}
