import AST_Symbol from './symbol'

export default class AST_SymbolImportForeign extends AST_Symbol {
  _size (): number {
    return this.name.length
  }

  static documentation = "A symbol imported from a module, but it is defined in the other module, and its real name is irrelevant for this module's purposes"

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
