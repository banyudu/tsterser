import AST_Node from './node'
import { pass_through, to_moz_in_destructuring, to_moz } from '../utils'

export default class AST_Expansion extends AST_Node {
  expression: any

  drop_side_effect_free (compressor: any, first_in_statement) {
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  _dot_throw (compressor: any) {
    return this.expression._dot_throw(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression.walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 3
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast = function To_Moz_Spread (M) {
    return {
      type: to_moz_in_destructuring() ? 'RestElement' : 'SpreadElement',
      argument: to_moz(M.expression)
    }
  }

  _codegen (self, output) {
    output.print('...')
    self.expression.print(output)
  }

  static documentation = 'An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list'
  static propdoc = {
    expression: '[AST_Node] the thing to be expanded'
  }

  CTOR = this.constructor
  TYPE = 'Expansion'
  static PROPS = AST_Node.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
