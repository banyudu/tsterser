import AST_Constant from './constant'
import { pass_through } from '../utils'

export default class AST_Atom extends AST_Constant {
  shallow_cmp = pass_through
  _to_mozilla_ast = function To_Moz_Atom (M) {
    return {
      type: 'Identifier',
      name: String(this.value)
    }
  } as Function

  static documentation = 'Base class for atoms'

  TYPE = 'Null'
  static PROPS = AST_Constant.PROPS
}
