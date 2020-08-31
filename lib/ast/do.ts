import AST_Node from './node'
import { OutputStream } from '../output'
import AST_DWLoop from './dw-loop'
import Compressor from '../compressor'
import { make_node, to_moz, push, pop, make_block, reset_block_variables, has_break_or_continue, is_ast_node } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Do extends AST_DWLoop {
  _optimize (compressor: Compressor) {
    if (!compressor.option('loops')) return this
    const cond = this.condition.tail_node().evaluate(compressor)
    if (!(is_ast_node(cond))) {
      if (cond) {
        return make_node('AST_For', this, {
          body: make_node('AST_BlockStatement', this.body, {
            body: [
              this.body,
              make_node('AST_SimpleStatement', this.condition, {
                body: this.condition
              })
            ]
          })
        }).optimize(compressor)
      }
      if (!has_break_or_continue(this, compressor.parent())) {
        return make_node('AST_BlockStatement', this.body, {
          body: [
            this.body,
            make_node('AST_SimpleStatement', this.condition, {
              body: this.condition
            })
          ]
        }).optimize(compressor)
      }
    }
    return this
  }

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    this.body.walk(tw)
    if (has_break_or_continue(this)) {
      pop(tw)
      push(tw)
    }
    this.condition.walk(tw)
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.body._walk(visitor)
      this.condition._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.condition)
    push(this.body)
  }

  _size = () => 9
  shallow_cmp_props: any = {}
  _transform (tw: TreeWalker) {
    this.body = (this.body).transform(tw)
    this.condition = this.condition.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'DoWhileStatement',
      test: to_moz(this.condition),
      body: to_moz(this.body)
    }
  }

  _codegen (output: OutputStream) {
    output.print('do')
    output.space()
    make_block(this.body, output)
    output.space()
    output.print('while')
    output.space()
    output.with_parens(() => {
      this.condition.print(output)
    })
    output.semicolon()
  }

  static documentation = 'A `do` statement'

  static PROPS = AST_DWLoop.PROPS
}
