import AST_Node from './node'
import AST_Atom, { AST_Atom_Props } from './atom'
import { To_Moz_Literal } from '../utils'

export default class AST_Null extends AST_Atom {
  public _dot_throw () { return true }
  public value: any = null
  public _size = () => 4
  public _to_mozilla_ast (_parent: AST_Node): any {
    return To_Moz_Literal(this)
  }

  public static documentation: 'The `null` atom'

  public static PROPS =AST_Atom.PROPS
}

export interface AST_Null_Props extends AST_Atom_Props {
}
