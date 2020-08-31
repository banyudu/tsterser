import { OutputStream } from '../output'
import AST_Constant from './constant'
import '../utils'

export default class AST_String extends AST_Constant {
  value: string
  quote: string

  is_string () { return true }
  _size (): number {
    return this.value.length + 2
  }

  shallow_cmp_props: any = {
    value: 'eq'
  }

  addStrings (add: Function) {
    add(this.value)
  }

  _codegen (output: OutputStream) {
    output.print_string(this.getValue(), this.quote, output.in_directive)
  }

  static documentation = 'A string literal'
  static propdoc = {
    value: '[string] the contents of this string',
    quote: '[string] the original quote character'
  }

  static PROPS = AST_Constant.PROPS.concat(['value', 'quote'])

  constructor (args) {
    super(args)
    this.value = args.value
    this.quote = args.quote
  }
}
