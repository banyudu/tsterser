import { OutputStream } from '../output'
import AST_Node from './node'
import { to_moz, is_ast_prop_access, is_ast_call, is_ast_symbol_ref, is_ast_unary_prefix, is_ast_unary, is_ast_constant } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Await extends AST_Node {
  expression: AST_Node

  _walk (visitor: any) {
    return visitor._visit(this, function (this) {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 6
  shallow_cmp_props: any = {}
  _transform (self: AST_Await, tw: TreeWalker) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'AwaitExpression',
      argument: to_moz(this.expression)
    }
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    return is_ast_prop_access(p) && p.expression === this ||
            is_ast_call(p) && p.expression === this ||
            output.option('safari10') && is_ast_unary_prefix(p)
  }

  _codegen (self: AST_Await, output: OutputStream) {
    output.print('await')
    output.space()
    const e = self.expression
    const parens = !(
      is_ast_call(e) ||
            is_ast_symbol_ref(e) ||
            is_ast_prop_access(e) ||
            is_ast_unary(e) ||
            is_ast_constant(e)
    )
    if (parens) output.print('(')
    self.expression.print(output)
    if (parens) output.print(')')
  }

  static documentation = 'An `await` statement'
  static propdoc = {
    expression: '[AST_Node] the mandatory expression being awaited'
  }

  static PROPS = AST_Node.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
