import AST_Node from './node'
import AST_StatementWithBody, { AST_StatementWithBody_Props } from './statement-with-body'
import AST_Scope from './scope'

export default class AST_IterationStatement extends AST_StatementWithBody {
  block_scope?: AST_Scope
  init?: any
  condition?: any
  step?: any

  get_loopcontrol_target (node: AST_Node) {
    if (!node.label) {
      return this
    }
    return undefined
  }

  is_block_scope () { return true }
  static documentation = 'Internal class.  All loops inherit from it.'
  static propdoc = {
    block_scope: '[AST_Scope] the block scope for this iteration statement.'
  } as any

  static PROPS = AST_StatementWithBody.PROPS.concat(['block_scope'])
  constructor (args: AST_IterationStatement_Props) {
    super(args)
    this.block_scope = args.block_scope
  }
}

export interface AST_IterationStatement_Props extends AST_StatementWithBody_Props {
  block_scope?: AST_Scope
}
