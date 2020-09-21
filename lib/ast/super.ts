import { OutputStream } from '../output'
import AST_This, { AST_This_Props } from './this'

export default class AST_Super extends AST_This {
  public _size = () => 5
  public shallow_cmp_props: any = {}
  public _to_mozilla_ast (): any {
    return { type: 'Super' }
  }

  protected _codegen (output: OutputStream) {
    output.print('super')
  }

  public static documentation: 'The `super` symbol'

  public static PROPS =AST_This.PROPS
}

export interface AST_Super_Props extends AST_This_Props {
}
