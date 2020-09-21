import AST_Boolean, { AST_Boolean_Props } from './boolean'

export default class AST_False extends AST_Boolean {
  public is_boolean () { return true }
  public value = false
  public _size = () => 5
  public static documentation = 'The `false` atom'

  public static PROPS =AST_Boolean.PROPS
}

export interface AST_False_Props extends AST_Boolean_Props {
}
