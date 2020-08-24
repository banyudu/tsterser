import { OutputStream } from '../output'
import AST_SwitchBranch from './switch-branch'
import Compressor from '../compressor'
import AST_Block from './block'
import TreeWalker from '../tree-walker'

import { anyMayThrow, anySideEffect, push, pop, walk_body, list_overhead, do_list } from '../utils'

export default class AST_Case extends AST_SwitchBranch {
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

  _walk (visitor: any) {
    return visitor._visit(this, function (this) {
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

  _transform (self: AST_Case, tw: TreeWalker) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _codegen (self: AST_Case, output: OutputStream) {
    output.print('case')
    output.space()
    self.expression.print(output)
    output.print(':')
    self._do_print_body(output)
  }

  static documentation = 'A `case` switch branch'
  static propdoc = {
    expression: '[AST_Node] the `case` expression'
  }

  static PROPS = AST_Block.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
