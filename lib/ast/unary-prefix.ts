import AST_Unary from './unary'
import Compressor from '../compressor'
import { unary_bool, non_converting_unary } from '../constants'
import { is_identifier_atom, make_node, make_sequence, best_of, first_in_statement, basic_negation, make_node_from_constant } from '../utils'

export default class AST_UnaryPrefix extends AST_Unary {
  _in_boolean_context (context) {
    return this.operator == '!' && this.expression === context
  }

  _optimize (compressor) {
    let self = this
    var e = self.expression
    if (self.operator == 'delete' &&
          !(e?.isAst?.('AST_SymbolRef') ||
              e?.isAst?.('AST_PropAccess') ||
              is_identifier_atom(e))) {
      if (e?.isAst?.('AST_Sequence')) {
        const exprs = e.expressions.slice()
        exprs.push(make_node('AST_True', self))
        return make_sequence(self, exprs).optimize(compressor)
      }
      return make_sequence(self, [e, make_node('AST_True', self)]).optimize(compressor)
    }
    var seq = self.lift_sequences(compressor)
    if (seq !== self) {
      return seq
    }
    if (compressor.option('side_effects') && self.operator == 'void') {
      e = e.drop_side_effect_free(compressor)
      if (e) {
        self.expression = e
        return self
      } else {
        return make_node('AST_Undefined', self).optimize(compressor)
      }
    }
    if (compressor.in_boolean_context()) {
      switch (self.operator) {
        case '!':
          if (e?.isAst?.('AST_UnaryPrefix') && e.operator == '!') {
            // !!foo ==> foo, if we're in boolean context
            return e.expression
          }
          if (e?.isAst?.('AST_Binary')) {
            self = best_of(compressor, self, e.negate(compressor, first_in_statement(compressor)))
          }
          break
        case 'typeof':
          // typeof always returns a non-empty string, thus it's
          // always true in booleans
          compressor.warn('Boolean expression always true [{file}:{line},{col}]', self.start)
          return (e?.isAst?.('AST_SymbolRef') ? make_node('AST_True', self) : make_sequence(self, [
            e,
            make_node('AST_True', self)
          ])).optimize(compressor)
      }
    }
    if (self.operator == '-' && e?.isAst?.('AST_Infinity')) {
      e = e.transform(compressor)
    }
    if (e?.isAst?.('AST_Binary') &&
          (self.operator == '+' || self.operator == '-') &&
          (e.operator == '*' || e.operator == '/' || e.operator == '%')) {
      return make_node('AST_Binary', self, {
        operator: e.operator,
        left: make_node('AST_UnaryPrefix', e.left, {
          operator: self.operator,
          expression: e.left
        }),
        right: e.right
      })
    }
    // avoids infinite recursion of numerals
    if (self.operator != '-' ||
          !(e?.isAst?.('AST_Number') || e?.isAst?.('AST_Infinity') || e?.isAst?.('AST_BigInt'))) {
      var ev = self.evaluate(compressor)
      if (ev !== self) {
        ev = make_node_from_constant(ev, self).optimize(compressor)
        return best_of(compressor, ev, self)
      }
    }
    return self
  }

  _eval (compressor: Compressor, depth) {
    var e = this.expression
    // Function would be evaluated to an array and so typeof would
    // incorrectly return 'object'. Hence making is a special case.
    if (compressor.option('typeofs') &&
          this.operator == 'typeof' &&
          (e?.isAst?.('AST_Lambda') ||
              e?.isAst?.('AST_SymbolRef') &&
                  e.fixed_value()?.isAst?.('AST_Lambda'))) {
      return typeof function () {}
    }
    if (!non_converting_unary.has(this.operator)) depth++
    e = e._eval(compressor, depth)
    if (e === this.expression) return this
    switch (this.operator) {
      case '!': return !e
      case 'typeof':
        // typeof <RegExp> returns "object" or "function" on different platforms
        // so cannot evaluate reliably
        if (e instanceof RegExp) return this
        return typeof e
      case 'void': return void e
      case '~': return ~e
      case '-': return -e
      case '+': return +e
    }
    return this
  }

  negate () {
    if (this.operator == '!') { return this.expression }
    return basic_negation(this)
  }

  is_string () {
    return this.operator == 'typeof'
  }

  is_boolean () {
    return unary_bool.has(this.operator)
  }

  _dot_throw () {
    return this.operator == 'void'
  }

  _codegen (self, output) {
    var op = self.operator
    output.print(op)
    if (/^[a-z]/i.test(op) ||
            (/[+-]$/.test(op) &&
                self.expression?.isAst?.('AST_UnaryPrefix') &&
                /^[+-]/.test(self.expression.operator))) {
      output.space()
    }
    self.expression.print(output)
  }

  static documentation = 'Unary prefix expression, i.e. `typeof i` or `++i`'

  static PROPS = AST_Unary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
