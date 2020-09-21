import AST_Symbol, { AST_Symbol_Props } from './symbol'
import { AST_LoopControl } from '.'

export default class AST_Label extends AST_Symbol {
  public thedef: any
  public references: AST_LoopControl[]
  public mangled_name: any

  // labels are always mangleable
  public unmangleable () { return false }

  public static documentation = 'Symbol naming a label (declaration)'
  public static propdoc ={
    references: '[AST_LoopControl*] a list of nodes referring to this label'
  }

  public static PROPS =AST_Symbol.PROPS.concat(['references'])
  public constructor (args: AST_Label_Props) {
    super(args)
    this.references = []
    this.thedef = this
  }
}

export interface AST_Label_Props extends AST_Symbol_Props {
}
