import AST_Boolean, { AST_Boolean_Props } from './boolean'

export default class AST_True extends AST_Boolean {
  public is_boolean () { return true }
  public value = true
  public _size = () => 4
  public static documentation = 'The `true` atom'

  public static PROPS =AST_Boolean.PROPS
}

export interface AST_True_Props extends AST_Boolean_Props {
}
