import AST_Node from './node'
import AST_IterationStatement, { AST_IterationStatement_Props } from './iteration-statement'

export default class AST_DWLoop extends AST_IterationStatement {
  public condition: AST_Node
  public static documentation = 'Base class for do/while statements'
  public static propdoc ={
    condition: '[AST_Node] the loop condition.  Should not be instanceof AST_Statement'
  }

  public static PROPS =AST_IterationStatement.PROPS.concat(['condition'])

  protected _in_boolean_context (context: AST_Node) {
    return this.condition === context
  }

  public constructor (args: AST_DWLoop_Props) {
    super(args)
    this.condition = args.condition
  }
}

export interface AST_DWLoop_Props extends AST_IterationStatement_Props {
  condition: AST_Node
}
