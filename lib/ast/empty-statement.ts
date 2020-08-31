import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import Compressor from '../compressor'

export default class AST_EmptyStatement extends AST_Statement {
  may_throw (compressor: Compressor) { return false }
  has_side_effects (compressor: Compressor) { return false }
  shallow_cmp_props: any = {}
  _to_mozilla_ast (): any {
    return { type: 'EmptyStatement' }
  }

  _size = () => 1
  _codegen (this, output: OutputStream) {
    output.semicolon()
  }

  static documentation = 'The empty statement (empty block or simply a semicolon)'

  static PROPS = AST_Statement.PROPS
}

export interface AST_EmptyStatement_Props extends AST_Statement_Props {
}
