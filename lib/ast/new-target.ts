import { OutputStream } from '../output'
import AST_Node from './node'

export default class AST_NewTarget extends AST_Node {
  _size = () => 10
  shallow_cmp_props: any = {}
  _to_mozilla_ast () {
    return {
      type: 'MetaProperty',
      meta: {
        type: 'Identifier',
        name: 'new'
      },
      property: {
        type: 'Identifier',
        name: 'target'
      }
    }
  }

  _codegen (this, output: OutputStream) {
    output.print('new.target')
  }

  static documentation: 'A reference to new.target'

  static PROPS = AST_Node.PROPS
}
