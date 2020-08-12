import AST_StatementWithBody from './statement-with-body'
import { return_true, clone_block_scope } from '../utils'

export default class AST_IterationStatement extends AST_StatementWithBody {
  block_scope: any
  init?: any
  condition: any
  step: any
  is_block_scope = return_true
  clone = clone_block_scope
  static documentation = 'Internal class.  All loops inherit from it.'
  static propdoc = {
    block_scope: '[AST_Scope] the block scope for this iteration statement.'
  } as any

  static PROPS = AST_StatementWithBody.PROPS.concat(['block_scope'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.block_scope = args.block_scope
  }
}
