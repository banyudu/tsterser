import AST_Symbol, { AST_Symbol_Props } from './symbol'
import { AST_LoopControl } from '.'

export default class AST_Label extends AST_Symbol {
  thedef: any
  references: AST_LoopControl[]
  mangled_name: any

  // labels are always mangleable
  public unmangleable () { return false }

  static documentation = 'Symbol naming a label (declaration)'
  static propdoc = {
    references: '[AST_LoopControl*] a list of nodes referring to this label'
  }

  static PROPS = AST_Symbol.PROPS.concat(['references'])
  constructor (args: AST_Label_Props) {
    super(args)
    this.references = []
    this.thedef = this
  }
}

export interface AST_Label_Props extends AST_Symbol_Props {
}
