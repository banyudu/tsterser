import AST_Statement from './statement'
import { return_false, pass_through } from '../utils'

export default class AST_EmptyStatement extends AST_Statement {
  may_throw = return_false
  has_side_effects = return_false
  shallow_cmp = pass_through
  _to_mozilla_ast = () => ({ type: 'EmptyStatement' })
  _size = () => 1
  _codegen (_self, output) {
    output.semicolon()
  }

  static documentation = 'The empty statement (empty block or simply a semicolon)'
  CTOR = this.constructor
  TYPE = 'EmptyStatement'
  static PROPS = AST_Statement.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
