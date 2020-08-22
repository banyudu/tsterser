import AST_Node from './node'
import Compressor from '../compressor'
import AST_With from './with'
import { PRECEDENCE } from '../parse'
import TreeWalker from '../tree-walker'

import {
  is_undefined,
  make_node,
  first_in_statement,
  best_of,
  make_sequence,
  maintain_this_binding,
  is_object,
  best,
  mkshallow,
  push,
  pop,
  to_moz,
  basic_negation,
  to_moz_in_destructuring,
  make_node_from_constant,
  is_nullish, is_ast_binary, is_ast_sequence, is_ast_unary, is_ast_call, is_ast_unary_postfix, is_ast_string, is_ast_unary_prefix, is_ast_symbol_ref, is_ast_prop_access, is_ast_null, is_ast_assign, is_ast_node, is_ast_constant, is_ast_template_string
} from '../utils'

import {
  has_flag,
  non_converting_binary,
  commutativeOperators,
  FALSY,
  binary,
  binary_bool,
  TRUTHY,
  set_flag,
  lazy_op
} from '../constants'

export default class AST_Binary extends AST_Node {
  left: AST_Node
  operator: string
  right: AST_Node

  _prepend_comments_check (node) {
    return this.left === node
  }

  _in_boolean_context_next (context) {
    if (this.operator == '&&' || this.operator == '||' || this.operator == '??') {
      return true
    }
  }

  _codegen_should_output_space (child: AST_Node) {
    return /^\w/.test(this.operator) && this.left === child
  }

