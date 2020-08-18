import AST_Atom from './atom'
import { is_lhs, is_atomic, find_variable, make_node } from '../utils'

export default class AST_NaN extends AST_Atom {
  _optimize (compressor) {
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && !is_atomic(lhs, this) ||
          find_variable(compressor, 'NaN')) {
      return make_node('AST_Binary', this, {
        operator: '/',
        left: make_node('AST_Number', this, {
          value: 0
        }),
        right: make_node('AST_Number', this, {
          value: 0
        })
      })
    }
    return this
  }

  value = 0 / 0
  _size = () => 3
  static documentation: 'The impossible value'

  static PROPS = AST_Atom.PROPS
}
