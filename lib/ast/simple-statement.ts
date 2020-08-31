import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Statement from './statement'
import Compressor from '../compressor'
import { make_node, to_moz } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_SimpleStatement extends AST_Statement {
  _in_boolean_context (context) {
    return true
  }

  _optimize (compressor: Compressor) {
    if (compressor.option('side_effects')) {
      const body = this.body
      const node = body.drop_side_effect_free(compressor, true)
      if (!node) {
        compressor.warn('Dropping side-effect-free statement [{file}:{line},{col}]', this.start)
        return make_node('AST_EmptyStatement', this)
      }
      if (node !== body) {
        return make_node('AST_SimpleStatement', this, { body: node })
      }
    }
    return this
  }

  may_throw (compressor: Compressor) {
    return this.body.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.body.has_side_effects(compressor)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeWalker) {
    this.body = (this.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'ExpressionStatement',
      expression: to_moz(this.body) // TODO: check type
    }
  }

  _codegen (output: OutputStream) {
    (this.body).print(output)
    output.semicolon()
  }

  static documentation = 'A statement consisting of an expression, i.e. a = 1 + 2'
  static propdoc = {
    body: '[AST_Node] an expression node (should not be instanceof AST_Statement)'
  }

  static PROPS = AST_Statement.PROPS.concat(['body'])
  constructor (args?) {
    super(args)
    this.body = args.body
  }
}
