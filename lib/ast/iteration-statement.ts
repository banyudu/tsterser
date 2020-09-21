import AST_Node from './node'
import AST_StatementWithBody, { AST_StatementWithBody_Props } from './statement-with-body'
import AST_Scope from './scope'

export default class AST_IterationStatement extends AST_StatementWithBody {
  public block_scope?: AST_Scope
  public init?: any
  public condition?: any
  public step?: any

  public get_loopcontrol_target (node: AST_Node) {
    if (!node.label) {
      return this
    }
    return undefined
  }

  public is_block_scope () { return true }
  public static documentation = 'Internal class.  All loops inherit from it.'
  public static propdoc ={
    block_scope: '[AST_Scope] the block scope for this iteration statement.'
  } as any

  public static PROPS =AST_StatementWithBody.PROPS.concat(['block_scope'])
  public constructor (args: AST_IterationStatement_Props) {
    super(args)
    this.block_scope = args.block_scope
  }
}

export interface AST_IterationStatement_Props extends AST_StatementWithBody_Props {
  block_scope?: AST_Scope
}
