import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolLambda extends AST_SymbolDeclaration {
  static documentation = 'Symbol naming a function expression'

  static PROPS = AST_SymbolDeclaration.PROPS
}
