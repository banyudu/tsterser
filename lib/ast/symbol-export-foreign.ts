import AST_Symbol from './symbol'

export default class AST_SymbolExportForeign extends AST_Symbol {
  _size (): number {
    return this.name.length
  }

  static documentation = "A symbol exported from this module, but it is used in the other module, and its real name is irrelevant for this module's purposes"

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
