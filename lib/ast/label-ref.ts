import AST_Symbol, { AST_Symbol_Props } from './symbol'

export default class AST_LabelRef extends AST_Symbol {
  thedef: any

  static documentation = 'Reference to a label symbol'

  static PROPS = AST_Symbol.PROPS
}

export interface AST_LabelRef_Props extends AST_Symbol_Props {
}
