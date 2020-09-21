import AST_Boolean, { AST_Boolean_Props } from './boolean'

export default class AST_False extends AST_Boolean {
  public is_boolean () { return true }
  value = false
  _size = () => 5
  static documentation = 'The `false` atom'

  static PROPS = AST_Boolean.PROPS
}

export interface AST_False_Props extends AST_Boolean_Props {
}
