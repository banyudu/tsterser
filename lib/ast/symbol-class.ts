import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolClass extends AST_SymbolDeclaration {
  static documentation = "Symbol naming a class's name. Lexically scoped to the class."

  TYPE = 'SymbolClass'
  static PROPS = AST_SymbolDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
