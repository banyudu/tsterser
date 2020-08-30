import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolVar extends AST_SymbolDeclaration {
  static documentation = 'Symbol defining a variable'

  static PROPS = AST_SymbolDeclaration.PROPS
}
