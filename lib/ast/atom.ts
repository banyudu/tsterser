import AST_Constant from './constant'
import { pass_through } from '../utils'

export default class AST_Atom extends AST_Constant {
  shallow_cmp = pass_through
  _to_mozilla_ast (parent) {
    return {
      type: 'Identifier',
      name: String(this.value)
    }
  }

  static documentation = 'Base class for atoms'

  static PROPS = AST_Constant.PROPS
}
