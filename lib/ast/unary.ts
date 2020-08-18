import AST_Node from './node'
import TreeWalker from '../tree-walker'
import { unary_side_effects, WRITE_ONLY, set_flag, clear_flag, unary } from '../constants'
import { is_iife_call, safe_to_assign, make_node, mkshallow, mark, make_sequence, to_moz } from '../utils'

export default class AST_Unary extends AST_Node {
  operator: any
  expression: any
  drop_side_effect_free (compressor: any, first_in_statement) {
    if (unary_side_effects.has(this.operator)) {
      if (!this.expression.has_side_effects(compressor)) {
        set_flag(this, WRITE_ONLY)
      } else {
        clear_flag(this, WRITE_ONLY)
      }
      return this
    }
    if (this.operator == 'typeof' && this.expression?.isAst?.('AST_SymbolRef')) return null
    var expression = this.expression.drop_side_effect_free(compressor, first_in_statement)
    if (first_in_statement && expression && is_iife_call(expression)) {
      if (expression === this.expression && this.operator == '!') return this
      return expression.negate(compressor, first_in_statement)
    }
    return expression
  }

  may_throw (compressor: any) {
    if (this.operator == 'typeof' && this.expression?.isAst?.('AST_SymbolRef')) { return false }
    return this.expression.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return unary_side_effects.has(this.operator) ||
          this.expression.has_side_effects(compressor)
  }

  is_constant_expression () {
    return this.expression.is_constant_expression()
  }

  is_number () {
    return unary.has(this.operator)
  }

  reduce_vars (tw: TreeWalker) {
    var node = this
    if (node.operator !== '++' && node.operator !== '--') return
    var exp = node.expression
    if (!(exp?.isAst?.('AST_SymbolRef'))) return
    var def = exp.definition?.()
    var safe = safe_to_assign(tw, def, exp.scope, true)
    def.assignments++
    if (!safe) return
    var fixed = def.fixed
    if (!fixed) return
    def.references.push(exp)
    def.chained = true
    def.fixed = function () {
      return make_node('AST_Binary', node, {
        operator: node.operator.slice(0, -1),
        left: make_node('AST_UnaryPrefix', node, {
          operator: '+',
          expression: fixed?.isAst?.('AST_Node') ? fixed : fixed()
        }),
        right: make_node('AST_Number', node, {
          value: 1
        })
      })
    }
    mark(tw, def, true)
    return true
  }

  lift_sequences (compressor: any) {
    if (compressor.option('sequences')) {
      if (this.expression?.isAst?.('AST_Sequence')) {
        var x = this.expression.expressions.slice()
        var e = this.clone()
        e.expression = x.pop()
        x.push(e)
        return make_sequence(this, x).optimize(compressor)
      }
    }
    return this
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size (): number {
    if (this.operator === 'typeof') return 7
    if (this.operator === 'void') return 5
    return this.operator.length
  }

  shallow_cmp = mkshallow({ operator: 'eq' })
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: this.operator == '++' || this.operator == '--' ? 'UpdateExpression' : 'UnaryExpression',
      operator: this.operator,
      prefix: this?.isAst?.('AST_UnaryPrefix'),
      argument: to_moz(this.expression)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_PropAccess') && p.expression === this ||
            p?.isAst?.('AST_Call') && p.expression === this ||
            p?.isAst?.('AST_Binary') &&
                p.operator === '**' &&
                this?.isAst?.('AST_UnaryPrefix') &&
                p.left === this &&
                this.operator !== '++' &&
                this.operator !== '--'
  }

  static documentation = 'Base class for unary expressions'
  static propdoc = {
    operator: '[string] the operator',
    expression: '[AST_Node] expression that this unary operator applies to'
  }

  static PROPS = AST_Node.PROPS.concat(['operator', 'expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.operator = args.operator
    this.expression = args.expression
  }
}
