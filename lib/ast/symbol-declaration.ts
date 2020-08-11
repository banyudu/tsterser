import AST_Symbol from './symbol'
import { return_false, HOP, warn } from '../utils'

export default class AST_SymbolDeclaration extends AST_Symbol {
  init: any
  thedef: any

  may_throw = return_false
  has_side_effects = return_false
  _find_defs = function (compressor: any) {
    if (!this.global()) return
    if (HOP(compressor.option('global_defs') as object, this.name)) warn(compressor, this)
  }

  static documentation = 'A declaration symbol (symbol in var/const, function name or argument, symbol in catch)'

  TYPE = 'SymbolDeclaration'
  static PROPS = AST_Symbol.PROPS.concat(['init'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.init = args.init
  }
}
