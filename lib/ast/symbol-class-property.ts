import AST_Symbol, { AST_Symbol_Props } from './symbol'
import Compressor from '../compressor'

export default class AST_SymbolClassProperty extends AST_Symbol {
  public may_throw (_compressor: Compressor) { return false }
  public has_side_effects (_compressor: Compressor) { return false }
  // TODO take propmangle into account
  public _size (): number {
    return this.name.length
  }

  static documentation = 'Symbol for a class property'

  static PROPS = AST_Symbol.PROPS
}

export interface AST_SymbolClassProperty_Props extends AST_Symbol_Props {
}
