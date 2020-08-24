import { OutputStream } from '../output'
import AST_Node from './node'
import Compressor from '../compressor'
import { pass_through, to_moz_in_destructuring, to_moz } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Expansion extends AST_Node {
  expression: any

  to_fun_args (to_fun_args, insert_default, croak, default_seen_above?: AST_Node): any {
    this.expression = to_fun_args(this.expression)
    return insert_default(this)
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement) {
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  _dot_throw (compressor: Compressor) {
    return this.expression._dot_throw(compressor)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.expression.walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 3
  shallow_cmp = pass_through
  _transform (self: AST_Expansion, tw: TreeWalker) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: to_moz_in_destructuring() ? 'RestElement' : 'SpreadElement',
      argument: to_moz(this.expression)
    }
  }

  _codegen (self: AST_Expansion, output: OutputStream) {
    output.print('...')
    self.expression.print(output)
  }

  static documentation = 'An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list'
  static propdoc = {
    expression: '[AST_Node] the thing to be expanded'
  }

  static PROPS = AST_Node.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
