import AST_Lambda from './lambda'
import { return_null, push, reset_variables, pop, lambda_modifiers, list_overhead } from '../utils'

export default class AST_Accessor extends AST_Lambda {
  drop_side_effect_free = return_null
  reduce_vars = function (tw: TreeWalker, descend, compressor: any) {
    push(tw)
    reset_variables(tw, compressor, this)
    descend()
    pop(tw)
    return true
  }

  _size = function () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  static documentation = 'A setter/getter function.  The `name` property is always null.'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
