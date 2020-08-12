import AST_Statement from './statement'
import { force_statement } from '../utils'

export default class AST_StatementWithBody extends AST_Statement {
  _do_print_body = function (output: any) {
    force_statement(this.body, output)
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`'
  static propdoc = {
    body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
  } as any

  TYPE = 'StatementWithBody'
  static PROPS = AST_Statement.PROPS.concat(['body'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.body = args.body
  }
}