import AST_IterationStatement from './iteration-statement'

export default class AST_DWLoop extends AST_IterationStatement {
  condition: any
  static documentation = 'Base class for do/while statements'
  static propdoc = {
    condition: '[AST_Node] the loop condition.  Should not be instanceof AST_Statement'
  }

  static PROPS = AST_IterationStatement.PROPS.concat(['condition'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.condition = args.condition
  }
}
