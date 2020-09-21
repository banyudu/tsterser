import { OutputStream } from '../output'
import AST_Constant, { AST_Constant_Props } from './constant'
import { make_num } from '../utils'
export default class AST_Number extends AST_Constant {
  public literal?: any | undefined
  public value: any | undefined

  public is_number () { return true }
  public _size (): number {
    const { value } = this
    if (value === 0) return 1
    if (value > 0 && Math.floor(value) === value) {
      return Math.floor(Math.log10(value) + 1)
    }
    return value.toString().length
  }

  public shallow_cmp_props: any = {
    value: 'eq'
  }

  protected needs_parens (output: OutputStream): boolean {
    const p = output.parent()
    if (p?._needs_parens(this)) {
      const value = this.getValue()
      if (value < 0 || /^0/.test(make_num(value))) {
        return true
      }
    }
    return false
  }

  protected _codegen (output: OutputStream) {
    if ((output.option('keep_numbers') || output.use_asm) && this.start && this.start.raw != null) {
      output.print(this.start.raw)
    } else {
      output.print(make_num(this.getValue()))
    }
  }

  public static documentation = 'A number literal'
  public static propdoc ={
    value: '[number] the numeric value',
    literal: '[string] numeric value as string (optional)'
  }

  public static PROPS =AST_Constant.PROPS.concat(['value', 'literal'])

  public constructor (args: AST_Number_Props) {
    super(args)
    this.value = args.value
    this.literal = args.literal
  }
}

export interface AST_Number_Props extends AST_Constant_Props {
  value: any | undefined
  literal?: any | undefined
}
