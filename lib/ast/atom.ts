import AST_Node from './node'
import AST_Constant from './constant'

export default class AST_Atom extends AST_Constant {
  shallow_cmp_props: any = {}
  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'Identifier',
      name: String(this.value)
    }
  }

  static documentation = 'Base class for atoms'

  static PROPS = AST_Constant.PROPS
}
