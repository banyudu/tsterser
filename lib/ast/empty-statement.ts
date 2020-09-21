import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import Compressor from '../compressor'

export default class AST_EmptyStatement extends AST_Statement {
  public may_throw (_compressor: Compressor) { return false }
  public has_side_effects (_compressor: Compressor) { return false }
  public shallow_cmp_props: any = {}
  public _to_mozilla_ast (): any {
    return { type: 'EmptyStatement' }
  }

  public _size = () => 1
  protected _codegen (output: OutputStream) {
    output.semicolon()
  }

  public static documentation = 'The empty statement (empty block or simply a semicolon)'

  public static PROPS =AST_Statement.PROPS
}

export interface AST_EmptyStatement_Props extends AST_Statement_Props {
}
