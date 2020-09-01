import { OutputStream } from '../output'
import AST_SwitchBranch, { AST_SwitchBranch_Props } from './switch-branch'
import Compressor from '../compressor'
import AST_Block from './block'
import TreeWalker from '../tree-walker'

import { anyMayThrow, anySideEffect, push, pop, walk_body, list_overhead, do_list } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_Case extends AST_SwitchBranch {
  expression: any | undefined

  may_throw (compressor: Compressor) {
    return this.expression.may_throw(compressor) ||
              anyMayThrow(this.body, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.expression.has_side_effects(compressor) ||
              anySideEffect(this.body, compressor)
  }

  reduce_vars (tw: TreeWalker) {
    push(tw)
    this.expression.walk(tw)
    pop(tw)
    push(tw)
    walk_body(this, tw)
    pop(tw)
    return true
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, () => {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  _size (): number {
    return 5 + list_overhead(this.body)
  }

  _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
    this.body = do_list(this.body, tw)
  }

  _codegen (output: OutputStream) {
    output.print('case')
    output.space()
    this.expression.print(output)
    output.print(':')
    this._do_print_body(output)
  }

  static documentation = 'A `case` switch branch'
  static propdoc = {
    expression: '[AST_Node] the `case` expression'
  }

  static PROPS = AST_Block.PROPS.concat(['expression'])
  constructor (args: AST_Case_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_Case_Props extends AST_SwitchBranch_Props {
  expression: any | undefined
  start?: any | undefined
}
