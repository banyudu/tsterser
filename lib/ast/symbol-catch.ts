import AST_SymbolBlockDeclaration, { AST_SymbolBlockDeclaration_Props } from './symbol-block-declaration'

export default class AST_SymbolCatch extends AST_SymbolBlockDeclaration {
  public reduce_vars () {
    this.definition().fixed = false
  }

  public static documentation = 'Symbol naming the exception in catch'

  public static PROPS =AST_SymbolBlockDeclaration.PROPS
}

export interface AST_SymbolCatch_Props extends AST_SymbolBlockDeclaration_Props {
}
