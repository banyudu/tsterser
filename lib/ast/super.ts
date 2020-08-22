import AST_This from './this'
import { pass_through } from '../utils'

export default class AST_Super extends AST_This {
  _size = () => 5
  shallow_cmp = pass_through
  _to_mozilla_ast (): any {
    return { type: 'Super' }
  }

  _codegen (_self, output) {
    output.print('super')
  }

  static documentation: 'The `super` symbol'

  static PROPS = AST_This.PROPS

  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
