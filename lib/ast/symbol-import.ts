import AST_SymbolBlockDeclaration, { AST_SymbolBlockDeclaration_Props } from './symbol-block-declaration'

export default class AST_SymbolImport extends AST_SymbolBlockDeclaration {
  public static documentation = 'Symbol referring to an imported name'

  public static PROPS =AST_SymbolBlockDeclaration.PROPS
}

export interface AST_SymbolImport_Props extends AST_SymbolBlockDeclaration_Props {
}
