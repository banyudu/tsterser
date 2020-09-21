import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import { to_moz_in_destructuring, to_moz } from '../utils'
import TreeTransformer from '../tree-transformer'
import { MozillaAst } from '../types'

export default class AST_Expansion extends AST_Node {
  public expression: AST_Node

  public to_fun_args (croak: Function): any {
    this.expression = this.expression.to_fun_args(croak)
    return this
  }

  public drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean): any {
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  public _dot_throw (compressor: Compressor) {
    return this.expression._dot_throw(compressor)
  }

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.expression)
  }

  public _size = () => 3
  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: to_moz_in_destructuring() ? 'RestElement' : 'SpreadElement',
      argument: to_moz(this.expression)
    }
  }

  protected _codegen (output: OutputStream) {
    output.print('...')
    this.expression.print(output)
  }

  public static documentation = 'An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list'
  public static propdoc ={
    expression: '[AST_Node] the thing to be expanded'
  }

  public static PROPS =AST_Node.PROPS.concat(['expression'])
  public constructor (args: AST_Expansion_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_Expansion_Props extends AST_Node_Props {
  expression: AST_Node
}
