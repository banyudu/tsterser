import AST_Block from './block'
import { return_false, to_moz, pass_through, block_aborts } from '../utils'

export default class AST_SwitchBranch extends AST_Block {
  aborts = block_aborts
  is_block_scope = return_false
  shallow_cmp = pass_through
  _to_mozilla_ast (parent) {
    return {
      type: 'SwitchCase',
      test: to_moz(this.expression),
      consequent: this.body.map(to_moz)
    }
  }

  _do_print_body = function (this: any, output: any) {
    output.newline()
    this.body.forEach(function (stmt) {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for `switch` branches'

  TYPE = 'SwitchBranch'
  static PROPS = AST_Block.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
