import AST_SwitchBranch from './switch-branch'
import AST_Block from './block'

import { anyMayThrow, anySideEffect, push, pop, walk_body, list_overhead, do_list } from '../utils'

export default class AST_Case extends AST_SwitchBranch {
  may_throw = function (compressor: any) {
    return this.expression.may_throw(compressor) ||
          anyMayThrow(this.body, compressor)
  }

  has_side_effects = function (compressor: any) {
    return this.expression.has_side_effects(compressor) ||
          anySideEffect(this.body, compressor)
  }

  reduce_vars = function (tw) {
    push(tw)
    this.expression.walk(tw)
    pop(tw)
    push(tw)
    walk_body(this, tw)
    pop(tw)
    return true
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  _size = function (): number {
    return 5 + list_overhead(this.body)
  }

  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _codegen = function (self, output) {
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
