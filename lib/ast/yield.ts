import AST_Node from './node'
import { is_undefined, mkshallow, to_moz } from '../utils'

export default class AST_Yield extends AST_Node {
  value: any
  is_star: boolean
  expression: any

  _optimize (compressor) {
    if (this.expression && !this.is_star && is_undefined(this.expression, compressor)) {
      this.expression = null
    }
    return this
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, this.expression && function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.expression) push(this.expression)
  }

  _size = () => 6
  shallow_cmp = mkshallow({
    is_star: 'eq'
  })

  _transform (self, tw: any) {
    if (self.expression) self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'YieldExpression',
      argument: to_moz(this.expression),
      delegate: this.is_star
    }
  }

  needs_parens = function (output: any) {
    var p = output.parent()
    // (yield 1) + (yield 2)
    // a = yield 3
    if (p?.isAst?.('AST_Binary') && p.operator !== '=') { return true }
    // (yield 1)()
    // new (yield 1)()
    if (p?.isAst?.('AST_Call') && p.expression === this) { return true }
    // (yield 1) ? yield 2 : yield 3
    if (p?.isAst?.('AST_Conditional') && p.condition === this) { return true }
    // -(yield 4)
    if (p?.isAst?.('AST_Unary')) { return true }
    // (yield x).foo
    // (yield x)['foo']
    if (p?._needs_parens(this)) { return true }
    return undefined
  }

  _codegen = function (self, output) {
    var star = self.is_star ? '*' : ''
    output.print('yield' + star)
    if (self.expression) {
      output.space()
      self.expression.print(output)
    }
  }

  static documentation = 'A `yield` statement'
  static propdoc = {
    expression: '[AST_Node?] the value returned or thrown by this statement; could be null (representing undefined) but only when is_star is set to false',
    is_star: '[Boolean] Whether this is a yield or yield* statement'
  }

  static PROPS = AST_Node.PROPS.concat(['expression', 'is_star'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.is_star = args.is_star
  }
}
