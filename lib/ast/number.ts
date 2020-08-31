import { OutputStream } from '../output'
import AST_Constant from './constant'
import { make_num } from '../utils'
export default class AST_Number extends AST_Constant {
  is_number () { return true }
  _size (): number {
    const { value } = this
    if (value === 0) return 1
    if (value > 0 && Math.floor(value) === value) {
      return Math.floor(Math.log10(value) + 1)
    }
    return value.toString().length
  }

  shallow_cmp_props: any = {
    value: 'eq'
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    if (p?._needs_parens(this)) {
      const value = this.getValue()
      if (value < 0 || /^0/.test(make_num(value))) {
        return true
      }
    }
    return undefined
  }

  _codegen (output: OutputStream) {
    if ((output.option('keep_numbers') || output.use_asm) && this.start && this.start.raw != null) {
      output.print(this.start.raw)
    } else {
      output.print(make_num(this.getValue()))
    }
  }

  static documentation = 'A number literal'
  static propdoc = {
    value: '[number] the numeric value',
    literal: '[string] numeric value as string (optional)'
  }

  static PROPS = AST_Constant.PROPS.concat(['value', 'literal'])

  constructor (args) {
    super(args)
    this.value = args.value
    this.literal = args.literal
  }
}
