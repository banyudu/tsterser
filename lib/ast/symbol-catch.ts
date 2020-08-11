import AST_SymbolBlockDeclaration from './symbol-block-declaration'

export default class AST_SymbolCatch extends AST_SymbolBlockDeclaration {
  reduce_vars = function () {
    this.definition().fixed = false
  }

  static documentation = 'Symbol naming the exception in catch'

  TYPE = 'SymbolCatch '
  static PROPS = AST_SymbolBlockDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
