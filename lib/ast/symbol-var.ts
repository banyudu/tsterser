import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolVar extends AST_SymbolDeclaration {
  static documentation = 'Symbol defining a variable'

  TYPE = 'SymbolVar'
  static PROPS = AST_SymbolDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
