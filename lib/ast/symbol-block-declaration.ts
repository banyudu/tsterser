import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolBlockDeclaration extends AST_SymbolDeclaration {
  static documentation = 'Base class for block-scoped declaration symbols'

  static PROPS = AST_SymbolDeclaration.PROPS
}
