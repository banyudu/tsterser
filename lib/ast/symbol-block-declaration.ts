import AST_SymbolDeclaration, { AST_SymbolDeclaration_Props } from './symbol-declaration'

export default class AST_SymbolBlockDeclaration extends AST_SymbolDeclaration {
  public static documentation = 'Base class for block-scoped declaration symbols'

  public static PROPS =AST_SymbolDeclaration.PROPS
}

export interface AST_SymbolBlockDeclaration_Props extends AST_SymbolDeclaration_Props {
}
