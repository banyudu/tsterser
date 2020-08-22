import AST_Lambda from './lambda'
import { lambda_modifiers, list_overhead, to_moz, to_moz_scope } from '../utils'

export default class AST_Defun extends AST_Lambda {
  name: any
  _size () {
    return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'FunctionDeclaration',
      id: to_moz(this.name),
      params: this.argnames.map(to_moz),
      generator: this.is_generator,
      async: this.async,
      body: to_moz_scope('BlockStatement', this)
    }
  }

  static documentation = 'A function definition'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
