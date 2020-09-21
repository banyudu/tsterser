import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'

export default class AST_Jump extends AST_Statement {
  protected aborts () { return this }
  public shallow_cmp_props: any = {}
  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = "Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"

  public static PROPS =AST_Statement.PROPS
}

export interface AST_Jump_Props extends AST_Statement_Props {
}
