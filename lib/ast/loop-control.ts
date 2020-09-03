import { OutputStream } from '../output'
import AST_Jump, { AST_Jump_Props } from './jump'
import { AST_LabelRef } from '.'
import TreeTransformer from '../tree-transformer'

export default class AST_LoopControl extends AST_Jump {
  label: AST_LabelRef | undefined
  walkInner () {
    const result = []
    result.push(this.label)
    return result
  }

  _children_backwards (push: Function) {
    if (this.label) push(this.label)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    if (this.label) this.label = this.label.transform(tw)
  }

  _do_print (output: OutputStream, kind: string) {
    output.print(kind)
    if (this.label) {
      output.space()
      this.label.print(output)
    }
    output.semicolon()
  }

  static documentation = 'Base class for loop control statements (`break` and `continue`)'
  static propdoc = {
    label: '[AST_LabelRef?] the label, or null if none'
  }

  static PROPS = AST_Jump.PROPS.concat(['label'])
  constructor (args?: AST_LoopControl_Props) {
    super(args)
    this.label = args.label
  }
}

export interface AST_LoopControl_Props extends AST_Jump_Props {
  label?: AST_LabelRef | undefined | undefined
}
