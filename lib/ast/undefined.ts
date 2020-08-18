import AST_Atom from './atom'
import { find_variable, make_node, return_true, is_lhs, is_atomic } from '../utils'
import { set_flag, UNDEFINED } from '../constants'

export default class AST_Undefined extends AST_Atom {
  _optimize (_self, compressor) {
    if (compressor.option('unsafe_undefined')) {
      var undef = find_variable(compressor, 'undefined')
      if (undef) {
        var ref = make_node('AST_SymbolRef', this, {
          name: 'undefined',
          scope: undef.scope,
          thedef: undef
        })
        set_flag(ref, UNDEFINED)
        return ref
      }
    }
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && is_atomic(lhs, this)) return this
    return make_node('AST_UnaryPrefix', this, {
      operator: 'void',
      expression: make_node('AST_Number', this, {
        value: 0
      })
    })
  }

  _dot_throw = return_true
  value = (function () {}())
  _size = () => 6 // "void 0"
  static documentation: 'The `undefined` value'

  static PROPS = AST_Atom.PROPS
}
