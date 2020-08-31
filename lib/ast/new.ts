import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Call from './call'
import { is_undeclared_ref, callCodeGen, list_overhead, to_moz, make_node, is_ast_prop_access, is_ast_call } from '../utils'

export default class AST_New extends AST_Call {
  _optimize (compressor: Compressor) {
    if (
      compressor.option('unsafe') &&
          is_undeclared_ref(this.expression) &&
          ['Object', 'RegExp', 'Function', 'Error', 'Array'].includes(this.expression.name)
    ) return make_node('AST_Call', this, this).transform(compressor)
    return this
  }

  _eval () { return this }
  _size (): number {
    return 6 + list_overhead(this.args)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'NewExpression',
      callee: to_moz(this.expression),
      arguments: this.args.map(to_moz)
    }
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    if (this.args.length === 0 &&
            (is_ast_prop_access(p) || // (new Date).getTime(), (new Date)["getTime"]()
                is_ast_call(p) && p.expression === this)) // (new foo)(bar)
    { return true }
    return undefined
  }

  _codegen (this: AST_New, output: OutputStream) {
    output.print('new')
    output.space()
    callCodeGen(this, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'An object instantiation.  Derives from a function call since it has exactly the same properties'

  static PROPS = AST_Call.PROPS
}
