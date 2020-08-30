import AST_Node from './node'
import AST_ForIn from './for-in'
import { to_moz } from '../utils'

export default class AST_ForOf extends AST_ForIn {
  await: any
  shallow_cmp_props: any = {}
  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'ForOfStatement',
      left: to_moz(this.init),
      right: to_moz(this.object),
      body: to_moz(this.body),
      await: this.await
    }
  }

  static documentation = 'A `for ... of` statement'

  static PROPS = AST_ForIn.PROPS.concat(['await'])
  constructor (args?) {
    super(args)
    this.await = args.await
  }
}
