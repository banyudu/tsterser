import AST_Constant from './constant'
import { return_this, mkshallow } from '../utils'

export default class AST_BigInt extends AST_Constant {
  _eval = return_this
  _size = function (): number {
    return this.value.length
  }

  shallow_cmp = mkshallow({ value: 'eq' })

  _to_mozilla_ast (parent): any { return {
    type: 'BigIntLiteral',
    value: this.value
  } }

  _codegen = function (self, output) {
    output.print(self.getValue() + 'n')
  }

  needs_parens = function (output: any) {
    var p = output.parent()
    if (p?._needs_parens(this)) {
      var value = this.getValue()
      if (value.startsWith('-')) {
        return true
      }
    }
    return undefined
  }

  static documentation = 'A big int literal'
  static propdoc = {
    value: '[string] big int value'
  }

  static PROPS = AST_Constant.PROPS.concat(['value'])

  constructor (args) {
    super(args)
    this.value = args.value
  }
}
