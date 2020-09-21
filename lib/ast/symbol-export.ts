import Compressor from '../compressor'
import AST_SymbolRef, { AST_SymbolRef_Props } from './symbol-ref'

export default class AST_SymbolExport extends AST_SymbolRef {
  protected _optimize (_compressor: Compressor): any {
    return this
  }

  static documentation = 'Symbol referring to a name to export'

  static PROPS = AST_SymbolRef.PROPS
}

export interface AST_SymbolExport_Props extends AST_SymbolRef_Props {
}
