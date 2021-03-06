import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Block, { AST_Block_Props } from './block'
import Compressor from '../compressor'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'
import { extract_declarations_from_unreachable_code, make_node, is_empty, anySideEffect, anyMayThrow, reset_block_variables, push, walk_body, pop, list_overhead, do_list, to_moz_block, to_moz } from '../utils'
import { AST_Finally, AST_Catch } from '.'
import { MozillaAst } from '../types'

/* -----[ EXCEPTIONS ]----- */

export default class AST_Try extends AST_Block {
  public bfinally: AST_Finally | null
  public bcatch: AST_Catch

  protected _optimize (compressor: Compressor): AST_Try {
    this.tighten_body(compressor)
    if (this.bcatch && this.bfinally && this.bfinally.body.every(is_empty)) this.bfinally = null
    if (compressor.option('dead_code') && this.body.every(is_empty)) {
      const body: any[] = []
      if (this.bcatch) {
        extract_declarations_from_unreachable_code(compressor, this.bcatch, body)
      }
      if (this.bfinally) body.push(...this.bfinally.body)
      return make_node('AST_BlockStatement', this, {
        body: body
      }).optimize(compressor) as AST_Try
    }
    return this
  }

  public may_throw (compressor: Compressor) {
    return this.bcatch ? this.bcatch.may_throw(compressor) : anyMayThrow(this.body, compressor) ||
              !!this.bfinally?.may_throw(compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return anySideEffect(this.body, compressor) ||
              !!this.bcatch?.has_side_effects(compressor) ||
              !!this.bfinally?.has_side_effects(compressor)
  }

  public reduce_vars (tw: TreeWalker, _descend: Function, compressor: Compressor) {
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

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(...this.body)
    if (this.bcatch) result.push(this.bcatch)
    if (this.bfinally) result.push(this.bfinally)
    return result
  }

  public _children_backwards (push: Function) {
    if (this.bfinally) push(this.bfinally)
    if (this.bcatch) push(this.bcatch)
    let i = this.body.length
    while (i--) push(this.body[i])
  }

  public _size (): number {
    return 3 + list_overhead(this.body)
  }

  public shallow_cmp_props: any = {
    bcatch: 'exist',
    bfinally: 'exist'
  }

  protected _transform (tw: TreeTransformer) {
    this.body = do_list(this.body, tw)
    if (this.bcatch) this.bcatch = this.bcatch.transform(tw)
    if (this.bfinally) this.bfinally = this.bfinally.transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'TryStatement',
      block: to_moz_block(this),
      handler: to_moz(this.bcatch),
      guardedHandlers: [],
      finalizer: this.bfinally ? to_moz(this.bfinally) : null
    }
  }

  protected _codegen (output: OutputStream) {
    output.print('try')
    output.space()
    this.print_braced(output)
    if (this.bcatch) {
      output.space()
      this.bcatch.print(output)
    }
    if (this.bfinally) {
      output.space()
      this.bfinally.print(output)
    }
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'A `try` statement'
  public static propdoc ={
    bcatch: '[AST_Catch?] the catch block, or null if not present',
    bfinally: '[AST_Finally?] the finally block, or null if not present'
  }

  public static PROPS =AST_Block.PROPS.concat(['bcatch', 'bfinally'])
  public constructor (args: AST_Try_Props) {
    super(args)
    this.bcatch = args.bcatch
    this.bfinally = args.bfinally
  }
}

export interface AST_Try_Props extends AST_Block_Props {
  bcatch: AST_Catch
  bfinally: AST_Finally | null
}
