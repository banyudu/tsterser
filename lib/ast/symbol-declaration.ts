import AST_Symbol, { AST_Symbol_Props } from './symbol'
import Compressor from '../compressor'
import { HOP, warn } from '../utils'

export default class AST_SymbolDeclaration extends AST_Symbol {
  init?: any
  thedef: any

  may_throw (compressor: Compressor) { return false }
  has_side_effects (compressor: Compressor) { return false }
  _find_defs (compressor: Compressor, suffix) {
    if (!this.global()) return
    if (HOP(compressor.option('global_defs') as object, this.name)) warn(compressor, this)
  }

  static documentation = 'A declaration symbol (symbol in var/const, function name or argument, symbol in catch)'

  static PROPS = AST_Symbol.PROPS.concat(['init'])
  constructor (args?: AST_SymbolDeclaration_Props) {
    super(args)
    this.init = args.init
  }
}

export interface AST_SymbolDeclaration_Props extends AST_Symbol_Props {
  init?: any | undefined
}
