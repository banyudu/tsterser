import AST_Node from './node'
import { string_template, return_null } from '../utils'

export default class AST_Statement extends AST_Node {
  body: any

  _eval (): any {
    throw new Error(string_template('Cannot evaluate a statement [{file}:{line},{col}]', this.start))
  }

  aborts = return_null
  negate () {
    throw new Error('Cannot negate a statement')
  }

  _codegen (self, output) {
    (self.body).print(output)
    output.semicolon()
  }

  static documentation = 'Base class of all statements'
  CTOR = this.constructor
  flags = 0
  TYPE = 'Statement'
  static PROPS = AST_Node.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
