import AST_Lambda from './lambda'
import Compressor from '../compressor'
import { push, reset_variables, pop, lambda_modifiers, list_overhead } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Accessor extends AST_Lambda {
  drop_side_effect_free () { return null }
  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    push(tw)
    reset_variables(tw, compressor, this)
    descend()
    pop(tw)
    return true
  }

  _size () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  static documentation = 'A setter/getter function.  The `name` property is always null.'

  static PROPS = AST_Lambda.PROPS
}
