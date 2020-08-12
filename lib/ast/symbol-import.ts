import AST_SymbolBlockDeclaration from './symbol-block-declaration'

export default class AST_SymbolImport extends AST_SymbolBlockDeclaration {
  static documentation = 'Symbol referring to an imported name'

  static PROPS = AST_SymbolBlockDeclaration.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
