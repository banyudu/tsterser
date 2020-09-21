import AST_SymbolBlockDeclaration, { AST_SymbolBlockDeclaration_Props } from './symbol-block-declaration'

export default class AST_SymbolLet extends AST_SymbolBlockDeclaration {
  public static documentation = 'A block-scoped `let` declaration'

  public static PROPS =AST_SymbolBlockDeclaration.PROPS
}

export interface AST_SymbolLet_Props extends AST_SymbolBlockDeclaration_Props {
}
