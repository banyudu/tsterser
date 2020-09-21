import AST_Node from './node'
import { OutputStream } from '../output'
import AST_StatementWithBody, { AST_StatementWithBody_Props } from './statement-with-body'
import { to_moz } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_With extends AST_StatementWithBody {
  public expression: AST_Node
  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    result.push(this.body)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.body)
    push(this.expression)
  }

  public _size = () => 6
  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
    this.body = (this.body).transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'WithStatement',
      object: to_moz(this.expression),
      body: to_moz(this.body)
    }
  }

  protected _codegen (output: OutputStream) {
    output.print('with')
    output.space()
    output.with_parens(() => {
      this.expression.print(output)
    })
    output.space()
    this._do_print_body(output)
  }

  public static documentation = 'A `with` statement'
  public static propdoc ={
    expression: '[AST_Node] the `with` expression'
  }

  public static PROPS =AST_StatementWithBody.PROPS.concat(['expression'])
  public constructor (args: AST_With_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_With_Props extends AST_StatementWithBody_Props {
  expression: AST_Node
}
