import AST_SymbolBlockDeclaration from './symbol-block-declaration'

export default class AST_SymbolLet extends AST_SymbolBlockDeclaration {
  static documentation = 'A block-scoped `let` declaration'

  static PROPS = AST_SymbolBlockDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
