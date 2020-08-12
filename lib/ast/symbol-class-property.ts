import AST_Symbol from './symbol'
import { return_false } from '../utils'

export default class AST_SymbolClassProperty extends AST_Symbol {
  may_throw = return_false
  has_side_effects = return_false
  // TODO take propmangle into account
  _size = function (): number {
    return this.name.length
  }

  static documentation = 'Symbol for a class property'

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
