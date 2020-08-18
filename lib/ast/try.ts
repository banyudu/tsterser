import AST_Block from './block'
import TreeWalker from '../tree-walker'
import {
  tighten_body,
  extract_declarations_from_unreachable_code,
  make_node,
  is_empty,
  anySideEffect,
  anyMayThrow,
  reset_block_variables,
  push,
  walk_body,
  pop,
  list_overhead,
  do_list,
  print_braced,
  to_moz_block,
  to_moz,
  mkshallow
} from '../utils'

/* -----[ EXCEPTIONS ]----- */

export default class AST_Try extends AST_Block {
  bfinally: any
  bcatch: any

  _optimize (self, compressor) {
    tighten_body(self.body, compressor)
    if (self.bcatch && self.bfinally && self.bfinally.body.every(is_empty)) self.bfinally = null
    if (compressor.option('dead_code') && self.body.every(is_empty)) {
      var body: any[] = []
      if (self.bcatch) {
        extract_declarations_from_unreachable_code(compressor, self.bcatch, body)
      }
      if (self.bfinally) body.push(...self.bfinally.body)
      return make_node('AST_BlockStatement', self, {
        body: body
      }).optimize(compressor)
    }
    return self
  }

  may_throw = function (compressor: any) {
    return this.bcatch ? this.bcatch.may_throw(compressor) : anyMayThrow(this.body, compressor) ||
          this.bfinally && this.bfinally.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return anySideEffect(this.body, compressor) ||
          this.bcatch && this.bcatch.has_side_effects(compressor) ||
          this.bfinally && this.bfinally.has_side_effects(compressor)
  }

  reduce_vars = function (tw: TreeWalker, descend, compressor: any) {
    reset_block_variables(compressor, this)
    push(tw)
    walk_body(this, tw)
    pop(tw)
    if (this.bcatch) {
      push(tw)
      this.bcatch.walk(tw)
      pop(tw)
    }
    if (this.bfinally) this.bfinally.walk(tw)
    return true
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      walk_body(this, visitor)
      if (this.bcatch) this.bcatch._walk(visitor)
      if (this.bfinally) this.bfinally._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.bfinally) push(this.bfinally)
    if (this.bcatch) push(this.bcatch)
    let i = this.body.length
    while (i--) push(this.body[i])
  }

  _size = function (): number {
    return 3 + list_overhead(this.body)
  }

  shallow_cmp = mkshallow({
    bcatch: 'exist',
    bfinally: 'exist'
  })

  _transform (self, tw: any) {
    self.body = do_list(self.body, tw)
    if (self.bcatch) self.bcatch = self.bcatch.transform(tw)
    if (self.bfinally) self.bfinally = self.bfinally.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'TryStatement',
      block: to_moz_block(this),
      handler: to_moz(this.bcatch),
      guardedHandlers: [],
      finalizer: to_moz(this.bfinally)
    }
  }

  _codegen = function (self, output) {
    output.print('try')
    output.space()
    print_braced(self, output)
    if (self.bcatch) {
      output.space()
      self.bcatch.print(output)
    }
    if (self.bfinally) {
      output.space()
      self.bfinally.print(output)
    }
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'A `try` statement'
  static propdoc = {
    bcatch: '[AST_Catch?] the catch block, or null if not present',
    bfinally: '[AST_Finally?] the finally block, or null if not present'
  }

  static PROPS = AST_Block.PROPS.concat(['bcatch', 'bfinally'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.bcatch = args.bcatch
    this.bfinally = args.bfinally
  }
}
