import AST_Node from './node'
import AST_IterationStatement, { AST_IterationStatement_Props } from './iteration-statement'

export default class AST_DWLoop extends AST_IterationStatement {
  condition: AST_Node
  static documentation = 'Base class for do/while statements'
  static propdoc = {
    condition: '[AST_Node] the loop condition.  Should not be instanceof AST_Statement'
  }

  static PROPS = AST_IterationStatement.PROPS.concat(['condition'])

  _in_boolean_context (context) {
    return this.condition === context
  }

  constructor (args?: AST_DWLoop_Props) {
    super(args)
    this.condition = args.condition
  }
}

export interface AST_DWLoop_Props extends AST_IterationStatement_Props {
  condition?: AST_Node | undefined
}
