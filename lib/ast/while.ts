import AST_Node from './node'
import { OutputStream } from '../output'
import AST_DWLoop, { AST_DWLoop_Props } from './dw-loop'
import Compressor from '../compressor'
import { make_node, reset_block_variables, push, pop, to_moz } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_While extends AST_DWLoop {
  protected _optimize (compressor: Compressor): any {
    return compressor.option('loops') ? make_node('AST_For', this, this).optimize(compressor) : this
  }

  public reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    descend()
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.condition)
    result.push(this.body)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.body)
    push(this.condition)
  }

  public _size = () => 7
  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.condition = this.condition.transform(tw)
    this.body = (this.body).transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'WhileStatement',
      test: to_moz(this.condition),
      body: to_moz(this.body)
    }
  }

  protected _codegen (output: OutputStream) {
    output.print('while')
    output.space()
    output.with_parens(() => {
      this.condition.print(output)
    })
    output.space()
    this._do_print_body(output)
  }

  public static documentation = 'A `while` statement'

  public static PROPS =AST_DWLoop.PROPS
}

export interface AST_While_Props extends AST_DWLoop_Props {
}
