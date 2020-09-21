import { OutputStream } from '../output'
import AST_Jump, { AST_Jump_Props } from './jump'
import AST_LabelRef from './label-ref'
import TreeTransformer from '../tree-transformer'

export default class AST_LoopControl extends AST_Jump {
  public label: AST_LabelRef | undefined
  protected walkInner () {
    return this.label ? [this.label] : []
  }

  public _children_backwards (push: Function) {
    if (this.label) push(this.label)
  }

  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    if (this.label) this.label = this.label.transform(tw)
  }

  public _do_print (output: OutputStream, kind: string) {
    output.print(kind)
    if (this.label) {
      output.space()
      this.label.print(output)
    }
    output.semicolon()
  }

  public static documentation = 'Base class for loop control statements (`break` and `continue`)'
  public static propdoc ={
    label: '[AST_LabelRef?] the label, or null if none'
  }

  public static PROPS =AST_Jump.PROPS.concat(['label'])
  public constructor (args: AST_LoopControl_Props) {
    super(args)
    this.label = args.label
  }
}

export interface AST_LoopControl_Props extends AST_Jump_Props {
  label?: AST_LabelRef | undefined
}
