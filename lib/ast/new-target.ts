import AST_Node from './node'
import { pass_through } from '../utils'

export default class AST_NewTarget extends AST_Node {
  _size = () => 10
  shallow_cmp = pass_through
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

  _codegen (_self, output) {
    output.print('new.target')
  }

  static documentation: 'A reference to new.target'

  static PROPS = AST_Node.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
