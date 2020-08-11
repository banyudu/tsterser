import AST_Statement from './statement'
import { AST_EmptyStatement } from './'
import { make_node, pass_through, to_moz } from '../utils'

export default class AST_SimpleStatement extends AST_Statement {
  _optimize (self, compressor: any) {
    if (compressor.option('side_effects')) {
      var body = self.body
      var node = body.drop_side_effect_free(compressor, true)
      if (!node) {
        compressor.warn('Dropping side-effect-free statement [{file}:{line},{col}]', self.start)
        return make_node(AST_EmptyStatement, self)
      }
      if (node !== body) {
        return make_node(AST_SimpleStatement, self, { body: node })
      }
    }
    return self
  }

  may_throw (compressor: any) {
    return this.body.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.body.has_side_effects(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'ExpressionStatement',
      expression: to_moz(this.body) // TODO: check type
    }
  }

  _codegen (self, output) {
    (self.body).print(output)
    output.semicolon()
  }

  static documentation = 'A statement consisting of an expression, i.e. a = 1 + 2'
  static propdoc = {
    body: '[AST_Node] an expression node (should not be instanceof AST_Statement)'
  }

  TYPE = 'SimpleStatement'
  static PROPS = AST_Statement.PROPS.concat(['body'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.body = args.body
  }
}
