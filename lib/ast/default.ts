import AST_SwitchBranch from './switch-branch'
import { push, pop, list_overhead } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Default extends AST_SwitchBranch {
  reduce_vars = function (tw: TreeWalker, descend) {
    push(tw)
    descend()
    pop(tw)
    return true
  }

  _size = function (): number {
    return 8 + list_overhead(this.body)
  }

  _codegen = function (self, output) {
    output.print('default:')
    self._do_print_body(output)
  }

  static documentation = 'A `default` switch branch'

  static PROPS = AST_SwitchBranch.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
