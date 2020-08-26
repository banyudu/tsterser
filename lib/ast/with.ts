import AST_Node from './node'
import { OutputStream } from '../output'
import AST_StatementWithBody from './statement-with-body'
import { to_moz } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_With extends AST_StatementWithBody {
  expression: any
  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.expression._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    push(this.expression)
  }

  _size = () => 6
  shallow_cmp_props: any = {}
  _transform (self: AST_With, tw: TreeWalker) {
    self.expression = self.expression.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'WithStatement',
      object: to_moz(this.expression),
      body: to_moz(this.body)
    }
  }

  _codegen (self: AST_With, output: OutputStream) {
    output.print('with')
    output.space()
    output.with_parens(function () {
      self.expression.print(output)
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `with` statement'
  static propdoc = {
    expression: '[AST_Node] the `with` expression'
  }

  static PROPS = AST_StatementWithBody.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
