import AST_Class, { AST_Class_Props } from './class'
import { first_in_statement } from '../utils'
export default class AST_ClassExpression extends AST_Class {
  name: any

  needs_parens = first_in_statement
  static documentation: 'A class expression.'

  static PROPS = AST_Class.PROPS
}

export interface AST_ClassExpression_Props extends AST_Class_Props {
}
