import AST_SymbolVar from './symbol-var'

export default class AST_SymbolFunarg extends AST_SymbolVar {
  static documentation = 'Symbol naming a function argument'

  static PROPS = AST_SymbolVar.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
