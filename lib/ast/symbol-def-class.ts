import AST_SymbolBlockDeclaration, { AST_SymbolBlockDeclaration_Props } from './symbol-block-declaration'

export default class AST_SymbolDefClass extends AST_SymbolBlockDeclaration {
  public static documentation = "Symbol naming a class's name in a class declaration. Lexically scoped to its containing scope, and accessible within the class."

  public static PROPS =AST_SymbolBlockDeclaration.PROPS
}

export interface AST_SymbolDefClass_Props extends AST_SymbolBlockDeclaration_Props {
}
