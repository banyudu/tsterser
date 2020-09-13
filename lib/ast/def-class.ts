import AST_Class, { AST_Class_Props } from './class'
export default class AST_DefClass extends AST_Class {
  static documentation = 'A class definition'

  static PROPS = AST_Class.PROPS
}

export interface AST_DefClass_Props extends AST_Class_Props {
}
