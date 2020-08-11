import AST_SymbolDeclaration from './symbol-declaration'

export default class AST_SymbolLambda extends AST_SymbolDeclaration {
  static documentation = 'Symbol naming a function expression'

  TYPE = 'SymbolLambda'
  static PROPS = AST_SymbolDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
