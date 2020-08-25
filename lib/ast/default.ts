import { OutputStream } from '../output'
import AST_SwitchBranch from './switch-branch'
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

  _codegen (self: AST_Default, output: OutputStream) {
    output.print('default:')
    self._do_print_body(output)
  }

  static documentation = 'A `default` switch branch'

  static PROPS = AST_SwitchBranch.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
