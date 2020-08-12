import AST_Symbol from './symbol'

export default class AST_LabelRef extends AST_Symbol {
  thedef: any

  static documentation = 'Reference to a label symbol'

  static PROPS = AST_Symbol.PROPS
}
