import AST_Node from './node'
import { OutputStream } from '../output'
import AST_IterationStatement, { AST_IterationStatement_Props } from './iteration-statement'
import Compressor from '../compressor'
import { suppress, reset_block_variables, push, pop, to_moz, is_ast_for_of } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_ForIn extends AST_IterationStatement {
  public init: AST_Node
  public object: AST_Node
  public await: boolean = false

  public reduce_vars (tw: TreeWalker, _descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
    suppress(this.init)
    this.object.walk(tw)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    this.body.walk(tw)
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.init)
    result.push(this.object)
    result.push(this.body)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.body)
    if (this.object) push(this.object)
    if (this.init) push(this.init)
  }

  public _size = () => 8
  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.init = this.init?.transform(tw) || null
    this.object = this.object.transform(tw)
    this.body = (this.body).transform(tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'ForInStatement',
      left: to_moz(this.init),
      right: to_moz(this.object),
      body: to_moz(this.body)
    }
  }

  protected _codegen (output: OutputStream) {
    output.print('for')
    if (this.await) {
      output.space()
      output.print('await')
    }
    output.space()
    output.with_parens(() => {
            this.init?.print(output)
            output.space()
            output.print(is_ast_for_of(this) ? 'of' : 'in')
            output.space()
            this.object.print(output)
    })
    output.space()
    this._do_print_body(output)
  }

  public static documentation = 'A `for ... in` statement'
  public static propdoc ={
    init: '[AST_Node] the `for/in` initialization code',
    object: "[AST_Node] the object that we're looping through"
  } as any

  public static PROPS =AST_IterationStatement.PROPS.concat(['init', 'object'])
  public constructor (args: AST_ForIn_Props) {
    super(args)
    this.init = args.init
    this.object = args.object
  }
}

export interface AST_ForIn_Props extends AST_IterationStatement_Props {
  init: AST_Node
  object: AST_Node
}
