import AST_Node from './node'
import { OutputStream } from '../output'
import AST_DWLoop, { AST_DWLoop_Props } from './dw-loop'
import Compressor from '../compressor'
import { make_node, to_moz, push, pop, make_block, reset_block_variables, has_break_or_continue, is_ast_node } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_Do extends AST_DWLoop {
  protected _optimize (compressor: Compressor): any {
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

  public reduce_vars (tw: TreeWalker, _descend: Function, compressor: Compressor) {
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

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.body)
    result.push(this.condition)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.condition)
    push(this.body)
  }

  public _size = () => 9
  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.body = (this.body).transform(tw)
    this.condition = this.condition.transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'DoWhileStatement',
      test: to_moz(this.condition),
      body: to_moz(this.body)
    }
  }

  protected _codegen (output: OutputStream) {
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

  public static documentation = 'A `do` statement'

  public static PROPS =AST_DWLoop.PROPS
}

export interface AST_Do_Props extends AST_DWLoop_Props {
}
