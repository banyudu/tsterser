import { OutputStream } from '../output'
import AST_Node from './node'
import { string_template } from '../utils'
import Compressor from '../compressor'

export default class AST_Statement extends AST_Node {
  body: any

  _eval (compressor: Compressor): any {
    throw new Error(string_template('Cannot evaluate a statement [{file}:{line},{col}]', this.start))
  }

  aborts () { return null }
  negate () {
    throw new Error('Cannot negate a statement')
  }

  _codegen (this: AST_Statement, output: OutputStream) {
    (this.body).print(output)
    output.semicolon()
  }

  static documentation = 'Base class of all statements'

  static PROPS = AST_Node.PROPS
}
