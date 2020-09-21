import { OutputStream } from '../output'
import AST_Symbol, { AST_Symbol_Props } from './symbol'
import Compressor from '../compressor'

export default class AST_This extends AST_Symbol {
  public drop_side_effect_free (): any { return null }
  public may_throw (_compressor: Compressor) { return false }
  public has_side_effects (_compressor: Compressor) { return false }
  public _size = () => 4
  public shallow_cmp_props: any = {}
  public _to_mozilla_ast (): any {
    return { type: 'ThisExpression' }
  }

  protected _codegen (output: OutputStream) {
    output.print('this')
  }

  public static documentation = 'The `this` symbol'

  public static PROPS =AST_Symbol.PROPS
}

export interface AST_This_Props extends AST_Symbol_Props {
}
