import AST_SymbolBlockDeclaration from './symbol-block-declaration'

export default class AST_SymbolConst extends AST_SymbolBlockDeclaration {
  static documentation = 'A constant declaration'

  TYPE = 'SymbolConst'
  static PROPS = AST_SymbolBlockDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
