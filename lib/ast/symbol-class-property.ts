import AST_Symbol from './symbol'
import Compressor from '../compressor'

export default class AST_SymbolClassProperty extends AST_Symbol {
  may_throw (compressor: Compressor) { return false }
  has_side_effects () { return false }
  // TODO take propmangle into account
  _size (): number {
    return this.name.length
  }

  static documentation = 'Symbol for a class property'

  static PROPS = AST_Symbol.PROPS
}
