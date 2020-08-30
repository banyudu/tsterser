import { OutputStream } from '../output'
import AST_This from './this'

export default class AST_Super extends AST_This {
  _size = () => 5
  shallow_cmp_props: any = {}
  _to_mozilla_ast (): any {
    return { type: 'Super' }
  }

  _codegen (_self, output: OutputStream) {
    output.print('super')
  }

  static documentation: 'The `super` symbol'

  static PROPS = AST_This.PROPS
}
