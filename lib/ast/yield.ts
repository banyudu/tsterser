import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { is_undefined, to_moz, is_ast_binary, is_ast_call, is_ast_conditional, is_ast_unary } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_Yield extends AST_Node {
  value: any
  is_star: boolean
  expression: AST_Node | undefined

  _optimize (compressor: Compressor): any {
    if (this.expression && !this.is_star && is_undefined(this.expression, compressor)) {
      this.expression = null
    }
    return this
  }

  walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    return result
  }

  _children_backwards (push: Function) {
    if (this.expression) push(this.expression)
  }

  _size = () => 6
  shallow_cmp_props: any = {
    is_star: 'eq'
  }

  _transform (tw: TreeTransformer) {
    if (this.expression) this.expression = this.expression.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'YieldExpression',
      argument: to_moz(this.expression),
      delegate: this.is_star
    }
  }

  needs_parens (output: OutputStream): boolean {
    const p = output.parent()
    // (yield 1) + (yield 2)
    // a = yield 3
    if (is_ast_binary(p) && p.operator !== '=') { return true }
    // (yield 1)()
    // new (yield 1)()
    if (is_ast_call(p) && p.expression === this) { return true }
    // (yield 1) ? yield 2 : yield 3
    if (is_ast_conditional(p) && p.condition === this) { return true }
    // -(yield 4)
    if (is_ast_unary(p)) { return true }
    // (yield x).foo
    // (yield x)['foo']
    if (p?._needs_parens(this)) { return true }
    return undefined
  }

  _codegen (output: OutputStream) {
    const star = this.is_star ? '*' : ''
    output.print('yield' + star)
    if (this.expression) {
      output.space()
      this.expression.print(output)
    }
  }

  static documentation = 'A `yield` statement'
  static propdoc = {
    expression: '[AST_Node?] the value returned or thrown by this statement; could be null (representing undefined) but only when is_star is set to false',
    is_star: '[boolean] Whether this is a yield or yield* statement'
  }

  static PROPS = AST_Node.PROPS.concat(['expression', 'is_star'])
  constructor (args?: AST_Yield_Props) {
    super(args)
    this.expression = args.expression
    this.is_star = args.is_star
  }
}

export interface AST_Yield_Props extends AST_Node_Props {
  expression?: AST_Node | undefined | undefined
  is_star?: boolean | undefined
}
