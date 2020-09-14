import AST_Node from './node'
import AST_ForIn, { AST_ForIn_Props } from './for-in'
import { to_moz } from '../utils'
import { MozillaAst } from '../types'

export default class AST_ForOf extends AST_ForIn {
  await: any
  shallow_cmp_props: any = {}
  _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'ForOfStatement',
      left: this.init ? to_moz(this.init) : null,
      right: to_moz(this.object),
      body: to_moz(this.body),
      await: this.await
    }
  }

  static documentation = 'A `for ... of` statement'

  static PROPS = AST_ForIn.PROPS.concat(['await'])
  constructor (args: AST_ForOf_Props) {
    super(args)
    this.await = args.await
  }
}

export interface AST_ForOf_Props extends AST_ForIn_Props {
  await?: any | undefined
  name?: any
  init: any
}
