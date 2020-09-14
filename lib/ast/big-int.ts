import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Constant, { AST_Constant_Props } from './constant'
import '../utils'

export default class AST_BigInt extends AST_Constant {
  value: any | undefined

  _eval () { return this }
  _size (): number {
    return this.value.length
  }

  shallow_cmp_props: any = { value: 'eq' }

  _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'BigIntLiteral',
      value: this.value
    }
  }

  _codegen (output: OutputStream) {
    output.print(this.getValue() + 'n')
  }

  needs_parens (output: OutputStream): boolean {
    const p = output.parent()
    if (p?._needs_parens(this)) {
      const value = this.getValue()
      if (value.startsWith('-')) {
        return true
      }
    }
    return false
  }

  static documentation = 'A big int literal'
  static propdoc = {
    value: '[string] big int value'
  }

  static PROPS = AST_Constant.PROPS.concat(['value'])

  constructor (args: AST_BigInt_Props) {
    super(args)
    this.value = args.value
  }
}

export interface AST_BigInt_Props extends AST_Constant_Props {
  value: any | undefined
}
