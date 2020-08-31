import AST_SymbolDeclaration, { AST_SymbolDeclaration_Props } from './symbol-declaration'

export default class AST_SymbolLambda extends AST_SymbolDeclaration {
  static documentation = 'Symbol naming a function expression'

  static PROPS = AST_SymbolDeclaration.PROPS
}

export interface AST_SymbolLambda_Props extends AST_SymbolDeclaration_Props {
}
