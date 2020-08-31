import { OutputStream } from '../output'
import AST_SwitchBranch, { AST_SwitchBranch_Props } from './switch-branch'
import { push, pop, list_overhead } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Default extends AST_SwitchBranch {
  reduce_vars (tw: TreeWalker, descend: Function) {
    push(tw)
    descend()
    pop(tw)
    return true
  }

  _size (): number {
    return 8 + list_overhead(this.body)
  }

  _codegen (output: OutputStream) {
    output.print('default:')
    this._do_print_body(output)
  }

  static documentation = 'A `default` switch branch'

  static PROPS = AST_SwitchBranch.PROPS
}

export interface AST_Default_Props extends AST_SwitchBranch_Props {
}
