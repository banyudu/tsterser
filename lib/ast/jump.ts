import { OutputStream } from '../output'
import AST_Statement from './statement'
import { pass_through } from '../utils'

export default class AST_Jump extends AST_Statement {
  aborts () { return this }
  shallow_cmp = pass_through
  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = "Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"

  static PROPS = AST_Statement.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
