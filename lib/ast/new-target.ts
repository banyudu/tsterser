import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'

export default class AST_NewTarget extends AST_Node {
  public _size = () => 10
  public shallow_cmp_props: any = {}
  public _to_mozilla_ast () {
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

  protected _codegen (output: OutputStream) {
    output.print('new.target')
  }

  public static documentation: 'A reference to new.target'

  public static PROPS =AST_Node.PROPS
}

export interface AST_NewTarget_Props extends AST_Node_Props {
}
