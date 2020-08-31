import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Statement from './statement'
import { make_node } from '../utils'

export default class AST_Debugger extends AST_Statement {
  _optimize (compressor: Compressor) {
    if (compressor.option('drop_debugger')) { return make_node('AST_EmptyStatement', this) }
    return this
  }

  shallow_cmp_props: any = {}
  _size = () => 8
  _to_mozilla_ast (): any {
    return { type: 'DebuggerStatement' }
  }

  _codegen (this, output: OutputStream) {
    output.print('debugger')
    output.semicolon()
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Represents a debugger statement'

  static PROPS = AST_Statement.PROPS
}