  _optimize (compressor) {
    let self: any = this
    function reversible () {
      return self.left.is_constant() ||
              self.right.is_constant() ||
              !self.left.has_side_effects(compressor) &&
                  !self.right.has_side_effects(compressor)
    }
    function reverse (op?) {
      if (reversible()) {
        if (op) self.operator = op
        const tmp = self.left
        self.left = self.right
        self.right = tmp
      }
    }
    if (commutativeOperators.has(self.operator)) {
      if (self.right.is_constant() &&
              !self.left.is_constant()) {
        // if right is a constant, whatever side effects the
        // left side might have could not influence the
        // result.  hence, force switch.

        if (!(is_ast_binary(self.left) &&
                    PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
          reverse()
        }
      }
    }
    self = self.lift_sequences(compressor)
    let is_strict_comparison: any
    if (compressor.option('comparisons')) {
      switch (self.operator) {
        case '===':
        case '!==':
          is_strict_comparison = true
          if ((self.left.is_string(compressor) && self.right.is_string(compressor)) ||
              (self.left.is_number(compressor) && self.right.is_number(compressor)) ||
              (self.left.is_boolean() && self.right.is_boolean()) ||
              self.left.equivalent_to(self.right)) {
            self.operator = self.operator.substr(0, 2)
          }
        // XXX: intentionally falling down to the next case
        case '==':
        case '!=':
        // void 0 == x => null == x
          if (!is_strict_comparison && is_undefined(self.left, compressor)) {
            self.left = make_node('AST_Null', self.left)
          } else if (compressor.option('typeofs') &&
              // "undefined" == typeof x => undefined === x
              is_ast_string(self.left) &&
              self.left.value == 'undefined' &&
              is_ast_unary_prefix(self.right) &&
              self.right.operator == 'typeof') {
            const expr = self.right.expression
            if (is_ast_symbol_ref(expr) ? expr.is_declared(compressor)
              : !(is_ast_prop_access(expr) && compressor.option('ie8'))) {
              self.right = expr
              self.left = make_node('AST_Undefined', self.left).optimize(compressor)
              if (self.operator.length == 2) self.operator += '='
            }
          } else if (is_ast_symbol_ref(self.left) &&
              // obj !== obj => false
              is_ast_symbol_ref(self.right) &&
              self.left.definition?.() === self.right.definition?.() &&
              is_object(self.left.fixed_value())) {
            return make_node(self.operator[0] == '=' ? 'AST_True' : 'AST_False', self)
          }
          break
        case '&&':
        case '||':
          var lhs = self.left
          if (lhs.operator == self.operator) {
            lhs = lhs.right
          }
          if (is_ast_binary(lhs) &&
              lhs.operator == (self.operator == '&&' ? '!==' : '===') &&
              is_ast_binary(self.right) &&
              lhs.operator == self.right.operator &&
              (is_undefined(lhs.left, compressor) && is_ast_null(self.right.left) ||
                  is_ast_null(lhs.left) && is_undefined(self.right.left, compressor)) &&
              !lhs.right.has_side_effects(compressor) &&
              lhs.right.equivalent_to(self.right.right)) {
            let combined = make_node('AST_Binary', self, {
              operator: lhs.operator.slice(0, -1),
              left: make_node('AST_Null', self),
              right: lhs.right
            })
            if (lhs !== self.left) {
              combined = make_node('AST_Binary', self, {
                operator: self.operator,
                left: self.left.left,
                right: combined
              })
            }
            return combined
          }
          break
      }
    }
    if (self.operator == '+' && compressor.in_boolean_context()) {
      const ll = self.left.evaluate(compressor)
      const rr = self.right.evaluate(compressor)
      if (ll && typeof ll === 'string') {
        compressor.warn('+ in boolean context always true [{file}:{line},{col}]', self.start)
        return make_sequence(self, [
          self.right,
          make_node('AST_True', self)
        ]).optimize(compressor)
      }
      if (rr && typeof rr === 'string') {
        compressor.warn('+ in boolean context always true [{file}:{line},{col}]', self.start)
        return make_sequence(self, [
          self.left,
          make_node('AST_True', self)
        ]).optimize(compressor)
      }
    }
    if (compressor.option('comparisons') && self.is_boolean()) {
      if (!(is_ast_binary(compressor.parent())) ||
              is_ast_assign(compressor.parent())) {
        const negated = make_node('AST_UnaryPrefix', self, {
          operator: '!',
          expression: self.negate(compressor, first_in_statement(compressor))
        })
        self = best_of(compressor, self, negated)
      }
      if (compressor.option('unsafe_comps')) {
        switch (self.operator) {
          case '<': reverse('>'); break
          case '<=': reverse('>='); break
        }
      }
    }
    if (self.operator == '+') {
      if (is_ast_string(self.right) &&
              self.right.getValue() == '' &&
              self.left.is_string(compressor)) {
        return self.left
      }
      if (is_ast_string(self.left) &&
              self.left.getValue() == '' &&
              self.right.is_string(compressor)) {
        return self.right
      }
      if (is_ast_binary(self.left) &&
              self.left.operator == '+' &&
              is_ast_string(self.left.left) &&
              self.left.left.getValue() == '' &&
              self.right.is_string(compressor)) {
        self.left = self.left.right
        return self.transform(compressor)
      }
    }
    if (compressor.option('evaluate')) {
      switch (self.operator) {
        case '&&': {
          const ll = has_flag(self.left, TRUTHY)
            ? true
            : has_flag(self.left, FALSY)
              ? false
              : self.left.evaluate(compressor)
          if (!ll) {
            compressor.warn('Condition left of && always false [{file}:{line},{col}]', self.start)
            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor)
          } else if (!(is_ast_node(ll))) {
            compressor.warn('Condition left of && always true [{file}:{line},{col}]', self.start)
            return make_sequence(self, [self.left, self.right]).optimize(compressor)
          }
          const rr = self.right.evaluate(compressor)
          if (!rr) {
            if (compressor.in_boolean_context()) {
              compressor.warn('Boolean && always false [{file}:{line},{col}]', self.start)
              return make_sequence(self, [
                self.left,
                make_node('AST_False', self)
              ]).optimize(compressor)
            } else {
              set_flag(self, FALSY)
            }
          } else if (!(is_ast_node(rr))) {
            const parent = compressor.parent()
            if (parent.operator == '&&' && parent.left === compressor.self() || compressor.in_boolean_context()) {
              compressor.warn('Dropping side-effect-free && [{file}:{line},{col}]', self.start)
              return self.left.optimize(compressor)
            }
          }
          // x || false && y ---> x ? y : false
          if (self.left.operator == '||') {
            const lr = self.left.right.evaluate(compressor)
            if (!lr) {
              return make_node('AST_Conditional', self, {
                condition: self.left.left,
                consequent: self.right,
                alternative: self.left.right
              }).optimize(compressor)
            }
          }
          break
        }
        case '||': {
          const ll = has_flag(self.left, TRUTHY)
            ? true
            : has_flag(self.left, FALSY)
              ? false
              : self.left.evaluate(compressor)
          if (!ll) {
            compressor.warn('Condition left of || always false [{file}:{line},{col}]', self.start)
            return make_sequence(self, [self.left, self.right]).optimize(compressor)
          } else if (!(is_ast_node(ll))) {
            compressor.warn('Condition left of || always true [{file}:{line},{col}]', self.start)
            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor)
          }
          const rr = self.right.evaluate(compressor)
          if (!rr) {
            const parent = compressor.parent()
            if (parent.operator == '||' && parent.left === compressor.self() || compressor.in_boolean_context()) {
              compressor.warn('Dropping side-effect-free || [{file}:{line},{col}]', self.start)
              return self.left.optimize(compressor)
            }
          } else if (!(is_ast_node(rr))) {
            if (compressor.in_boolean_context()) {
              compressor.warn('Boolean || always true [{file}:{line},{col}]', self.start)
              return make_sequence(self, [
                self.left,
                make_node('AST_True', self)
              ]).optimize(compressor)
            } else {
              set_flag(self, TRUTHY)
            }
          }
          if (self.left.operator == '&&') {
            const lr = self.left.right.evaluate(compressor)
            if (lr && !(is_ast_node(lr))) {
              return make_node('AST_Conditional', self, {
                condition: self.left.left,
                consequent: self.left.right,
                alternative: self.right
              }).optimize(compressor)
            }
          }
          break
        }
        case '??': {
          if (is_nullish(self.left)) {
            return self.right
          }

          const ll = self.left.evaluate(compressor)
          if (!(is_ast_node(ll))) {
            // if we know the value for sure we can simply compute right away.
            return ll == null ? self.right : self.left
          }

          if (compressor.in_boolean_context()) {
            const rr = self.right.evaluate(compressor)
            if (!(is_ast_node(rr)) && !rr) {
              return self.left
            }
          }
        }
      }
      let associative = true
      switch (self.operator) {
        case '+':
          // "foo" + ("bar" + x) => "foobar" + x
          if (is_ast_constant(self.left) &&
                  is_ast_binary(self.right) &&
                  self.right.operator == '+' &&
                  self.right.is_string(compressor)) {
            const binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left,
              right: self.right.left
            })
            const l = binary.optimize(compressor)
            if (binary !== l) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: l,
                right: self.right.right
              })
            }
          }
          // (x + "foo") + "bar" => x + "foobar"
          if (is_ast_constant(self.right) &&
                  is_ast_binary(self.left) &&
                  self.left.operator == '+' &&
                  self.left.is_string(compressor)) {
            const binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left.right,
              right: self.right
            })
            const r = binary.optimize(compressor)
            if (binary !== r) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: self.left.left,
                right: r
              })
            }
          }
          // (x + "foo") + ("bar" + y) => (x + "foobar") + y
          if (is_ast_binary(self.left) &&
                  self.left.operator == '+' &&
                  self.left.is_string(compressor) &&
                  is_ast_binary(self.right) &&
                  self.right.operator == '+' &&
                  self.right.is_string(compressor)) {
            const binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left.right,
              right: self.right.left
            })
            const m = binary.optimize(compressor)
            if (binary !== m) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: make_node('AST_Binary', self.left, {
                  operator: '+',
                  left: self.left.left,
                  right: m
                }),
                right: self.right.right
              })
            }
          }
          // a + -b => a - b
          if (is_ast_unary_prefix(self.right) &&
                  self.right.operator == '-' &&
                  self.left.is_number(compressor)) {
            self = make_node('AST_Binary', self, {
              operator: '-',
              left: self.left,
              right: self.right.expression
            })
            break
          }
          // -a + b => b - a
          if (is_ast_unary_prefix(self.left) &&
                  self.left.operator == '-' &&
                  reversible() &&
                  self.right.is_number(compressor)) {
            self = make_node('AST_Binary', self, {
              operator: '-',
              left: self.right,
              right: self.left.expression
            })
            break
          }
          // `foo${bar}baz` + 1 => `foo${bar}baz1`
          if (is_ast_template_string(self.left)) {
            const l = self.left
            const r = self.right.evaluate(compressor)
            if (r != self.right) {
              l.segments[l.segments.length - 1].value += r.toString()
              return l
            }
          }
          // 1 + `foo${bar}baz` => `1foo${bar}baz`
          if (is_ast_template_string(self.right)) {
            const r = self.right
            const l = self.left.evaluate(compressor)
            if (l != self.left) {
              r.segments[0].value = l.toString() + r.segments[0].value
              return r
            }
          }
          // `1${bar}2` + `foo${bar}baz` => `1${bar}2foo${bar}baz`
          if (is_ast_template_string(self.left) &&
                  is_ast_template_string(self.right)) {
            const l = self.left
            const segments = l.segments
            const r = self.right
            segments[segments.length - 1].value += r.segments[0].value
            for (let i = 1; i < r.segments.length; i++) {
              segments.push(r.segments[i])
            }
            return l
          }
        case '*':
          associative = compressor.option('unsafe_math')
        case '&':
        case '|':
        case '^':
          // a + +b => +b + a
          if (self.left.is_number(compressor) &&
                  self.right.is_number(compressor) &&
                  reversible() &&
                  !(is_ast_binary(self.left) &&
                      self.left.operator != self.operator &&
                      PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
            const reversed = make_node('AST_Binary', self, {
              operator: self.operator,
              left: self.right,
              right: self.left
            })
            if (is_ast_constant(self.right) &&
                      !(is_ast_constant(self.left))) {
              self = best_of(compressor, reversed, self)
            } else {
              self = best_of(compressor, self, reversed)
            }
          }
          if (associative && self.is_number(compressor)) {
            // a + (b + c) => (a + b) + c
            if (is_ast_binary(self.right) &&
                      self.right.operator == self.operator) {
              self = make_node('AST_Binary', self, {
                operator: self.operator,
                left: make_node('AST_Binary', self.left, {
                  operator: self.operator,
                  left: self.left,
                  right: self.right.left,
                  start: self.left.start,
                  end: self.right.left.end
                }),
                right: self.right.right
              })
            }
            // (n + 2) + 3 => 5 + n
            // (2 * n) * 3 => 6 + n
            if (is_ast_constant(self.right) &&
                      is_ast_binary(self.left) &&
                      self.left.operator == self.operator) {
              if (is_ast_constant(self.left.left)) {
                self = make_node('AST_Binary', self, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left, {
                    operator: self.operator,
                    left: self.left.left,
                    right: self.right,
                    start: self.left.left.start,
                    end: self.right.end
                  }),
                  right: self.left.right
                })
              } else if (is_ast_constant(self.left.right)) {
                self = make_node('AST_Binary', self, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left, {
                    operator: self.operator,
                    left: self.left.right,
                    right: self.right,
                    start: self.left.right.start,
                    end: self.right.end
                  }),
                  right: self.left.left
                })
              }
            }
            // (a | 1) | (2 | d) => (3 | a) | b
            if (is_ast_binary(self.left) &&
                      self.left.operator == self.operator &&
                      is_ast_constant(self.left.right) &&
                      is_ast_binary(self.right) &&
                      self.right.operator == self.operator &&
                      is_ast_constant(self.right.left)) {
              self = make_node('AST_Binary', self, {
                operator: self.operator,
                left: make_node('AST_Binary', self.left, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left.left, {
                    operator: self.operator,
                    left: self.left.right,
                    right: self.right.left,
                    start: self.left.right.start,
                    end: self.right.left.end
                  }),
                  right: self.left.left
                }),
                right: self.right.right
              })
            }
          }
      }
    }
    // x && (y && z)  ==>  x && y && z
    // x || (y || z)  ==>  x || y || z
    // x + ("y" + z)  ==>  x + "y" + z
    // "x" + (y + "z")==>  "x" + y + "z"
    if (is_ast_binary(self.right) &&
          self.right.operator == self.operator &&
          (lazy_op.has(self.operator) ||
              (self.operator == '+' &&
                  (self.right.left.is_string(compressor) ||
                      (self.left.is_string(compressor) &&
                          self.right.right.is_string(compressor)))))
    ) {
      self.left = make_node('AST_Binary', self.left, {
        operator: self.operator,
        left: self.left,
        right: self.right.left
      })
      self.right = self.right.right
      return self.transform(compressor)
    }
    let ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement) {
    const right = this.right.drop_side_effect_free(compressor)
    if (!right) return this.left.drop_side_effect_free(compressor, first_in_statement)
    if (lazy_op.has(this.operator)) {
      if (right === this.right) return this
      const node = this.clone()
      node.right = right
      return node
    } else {
      const left = this.left.drop_side_effect_free(compressor, first_in_statement)
      if (!left) return this.right.drop_side_effect_free(compressor, first_in_statement)
      return make_sequence(this, [left, right])
    }
  }

  may_throw (compressor: Compressor) {
    return this.left.may_throw(compressor) ||
          this.right.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.left.has_side_effects(compressor) ||
          this.right.has_side_effects(compressor)
  }

  _eval (compressor: Compressor, depth) {
    if (!non_converting_binary.has(this.operator)) depth++
    const left = this.left._eval(compressor, depth)
    if (left === this.left) return this
    const right = this.right._eval(compressor, depth)
    if (right === this.right) return this
    let result
    switch (this.operator) {
      case '&&' : result = left && right; break
      case '||' : result = left || right; break
      case '??' : result = left != null ? left : right; break
      case '|' : result = left | right; break
      case '&' : result = left & right; break
      case '^' : result = left ^ right; break
      case '+' : result = left + right; break
      case '*' : result = left * right; break
      case '**' : result = Math.pow(left, right); break
      case '/' : result = left / right; break
      case '%' : result = left % right; break
      case '-' : result = left - right; break
      case '<<' : result = left << right; break
      case '>>' : result = left >> right; break
      case '>>>' : result = left >>> right; break
      case '==' : result = left == right; break
      case '===' : result = left === right; break
      case '!=' : result = left != right; break
      case '!==' : result = left !== right; break
      case '<' : result = left < right; break
      case '<=' : result = left <= right; break
      case '>' : result = left > right; break
      case '>=' : result = left >= right; break
      default:
        return this
    }
    if (isNaN(result) && compressor.find_parent(AST_With)) {
      // leave original expression as is
      return this
    }
    return result
  }

  is_constant_expression () {
    return this.left.is_constant_expression() &&
          this.right.is_constant_expression()
  }

  negate (compressor: Compressor, first_in_statement) {
    const self = this.clone(); const op = this.operator
    if (compressor.option('unsafe_comps')) {
      switch (op) {
        case '<=' : self.operator = '>'; return self
        case '<' : self.operator = '>='; return self
        case '>=' : self.operator = '<'; return self
        case '>' : self.operator = '<='; return self
      }
    }
    switch (op) {
      case '==' : self.operator = '!='; return self
      case '!=' : self.operator = '=='; return self
      case '===': self.operator = '!=='; return self
      case '!==': self.operator = '==='; return self
      case '&&':
        self.operator = '||'
        self.left = self.left.negate(compressor, first_in_statement)
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
      case '||':
        self.operator = '&&'
        self.left = self.left.negate(compressor, first_in_statement)
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
      case '??':
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
    }
    return basic_negation(this)
  }

  is_string (compressor: Compressor) {
    return this.operator == '+' &&
          (this.left.is_string(compressor) || this.right.is_string(compressor))
  }

  is_number (compressor: Compressor) {
    return binary.has(this.operator) || this.operator == '+' &&
          this.left.is_number(compressor) &&
          this.right.is_number(compressor)
  }

  is_boolean () {
    return binary_bool.has(this.operator) ||
          lazy_op.has(this.operator) &&
              this.left.is_boolean() &&
              this.right.is_boolean()
  }

  reduce_vars (tw: TreeWalker, descend, compressor: Compressor) {
    if (!lazy_op.has(this.operator)) return
    this.left.walk(tw)
    push(tw)
    this.right.walk(tw)
    pop(tw)
    return true
  }

  _dot_throw (compressor: Compressor) {
    return (this.operator == '&&' || this.operator == '||' || this.operator == '??') &&
          (this.left._dot_throw(compressor) || this.right._dot_throw(compressor))
  }

  lift_sequences (compressor: Compressor) {
    if (compressor.option('sequences')) {
      if (is_ast_sequence(this.left)) {
        const x = this.left.expressions.slice()
        const e = this.clone()
        e.left = x.pop()
        x.push(e)
        return make_sequence(this, x).optimize(compressor)
      }
      if (is_ast_sequence(this.right) && !this.left.has_side_effects(compressor)) {
        const assign = this.operator == '=' && is_ast_symbol_ref(this.left)
        let x = this.right.expressions
        const last = x.length - 1
        for (var i = 0; i < last; i++) {
          if (!assign && x[i].has_side_effects(compressor)) break
        }
        if (i == last) {
          x = x.slice()
          const e = this.clone()
          e.right = x.pop()
          x.push(e)
          return make_sequence(this, x).optimize(compressor)
        } else if (i > 0) {
          const e = this.clone()
          e.right = make_sequence(this.right, x.slice(i))
          x = x.slice(0, i)
          x.push(e)
          return make_sequence(this, x).optimize(compressor)
        }
      }
    }
    return this
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function () {
      this.left._walk(visitor)
      this.right._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.right)
    push(this.left)
  }

  shallow_cmp = mkshallow({ operator: 'eq' })
  _size (info): number {
    if (this.operator === 'in') return 4

    let size = this.operator.length

    if (
      (this.operator === '+' || this.operator === '-') &&
            is_ast_unary(this.right) && this.right.operator === this.operator
    ) {
      // 1+ +a > needs space between the +
      size += 1
    }

    if (this.needs_parens(info)) {
      size += 2
    }

    return size
  }

  _transform (self, tw: TreeWalker) {
    self.left = self.left.transform(tw)
    self.right = self.right.transform(tw)
  }

  _to_mozilla_ast (parent) {
    if (this.operator == '=' && to_moz_in_destructuring()) {
      return {
        type: 'AssignmentPattern',
        left: to_moz(this.left),
        right: to_moz(this.right)
      }
    }

    const type = this.operator == '&&' || this.operator == '||' || this.operator === '??'
      ? 'LogicalExpression'
      : 'BinaryExpression'

    return {
      type,
      left: to_moz(this.left),
      operator: this.operator,
      right: to_moz(this.right)
    }
  }

  needs_parens (output: any) {
    const p = output.parent()
    // (foo && bar)()
    if (is_ast_call(p) && p.expression === this) { return true }
    // typeof (foo && bar)
    if (is_ast_unary(p)) { return true }
    // (foo && bar)["prop"], (foo && bar).prop
    if (p?._needs_parens(this)) { return true }
    // this deals with precedence: 3 * (2 + 1)
    if (is_ast_binary(p)) {
      const po = p.operator
      const so = this.operator

      if (so === '??' && (po === '||' || po === '&&')) {
        return true
      }

      const pp = PRECEDENCE[po]
      const sp = PRECEDENCE[so]
      if (pp > sp ||
                (pp == sp &&
                    (this === p.right || po == '**'))) {
        return true
      }
    }
    return undefined
  }

  _codegen (self, output) {
    const op = self.operator
    self.left.print(output)
    if (op[0] == '>' && /* ">>" ">>>" ">" ">=" */
            is_ast_unary_postfix(self.left) &&
            self.left.operator == '--') {
      // space is mandatory to avoid outputting -->
      output.print(' ')
    } else {
      // the space is optional depending on "beautify"
      output.space()
    }
    output.print(op)
    if ((op == '<' || op == '<<') &&
            is_ast_unary_prefix(self.right) &&
            self.right.operator == '!' &&
            is_ast_unary_prefix(self.right.expression) &&
            self.right.expression.operator == '--') {
      // space is mandatory to avoid outputting <!--
      output.print(' ')
    } else {
      // the space is optional depending on "beautify"
      output.space()
    }
    self.right.print(output)
  }

  static documentation = 'Binary expression, i.e. `a + b`'
  static propdoc = {
    left: '[AST_Node] left-hand side expression',
    operator: '[string] the operator',
    right: '[AST_Node] right-hand side expression'
  }

  static PROPS = AST_Node.PROPS.concat(['operator', 'left', 'right'])
  constructor (args) { // eslint-disable-line
    super(args)
    this.operator = args.operator
    this.left = args.left
    this.right = args.right
  }
}
