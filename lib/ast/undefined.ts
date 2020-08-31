import Compressor from '../compressor'
import AST_Atom, { AST_Atom_Props } from './atom'
import { find_variable, make_node, is_lhs, is_atomic } from '../utils'
import { set_flag, UNDEFINED } from '../constants'

export default class AST_Undefined extends AST_Atom {
  _optimize (compressor: Compressor) {
    if (compressor.option('unsafe_undefined')) {
      const undef = find_variable(compressor, 'undefined')
      if (undef) {
        const ref = make_node('AST_SymbolRef', this, {
          name: 'undefined',
          scope: undef.scope,
          thedef: undef
        })
        set_flag(ref, UNDEFINED)
        return ref
      }
    }
    const lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && is_atomic(lhs, this)) return this
    return make_node('AST_UnaryPrefix', this, {
      operator: 'void',
      expression: make_node('AST_Number', this, {
        value: 0
      })
    })
  }

  _dot_throw () { return true }
  value = (function () {}())
  _size = () => 6 // "void 0"
  static documentation: 'The `undefined` value'

  static PROPS = AST_Atom.PROPS
}

export interface AST_Undefined_Props extends AST_Atom_Props {
}
