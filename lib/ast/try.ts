import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Block, { AST_Block_Props } from './block'
import Compressor from '../compressor'
import TreeWalker from '../tree-walker'
import { tighten_body, extract_declarations_from_unreachable_code, make_node, is_empty, anySideEffect, anyMayThrow, reset_block_variables, push, walk_body, pop, list_overhead, do_list, print_braced, to_moz_block, to_moz } from '../utils'
import { AST_Finally, AST_Catch } from '.'

/* -----[ EXCEPTIONS ]----- */

export default class AST_Try extends AST_Block {
  bfinally: AST_Finally | undefined
  bcatch: AST_Catch | undefined

  _optimize (compressor: Compressor) {
    tighten_body(this.body, compressor)
    if (this.bcatch && this.bfinally && this.bfinally.body.every(is_empty)) this.bfinally = null
    if (compressor.option('dead_code') && this.body.every(is_empty)) {
      const body: any[] = []
      if (this.bcatch) {
        extract_declarations_from_unreachable_code(compressor, this.bcatch, body)
      }
      if (this.bfinally) body.push(...this.bfinally.body)
      return make_node('AST_BlockStatement', this, {
        body: body
      }).optimize(compressor)
    }
    return this
  }

  may_throw (compressor: Compressor) {
    return this.bcatch ? this.bcatch.may_throw(compressor) : anyMayThrow(this.body, compressor) ||
              this.bfinally?.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.body, compressor) ||
              this.bcatch?.has_side_effects(compressor) ||
              this.bfinally?.has_side_effects(compressor)
  }

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
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

  _walk (visitor: any) {
    return visitor._visit(this, function (this) {
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

  _size (): number {
    return 3 + list_overhead(this.body)
  }

  shallow_cmp_props: any = {
    bcatch: 'exist',
    bfinally: 'exist'
  }

  _transform (tw: TreeWalker) {
    this.body = do_list(this.body, tw)
    if (this.bcatch) this.bcatch = this.bcatch.transform(tw)
    if (this.bfinally) this.bfinally = this.bfinally.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'TryStatement',
      block: to_moz_block(this),
      handler: to_moz(this.bcatch),
      guardedHandlers: [],
      finalizer: to_moz(this.bfinally)
    }
  }

  _codegen (output: OutputStream) {
    output.print('try')
    output.space()
    print_braced(this, output)
    if (this.bcatch) {
      output.space()
      this.bcatch.print(output)
    }
    if (this.bfinally) {
      output.space()
      this.bfinally.print(output)
    }
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A `try` statement'
  static propdoc = {
    bcatch: '[AST_Catch?] the catch block, or null if not present',
    bfinally: '[AST_Finally?] the finally block, or null if not present'
  }

  static PROPS = AST_Block.PROPS.concat(['bcatch', 'bfinally'])
  constructor (args?: AST_Try_Props) {
    super(args)
    this.bcatch = args.bcatch
    this.bfinally = args.bfinally
  }
}

export interface AST_Try_Props extends AST_Block_Props {
  bcatch?: AST_Catch | undefined | undefined
  bfinally?: AST_Finally | undefined | undefined
}
