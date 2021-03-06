import { OutputStream } from '../output'
import AST_Constant, { AST_Constant_Props } from './constant'
import '../utils'

export default class AST_String extends AST_Constant {
  public value: string
  public quote: string

  public is_string () { return true }
  public _size (): number {
    return this.value.length + 2
  }

  public shallow_cmp_props: any = {
    value: 'eq'
  }

  public addStrings (add: Function) {
    add(this.value)
  }

  protected _codegen (output: OutputStream) {
    output.print_string(this.getValue(), this.quote, output.in_directive)
  }

  public static documentation = 'A string literal'
  public static propdoc ={
    value: '[string] the contents of this string',
    quote: '[string] the original quote character'
  }

  public static PROPS =AST_Constant.PROPS.concat(['value', 'quote'])

  public constructor (args: AST_String_Props) {
    super(args)
    this.value = args.value
    this.quote = args.quote
  }
}

export interface AST_String_Props extends AST_Constant_Props {
  value: string
  quote: string
}
