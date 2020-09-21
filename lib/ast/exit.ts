import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Jump, { AST_Jump_Props } from './jump'
import TreeTransformer from '../tree-transformer'

export default class AST_Exit extends AST_Jump {
  public value: AST_Node | undefined | null

  public _prepend_comments_check (_node: AST_Node) {
    return true
  }

  protected walkInner () {
    return this.value ? [this.value] : []
  }

  public _children_backwards (push: Function) {
    if (this.value) push(this.value)
  }

  protected _transform (tw: TreeTransformer) {
    if (this.value) this.value = this.value.transform(tw)
  }

  public _do_print (output: OutputStream, kind: string) {
    output.print(kind)
    if (this.value) {
      output.space()
      const comments = this.value.start.comments_before
      if (comments?.length && !output.printed_comments.has(comments)) {
        output.print('(')
        this.value.print(output)
        output.print(')')
      } else {
        this.value.print(output)
      }
    }
    output.semicolon()
  }

  public static documentation = 'Base class for “exits” (`return` and `throw`)'
  public static propdoc ={
    value: '[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return'
  }

  public static PROPS =AST_Jump.PROPS.concat(['value'])
  public constructor (args: AST_Exit_Props) {
    super(args)
    this.value = args.value
  }
}

export interface AST_Exit_Props extends AST_Jump_Props {
  value?: AST_Node | undefined
}
