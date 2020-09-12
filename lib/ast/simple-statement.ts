import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import Compressor from '../compressor'
import { make_node, to_moz } from '../utils'
import TreeTransformer from '../tree-transformer'
import { MozillaAst } from '../types'

export default class AST_SimpleStatement extends AST_Statement {
  body: any | undefined

  _in_boolean_context (context: AST_Node) {
    return true
  }

  _optimize (compressor: Compressor): any {
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

  walkInner () {
    const result: AST_Node[] = []
    result.push(this.body)
    return result
  }

  _children_backwards (push: Function) {
    push(this.body)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    this.body = (this.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): MozillaAst {
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
  constructor (args: AST_SimpleStatement_Props) {
    super(args)
    this.body = args.body
  }
}

export interface AST_SimpleStatement_Props extends AST_Statement_Props {
  body: any | undefined
}
