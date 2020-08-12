import AST_SymbolDeclaration from './symbol-declaration'
export default class AST_SymbolDefun extends AST_SymbolDeclaration {
  static documentation = 'Symbol defining a function'

  static PROPS = AST_SymbolDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
