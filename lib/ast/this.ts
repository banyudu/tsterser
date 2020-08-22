import AST_Symbol from './symbol'
import { pass_through } from '../utils'

export default class AST_This extends AST_Symbol {
  drop_side_effect_free () { return null }
  may_throw () { return false }
  has_side_effects () { return false }
  _size = () => 4
  shallow_cmp = pass_through
  _to_mozilla_ast (): any {
    return { type: 'ThisExpression' }
  }

  _codegen (_self, output) {
    output.print('this')
  }

  static documentation = 'The `this` symbol'

  static PROPS = AST_Symbol.PROPS

  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
