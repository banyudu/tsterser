import AST_Atom from './atom'
import { return_true, To_Moz_Literal } from '../utils'

export default class AST_Null extends AST_Atom {
  _dot_throw = return_true
  value = null
  _size = () => 4
  _to_mozilla_ast = To_Moz_Literal
  static documentation: 'The `null` atom'

  TYPE = 'Null'
  static PROPS = AST_Atom.PROPS
}
