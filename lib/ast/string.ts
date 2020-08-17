import AST_Constant from './constant'
import { return_true, mkshallow } from '../utils'

export default class AST_String extends AST_Constant {
  value: any
  quote: any

  is_string = return_true
  _size = function (): number {
    return this.value.length + 2
  }

  shallow_cmp = mkshallow({
    value: 'eq'
  })

  addStrings (add: Function) {
    add(this.value)
  }

  _codegen = function (self, output) {
    output.print_string(self.getValue(), self.quote, output.in_directive)
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
