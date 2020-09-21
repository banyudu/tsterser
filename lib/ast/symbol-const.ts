import AST_SymbolBlockDeclaration, { AST_SymbolBlockDeclaration_Props } from './symbol-block-declaration'

export default class AST_SymbolConst extends AST_SymbolBlockDeclaration {
  public static documentation = 'A constant declaration'

  public static PROPS =AST_SymbolBlockDeclaration.PROPS
}

export interface AST_SymbolConst_Props extends AST_SymbolBlockDeclaration_Props {
}
