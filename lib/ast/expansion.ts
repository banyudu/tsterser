import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import { to_moz_in_destructuring, to_moz } from '../utils'
import TreeTransformer from '../tree-transformer'
import { MozillaAst } from '../types'

export default class AST_Expansion extends AST_Node {
  expression: AST_Node

  to_fun_args (croak: Function): any {
    this.expression = this.expression.to_fun_args(croak)
    return this
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean): any {
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  _dot_throw (compressor: Compressor) {
    return this.expression._dot_throw(compressor)
  }

  walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    return result
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 3
  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
  }

  _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: to_moz_in_destructuring() ? 'RestElement' : 'SpreadElement',
      argument: to_moz(this.expression)
    }
  }

  _codegen (output: OutputStream) {
    output.print('...')
    this.expression.print(output)
  }

  static documentation = 'An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list'
  static propdoc = {
    expression: '[AST_Node] the thing to be expanded'
  }

  static PROPS = AST_Node.PROPS.concat(['expression'])
  constructor (args: AST_Expansion_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_Expansion_Props extends AST_Node_Props {
  expression: AST_Node
}
