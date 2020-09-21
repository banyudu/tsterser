import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import { make_node } from '../utils'

export default class AST_Debugger extends AST_Statement {
  protected _optimize (compressor: Compressor): any {
    if (compressor.option('drop_debugger')) { return make_node('AST_EmptyStatement', this) }
    return this
  }

  public shallow_cmp_props: any = {}
  public _size = () => 8
  public _to_mozilla_ast (): any {
    return { type: 'DebuggerStatement' }
  }

  protected _codegen (output: OutputStream) {
    output.print('debugger')
    output.semicolon()
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'Represents a debugger statement'

  public static PROPS =AST_Statement.PROPS
}

export interface AST_Debugger_Props extends AST_Statement_Props {
}
