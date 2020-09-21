import AST_Class, { AST_Class_Props } from './class'
import { first_in_statement } from '../utils'
export default class AST_ClassExpression extends AST_Class {
  public name: any

  public needs_parens = first_in_statement
  public static documentation: 'A class expression.'

  public static PROPS =AST_Class.PROPS
}

export interface AST_ClassExpression_Props extends AST_Class_Props {
}
