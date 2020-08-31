import AST_Symbol, { AST_Symbol_Props } from './symbol'
import Compressor from '../compressor'

export default class AST_SymbolClassProperty extends AST_Symbol {
  may_throw (compressor: Compressor) { return false }
  has_side_effects (compressor: Compressor) { return false }
  // TODO take propmangle into account
  _size (): number {
    return this.name.length
  }

  static documentation = 'Symbol for a class property'

  static PROPS = AST_Symbol.PROPS
}

export interface AST_SymbolClassProperty_Props extends AST_Symbol_Props {
}
