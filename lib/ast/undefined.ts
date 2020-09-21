import Compressor from '../compressor'
import AST_Atom, { AST_Atom_Props } from './atom'
import { find_variable, make_node, is_lhs, is_atomic } from '../utils'
import { set_flag, UNDEFINED } from '../constants'

export default class AST_Undefined extends AST_Atom {
  protected _optimize (compressor: Compressor): any {
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

  public _dot_throw () { return true }
  public value = (function () {}())
  public _size = () => 6 // "void 0"
  public static documentation: 'The `undefined` value'

  public static PROPS =AST_Atom.PROPS
}

export interface AST_Undefined_Props extends AST_Atom_Props {
}
