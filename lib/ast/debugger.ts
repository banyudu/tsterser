import AST_Statement from './statement'
import { make_node, pass_through } from '../utils'
import { AST_EmptyStatement } from './'

export default class AST_Debugger extends AST_Statement {
  _optimize (self, compressor) {
    if (compressor.option('drop_debugger')) { return make_node(AST_EmptyStatement, self) }
    return self
  }

  shallow_cmp = pass_through
  _size = () => 8
  _to_mozilla_ast = () => ({ type: 'DebuggerStatement' })
  _codegen (_self, output) {
    output.print('debugger')
    output.semicolon()
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'Represents a debugger statement'
  CTOR = this.constructor
  flags = 0
  TYPE = 'Debugger'
  static PROPS = AST_Statement.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
