import AST_SymbolDeclaration, { AST_SymbolDeclaration_Props } from './symbol-declaration'

export default class AST_SymbolVar extends AST_SymbolDeclaration {
  public static documentation = 'Symbol defining a variable'

  public static PROPS =AST_SymbolDeclaration.PROPS
}

export interface AST_SymbolVar_Props extends AST_SymbolDeclaration_Props {
}
