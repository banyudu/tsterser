import AST_SymbolDeclaration, { AST_SymbolDeclaration_Props } from './symbol-declaration'

export default class AST_SymbolVar extends AST_SymbolDeclaration {
  static documentation = 'Symbol defining a variable'

  static PROPS = AST_SymbolDeclaration.PROPS
}

export interface AST_SymbolVar_Props extends AST_SymbolDeclaration_Props {
}
