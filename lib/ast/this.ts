import { OutputStream } from '../output'
import AST_Symbol from './symbol'

export default class AST_This extends AST_Symbol {
  drop_side_effect_free () { return null }
  may_throw () { return false }
  has_side_effects () { return false }
  _size = () => 4
  shallow_cmp_props: any = {}
  _to_mozilla_ast (): any {
    return { type: 'ThisExpression' }
  }

  _codegen (this: AST_This, output: OutputStream) {
    output.print('this')
  }

  static documentation = 'The `this` symbol'

  static PROPS = AST_Symbol.PROPS
}
