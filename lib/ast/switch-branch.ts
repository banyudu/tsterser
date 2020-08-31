import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Block, { AST_Block_Props } from './block'
import { to_moz, block_aborts } from '../utils'

export default class AST_SwitchBranch extends AST_Block {
  aborts = block_aborts
  is_block_scope () { return false }
  shallow_cmp_props: any = {}
  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'SwitchCase',
      test: to_moz(this.expression),
      consequent: this.body.map(to_moz)
    }
  }

  _do_print_body (output: OutputStream) {
    output.newline()
    this.body.forEach(function (stmt) {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Base class for `switch` branches'

  static PROPS = AST_Block.PROPS
}

export interface AST_SwitchBranch_Props extends AST_Block_Props {
}
