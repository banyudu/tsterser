import AST_Lambda, { AST_Lambda_Props } from './lambda'
import Compressor from '../compressor'
import { push, reset_variables, pop, lambda_modifiers, list_overhead } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Accessor extends AST_Lambda {
  public drop_side_effect_free (): AST_Accessor | null { return null }
  public reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor): boolean {
    push(tw)
    reset_variables(tw, compressor, this)
    descend()
    pop(tw)
    return true
  }

  public _size () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  static documentation = 'A setter/getter function.  The `name` property is always null.'

  static PROPS = AST_Lambda.PROPS
}

export interface AST_Accessor_Props extends AST_Lambda_Props {
}
