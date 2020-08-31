import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Constant from './constant'
import '../utils'

export default class AST_BigInt extends AST_Constant {
  _eval () { return this }
  _size (): number {
    return this.value.length
  }

  shallow_cmp_props: any = { value: 'eq' }

  _to_mozilla_ast (parent: AST_Node): any { return {
    type: 'BigIntLiteral',
    value: this.value
  } }

  _codegen (this: AST_BigInt, output: OutputStream) {
    output.print(this.getValue() + 'n')
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    if (p?._needs_parens(this)) {
      const value = this.getValue()
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
