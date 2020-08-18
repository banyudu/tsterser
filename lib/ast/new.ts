import AST_Call from './call'
import { is_undeclared_ref, callCodeGen, return_this, list_overhead, to_moz, make_node } from '../utils'

export default class AST_New extends AST_Call {
  _optimize (compressor) {
    if (
      compressor.option('unsafe') &&
          is_undeclared_ref(this.expression) &&
          ['Object', 'RegExp', 'Function', 'Error', 'Array'].includes(this.expression.name)
    ) return make_node('AST_Call', this, this).transform(compressor)
    return this
  }

  _eval = return_this
  _size (): number {
    return 6 + list_overhead(this.args)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'NewExpression',
      callee: to_moz(this.expression),
      arguments: this.args.map(to_moz)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    if (this.args.length === 0 &&
            (p?.isAst?.('AST_PropAccess') || // (new Date).getTime(), (new Date)["getTime"]()
                p?.isAst?.('AST_Call') && p.expression === this)) // (new foo)(bar)
    { return true }
    return undefined
  }

  _codegen = function (self, output) {
    output.print('new')
    output.space()
    callCodeGen(self, output)
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'An object instantiation.  Derives from a function call since it has exactly the same properties'

  static PROPS = AST_Call.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
