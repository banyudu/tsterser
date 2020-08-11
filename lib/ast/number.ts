import AST_Constant from './constant'
import { return_true, mkshallow, make_num } from '../utils'
export default class AST_Number extends AST_Constant {
  is_number = return_true
  _size = function (): number {
    const { value } = this
    if (value === 0) return 1
    if (value > 0 && Math.floor(value) === value) {
      return Math.floor(Math.log10(value) + 1)
    }
    return value.toString().length
  }

  shallow_cmp = mkshallow({
    value: 'eq'
  })

  needs_parens = function (output: any) {
    var p = output.parent()
    if (p?._needs_parens(this)) {
      var value = this.getValue()
      if (value < 0 || /^0/.test(make_num(value))) {
        return true
      }
    }
    return undefined
  }

  _codegen = function (self, output) {
    if ((output.option('keep_numbers') || output.use_asm) && self.start && self.start.raw != null) {
      output.print(self.start.raw)
    } else {
      output.print(make_num(self.getValue()))
    }
  }

  static documentation = 'A number literal'
  static propdoc = {
    value: '[number] the numeric value',
    literal: '[string] numeric value as string (optional)'
  }

  TYPE = 'Number'
  static PROPS = AST_Constant.PROPS.concat(['value', 'literal'])

  constructor (args) {
    super(args)
    this.value = args.value
    this.literal = args.literal
  }
}
