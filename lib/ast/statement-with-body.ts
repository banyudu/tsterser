import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import { force_statement } from '../utils'

export default class AST_StatementWithBody extends AST_Statement {
  public body: any | undefined

  protected _do_print_body (output: OutputStream) {
    force_statement(this.body, output)
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`'
  public static propdoc ={
    body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
  } as any

  public static PROPS =AST_Statement.PROPS.concat(['body'])
  public constructor (args: AST_StatementWithBody_Props) {
    super(args)
    this.body = args.body
  }
}

export interface AST_StatementWithBody_Props extends AST_Statement_Props {
  body: any | undefined
}
