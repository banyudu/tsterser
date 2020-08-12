import AST_Symbol from './symbol'
import { return_false } from '../utils'

export default class AST_Label extends AST_Symbol {
  thedef: any
  references: any
  mangled_name: any

  // labels are always mangleable
  unmangleable = return_false
  initialize = function () {
    this.references = []
    this.thedef = this
  }

  static documentation = 'Symbol naming a label (declaration)'
  static propdoc = {
    references: '[AST_LoopControl*] a list of nodes referring to this label'
  }

  static PROPS = AST_Symbol.PROPS.concat(['references'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.references = args.references
    this.initialize()
  }
}
