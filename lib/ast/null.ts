import AST_Atom from './atom'
import { To_Moz_Literal } from '../utils'

export default class AST_Null extends AST_Atom {
  _dot_throw () { return true }
  value = null
  _size = () => 4
  _to_mozilla_ast (parent): any {
    return To_Moz_Literal(this)
  }

  static documentation: 'The `null` atom'

  static PROPS = AST_Atom.PROPS
}
