import AST_Node from './node'
import { pass_through, to_moz } from '../utils'

export default class AST_Await extends AST_Node {
  expression: any

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 6
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'AwaitExpression',
      argument: to_moz(this.expression)
    }
  }

  needs_parens = function (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_PropAccess') && p.expression === this ||
            p?.isAst?.('AST_Call') && p.expression === this ||
            output.option('safari10') && p?.isAst?.('AST_UnaryPrefix')
  }

  _codegen = function (self, output) {
    output.print('await')
    output.space()
    var e = self.expression
    var parens = !(
      e?.isAst?.('AST_Call') ||
            e?.isAst?.('AST_SymbolRef') ||
            e?.isAst?.('AST_PropAccess') ||
            e?.isAst?.('AST_Unary') ||
            e?.isAst?.('AST_Constant')
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
