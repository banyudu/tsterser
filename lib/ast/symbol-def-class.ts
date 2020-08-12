import AST_SymbolBlockDeclaration from './symbol-block-declaration'

export default class AST_SymbolDefClass extends AST_SymbolBlockDeclaration {
  static documentation = "Symbol naming a class's name in a class declaration. Lexically scoped to its containing scope, and accessible within the class."

  static PROPS = AST_SymbolBlockDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
