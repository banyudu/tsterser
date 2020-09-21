import AST_SymbolDeclaration, { AST_SymbolDeclaration_Props } from './symbol-declaration'
export default class AST_SymbolDefun extends AST_SymbolDeclaration {
  public static documentation = 'Symbol defining a function'

  public static PROPS =AST_SymbolDeclaration.PROPS
}

export interface AST_SymbolDefun_Props extends AST_SymbolDeclaration_Props {
}
