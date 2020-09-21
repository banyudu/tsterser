import AST_Symbol, { AST_Symbol_Props } from './symbol'

export default class AST_SymbolExportForeign extends AST_Symbol {
  public _size (): number {
    return this.name.length
  }

  public static documentation = "A symbol exported from this module, but it is used in the other module, and its real name is irrelevant for this module's purposes"

  public static PROPS =AST_Symbol.PROPS
}

export interface AST_SymbolExportForeign_Props extends AST_Symbol_Props {
}
