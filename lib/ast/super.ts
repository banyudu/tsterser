import { OutputStream } from '../output'
import AST_This, { AST_This_Props } from './this'

export default class AST_Super extends AST_This {
  _size = () => 5
  shallow_cmp_props: any = {}
  public _to_mozilla_ast (): any {
    return { type: 'Super' }
  }

  protected _codegen (output: OutputStream) {
    output.print('super')
  }

  static documentation: 'The `super` symbol'

  static PROPS = AST_This.PROPS
}

export interface AST_Super_Props extends AST_This_Props {
}
