import AST_SymbolVar, { AST_SymbolVar_Props } from './symbol-var'

export default class AST_SymbolFunarg extends AST_SymbolVar {
  static documentation = 'Symbol naming a function argument'

  static PROPS = AST_SymbolVar.PROPS
}

export interface AST_SymbolFunarg_Props extends AST_SymbolVar_Props {
}
