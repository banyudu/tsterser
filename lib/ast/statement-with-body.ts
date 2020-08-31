import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import { force_statement } from '../utils'

export default class AST_StatementWithBody extends AST_Statement {
  body: any | undefined

  _do_print_body (output: OutputStream) {
    force_statement(this.body, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`'
  static propdoc = {
    body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
  } as any

  static PROPS = AST_Statement.PROPS.concat(['body'])
  constructor (args: AST_StatementWithBody_Props) {
    super(args)
    this.body = args.body
  }
}

export interface AST_StatementWithBody_Props extends AST_Statement_Props {
  body: any | undefined
}
