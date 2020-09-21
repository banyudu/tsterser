import AST_Node from './node'
import AST_Lambda, { AST_Lambda_Props } from './lambda'
import { lambda_modifiers, list_overhead, to_moz, to_moz_scope } from '../utils'

export default class AST_Defun extends AST_Lambda {
  public name: any
  public _size () {
    return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'FunctionDeclaration',
      id: to_moz(this.name),
      params: this.argnames.map(to_moz),
      generator: this.is_generator,
      async: this.async,
      body: to_moz_scope('BlockStatement', this)
    }
  }

  public static documentation = 'A function definition'

  public static PROPS =AST_Lambda.PROPS
}

export interface AST_Defun_Props extends AST_Lambda_Props {
}
