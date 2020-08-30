import { OutputStream } from '../output'
import AST_Unary from './unary'
import Compressor from '../compressor'
import { unary_bool, non_converting_unary } from '../constants'
import { is_identifier_atom, make_node, make_sequence, best_of, first_in_statement, basic_negation, make_node_from_constant, is_ast_symbol_ref, is_ast_lambda, is_ast_unary_prefix, is_ast_prop_access, is_ast_sequence, is_ast_binary, is_ast_infinity, is_ast_number, is_ast_big_int } from '../utils'

export default class AST_UnaryPrefix extends AST_Unary {
  _in_boolean_context (context) {
    return this.operator == '!' && this.expression === context
  }

  _optimize (compressor: Compressor) {
    let self = this
    let e = self.expression
    if (self.operator == 'delete' &&
          !(is_ast_symbol_ref(e) ||
              is_ast_prop_access(e) ||
              is_identifier_atom(e))) {
      if (is_ast_sequence(e)) {
        const exprs = e.expressions.slice()
        exprs.push(make_node('AST_True', self))
        return make_sequence(self, exprs).optimize(compressor)
      }
      return make_sequence(self, [e, make_node('AST_True', self)]).optimize(compressor)
    }
    const seq = self.lift_sequences(compressor)
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
          if (is_ast_unary_prefix(e) && e.operator == '!') {
            // !!foo ==> foo, if we're in boolean context
            return e.expression
          }
          if (is_ast_binary(e)) {
            self = best_of(compressor, self, e.negate(compressor, first_in_statement(compressor)))
          }
          break
        case 'typeof':
          // typeof always returns a non-empty string, thus it's
          // always true in booleans
          compressor.warn('Boolean expression always true [{file}:{line},{col}]', self.start)
          return (is_ast_symbol_ref(e) ? make_node('AST_True', self) : make_sequence(self, [
            e,
            make_node('AST_True', self)
          ])).optimize(compressor)
      }
    }
    if (self.operator == '-' && is_ast_infinity(e)) {
      e = e.transform(compressor)
    }
    if (is_ast_binary(e) &&
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
          !(is_ast_number(e) || is_ast_infinity(e) || is_ast_big_int(e))) {
      let ev = self.evaluate(compressor)
      if (ev !== self) {
        ev = make_node_from_constant(ev, self).optimize(compressor)
        return best_of(compressor, ev, self)
      }
    }
    return self
  }

  _eval (compressor: Compressor, depth: number) {
    let e = this.expression
    // Function would be evaluated to an array and so typeof would
    // incorrectly return 'object'. Hence making is a special case.
    if (compressor.option('typeofs') &&
          this.operator == 'typeof' &&
          (is_ast_lambda(e) ||
              is_ast_symbol_ref(e) &&
                  is_ast_lambda(e.fixed_value()))) {
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

  _codegen (self: AST_UnaryPrefix, output: OutputStream) {
    const op = self.operator
    output.print(op)
    if (/^[a-z]/i.test(op) ||
            (/[+-]$/.test(op) &&
                is_ast_unary_prefix(self.expression) &&
                /^[+-]/.test(self.expression.operator))) {
      output.space()
    }
    self.expression.print(output)
  }

  static documentation = 'Unary prefix expression, i.e. `typeof i` or `++i`'

  static PROPS = AST_Unary.PROPS
}
