import AST_Atom from './atom'
import { is_lhs, is_atomic, make_node, find_variable } from '../utils'

export default class AST_Infinity extends AST_Atom {
  _optimize (_self, compressor) {
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && is_atomic(lhs, this)) return this
    if (
      compressor.option('keep_infinity') &&
          !(lhs && !is_atomic(lhs, this)) &&
          !find_variable(compressor, 'Infinity')
    ) {
      return this
    }
    return make_node('AST_Binary', this, {
      operator: '/',
      left: make_node('AST_Number', this, {
        value: 1
      }),
      right: make_node('AST_Number', this, {
        value: 0
      })
    })
  }

  value = 1 / 0
  _size = () => 8
  static documentation: 'The `Infinity` value'

  static PROPS = AST_Atom.PROPS
}
