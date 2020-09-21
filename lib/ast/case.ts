import { OutputStream } from '../output'
import AST_SwitchBranch, { AST_SwitchBranch_Props } from './switch-branch'
import Compressor from '../compressor'
import AST_Block from './block'
import AST_Node from './node'
import TreeWalker from '../tree-walker'

import { anyMayThrow, anySideEffect, push, pop, walk_body, list_overhead, do_list } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_Case extends AST_SwitchBranch {
  public expression: any | undefined

  public may_throw (compressor: Compressor) {
    return this.expression.may_throw(compressor) ||
              anyMayThrow(this.body, compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return this.expression.has_side_effects(compressor) ||
              anySideEffect(this.body, compressor)
  }

  public reduce_vars (tw: TreeWalker) {
    push(tw)
    this.expression.walk(tw)
    pop(tw)
    push(tw)
    walk_body(this, tw)
    pop(tw)
    return true
  }

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    result.push(...this.body)
    return result
  }

  public _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  public _size (): number {
    return 5 + list_overhead(this.body)
  }

  protected _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
    this.body = do_list(this.body, tw)
  }

  protected _codegen (output: OutputStream) {
    output.print('case')
    output.space()
    this.expression.print(output)
    output.print(':')
    this._do_print_body(output)
  }

  public static documentation = 'A `case` switch branch'
  public static propdoc ={
    expression: '[AST_Node] the `case` expression'
  }

  public static PROPS =AST_Block.PROPS.concat(['expression'])
  public constructor (args: AST_Case_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_Case_Props extends AST_SwitchBranch_Props {
  expression: any | undefined
  start?: any | undefined
}
