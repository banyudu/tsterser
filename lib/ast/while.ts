import AST_Node from './node'
import { OutputStream } from '../output'
import AST_DWLoop from './dw-loop'
import Compressor from '../compressor'
import { make_node, reset_block_variables, push, pop, to_moz } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_While extends AST_DWLoop {
  _optimize (compressor: Compressor) {
    return compressor.option('loops') ? make_node('AST_For', this, this).optimize(compressor) : this
  }

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    descend()
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.condition._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    push(this.condition)
  }

  _size = () => 7
  shallow_cmp_props: any = {}
  _transform (self: AST_While, tw: TreeWalker) {
    self.condition = self.condition.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'WhileStatement',
      test: to_moz(this.condition),
      body: to_moz(this.body)
    }
  }

  _codegen (self: AST_While, output: OutputStream) {
    output.print('while')
    output.space()
    output.with_parens(function () {
      self.condition.print(output)
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `while` statement'

  static PROPS = AST_DWLoop.PROPS
}
