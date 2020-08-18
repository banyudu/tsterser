import AST_Node from './node'
import {
  make_sequence,
  first_in_statement,
  best_of,
  make_node,
  best,
  push,
  pop,
  is_nullish_check,
  to_moz,
  pass_through,
  needsParens,
  maintain_this_binding
} from '../utils'

import TreeWalker from '../tree-walker'

export default class AST_Conditional extends AST_Node {
  alternative: any
  consequent: any
  condition: any

  _prepend_comments_check (node) {
    return this.condition === node
  }

  addStrings (add: Function) {
    this.consequent?.addStrings(add)
    this.alternative?.addStrings(add)
  }

  _in_boolean_context (context) {
    if (this.condition === context) {
      return true
    }
  }

  _in_boolean_context_next (context) {
    return true
  }

  _optimize (compressor) {
    let self = this
    if (!compressor.option('conditionals')) return self
    // This looks like lift_sequences(), should probably be under "sequences"
    if (self.condition?.isAst?.('AST_Sequence')) {
      var expressions = self.condition.expressions.slice()
      self.condition = expressions.pop()
      expressions.push(self)
      return make_sequence(self, expressions)
    }
    var cond = self.condition.evaluate(compressor)
    if (cond !== self.condition) {
      if (cond) {
        compressor.warn('Condition always true [{file}:{line},{col}]', self.start)
        return maintain_this_binding(compressor.parent(), compressor.self(), self.consequent)
      } else {
        compressor.warn('Condition always false [{file}:{line},{col}]', self.start)
        return maintain_this_binding(compressor.parent(), compressor.self(), self.alternative)
      }
    }
    var negated = cond.negate(compressor, first_in_statement(compressor))
    if (best_of(compressor, cond, negated) === negated) {
      self = make_node('AST_Conditional', self, {
        condition: negated,
        consequent: self.alternative,
        alternative: self.consequent
      })
    }
    var condition = self.condition
    var consequent = self.consequent
    var alternative = self.alternative
    // x?x:y --> x||y
    if (condition?.isAst?.('AST_SymbolRef') &&
          consequent?.isAst?.('AST_SymbolRef') &&
          condition.definition?.() === consequent.definition?.()) {
      return make_node('AST_Binary', self, {
        operator: '||',
        left: condition,
        right: alternative
      })
    }
    // if (foo) exp = something; else exp = something_else;
    //                   |
    //                   v
    // exp = foo ? something : something_else;
    if (consequent?.isAst?.('AST_Assign') &&
          alternative?.isAst?.('AST_Assign') &&
          consequent.operator == alternative.operator &&
          consequent.left.equivalent_to(alternative.left) &&
          (!self.condition.has_side_effects(compressor) ||
              consequent.operator == '=' &&
                  !consequent.left.has_side_effects(compressor))) {
      return make_node('AST_Assign', self, {
        operator: consequent.operator,
        left: consequent.left,
        right: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: consequent.right,
          alternative: alternative.right
        })
      })
    }
    // x ? y(a) : y(b) --> y(x ? a : b)
    var arg_index
    if (consequent?.isAst?.('AST_Call') &&
          alternative.TYPE === consequent.TYPE &&
          consequent.args.length > 0 &&
          consequent.args.length == alternative.args.length &&
          consequent.expression.equivalent_to(alternative.expression) &&
          !self.condition.has_side_effects(compressor) &&
          !consequent.expression.has_side_effects(compressor) &&
          typeof (arg_index = single_arg_diff()) === 'number') {
      var node = consequent.clone()
      node.args[arg_index] = make_node('AST_Conditional', self, {
        condition: self.condition,
        consequent: consequent.args[arg_index],
        alternative: alternative.args[arg_index]
      })
      return node
    }
    // a ? b : c ? b : d --> (a || c) ? b : d
    if (alternative?.isAst?.('AST_Conditional') &&
          consequent.equivalent_to(alternative.consequent)) {
      return make_node('AST_Conditional', self, {
        condition: make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: alternative.condition
        }),
        consequent: consequent,
        alternative: alternative.alternative
      }).optimize(compressor)
    }

    // a == null ? b : a -> a ?? b
    if (
      compressor.option('ecma') >= 2020 &&
          is_nullish_check(condition, alternative, compressor)
    ) {
      return make_node('AST_Binary', self, {
        operator: '??',
        left: alternative,
        right: consequent
      }).optimize(compressor)
    }

    // a ? b : (c, b) --> (a || c), b
    if (alternative?.isAst?.('AST_Sequence') &&
          consequent.equivalent_to(alternative.expressions[alternative.expressions.length - 1])) {
      return make_sequence(self, [
        make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: make_sequence(self, alternative.expressions.slice(0, -1))
        }),
        consequent
      ]).optimize(compressor)
    }
    // a ? b : (c && b) --> (a || c) && b
    if (alternative?.isAst?.('AST_Binary') &&
          alternative.operator == '&&' &&
          consequent.equivalent_to(alternative.right)) {
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: alternative.left
        }),
        right: consequent
      }).optimize(compressor)
    }
    // x?y?z:a:a --> x&&y?z:a
    if (consequent?.isAst?.('AST_Conditional') &&
          consequent.alternative.equivalent_to(alternative)) {
      return make_node('AST_Conditional', self, {
        condition: make_node('AST_Binary', self, {
          left: self.condition,
          operator: '&&',
          right: consequent.condition
        }),
        consequent: consequent.consequent,
        alternative: alternative
      })
    }
    // x ? y : y --> x, y
    if (consequent.equivalent_to(alternative)) {
      return make_sequence(self, [
        self.condition,
        consequent
      ]).optimize(compressor)
    }
    // x ? y || z : z --> x && y || z
    if (consequent?.isAst?.('AST_Binary') &&
          consequent.operator == '||' &&
          consequent.right.equivalent_to(alternative)) {
      return make_node('AST_Binary', self, {
        operator: '||',
        left: make_node('AST_Binary', self, {
          operator: '&&',
          left: self.condition,
          right: consequent.left
        }),
        right: alternative
      }).optimize(compressor)
    }
    var in_bool = compressor.in_boolean_context()
    if (is_true(self.consequent)) {
      if (is_false(self.alternative)) {
        // c ? true : false ---> !!c
        return booleanize(self.condition)
      }
      // c ? true : x ---> !!c || x
      return make_node('AST_Binary', self, {
        operator: '||',
        left: booleanize(self.condition),
        right: self.alternative
      })
    }
    if (is_false(self.consequent)) {
      if (is_true(self.alternative)) {
        // c ? false : true ---> !c
        return booleanize(self.condition.negate(compressor))
      }
      // c ? false : x ---> !c && x
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: booleanize(self.condition.negate(compressor)),
        right: self.alternative
      })
    }
    if (is_true(self.alternative)) {
      // c ? x : true ---> !c || x
      return make_node('AST_Binary', self, {
        operator: '||',
        left: booleanize(self.condition.negate(compressor)),
        right: self.consequent
      })
    }
    if (is_false(self.alternative)) {
      // c ? x : false ---> !!c && x
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: booleanize(self.condition),
        right: self.consequent
      })
    }

    return self

    function booleanize (node: any) {
      if (node.is_boolean()) return node
      // !!expression
      return make_node('AST_UnaryPrefix', node, {
        operator: '!',
        expression: node.negate(compressor)
      })
    }

    // AST_True or !0
    function is_true (node: any) {
      return node?.isAst?.('AST_True') ||
              in_bool &&
                  node?.isAst?.('AST_Constant') &&
                  node.getValue() ||
              (node?.isAst?.('AST_UnaryPrefix') &&
                  node.operator == '!' &&
                  node.expression?.isAst?.('AST_Constant') &&
                  !node.expression.getValue())
    }
    // AST_False or !1
    function is_false (node: any) {
      return node?.isAst?.('AST_False') ||
              in_bool &&
                  node?.isAst?.('AST_Constant') &&
                  !node.getValue() ||
              (node?.isAst?.('AST_UnaryPrefix') &&
                  node.operator == '!' &&
                  node.expression?.isAst?.('AST_Constant') &&
                  node.expression.getValue())
    }

    function single_arg_diff () {
      var a = consequent.args
      var b = alternative.args
      for (var i = 0, len = a.length; i < len; i++) {
        if (a[i]?.isAst?.('AST_Expansion')) return
        if (!a[i].equivalent_to(b[i])) {
          if (b[i]?.isAst?.('AST_Expansion')) return
          for (var j = i + 1; j < len; j++) {
            if (a[j]?.isAst?.('AST_Expansion')) return
            if (!a[j].equivalent_to(b[j])) return
          }
          return i
        }
      }
    }
  }

  drop_side_effect_free (compressor: any) {
    var consequent = this.consequent.drop_side_effect_free(compressor)
    var alternative = this.alternative.drop_side_effect_free(compressor)
    if (consequent === this.consequent && alternative === this.alternative) return this
    if (!consequent) {
      return alternative ? make_node('AST_Binary', this, {
        operator: '||',
        left: this.condition,
        right: alternative
      }) : this.condition.drop_side_effect_free(compressor)
    }
    if (!alternative) {
      return make_node('AST_Binary', this, {
        operator: '&&',
        left: this.condition,
        right: consequent
      })
    }
    var node = this.clone()
    node.consequent = consequent
    node.alternative = alternative
    return node
  }

  may_throw (compressor: any) {
    return this.condition.may_throw(compressor) ||
          this.consequent.may_throw(compressor) ||
          this.alternative.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.condition.has_side_effects(compressor) ||
          this.consequent.has_side_effects(compressor) ||
          this.alternative.has_side_effects(compressor)
  }

  _eval (compressor: any, depth) {
    var condition = this.condition._eval(compressor, depth)
    if (condition === this.condition) return this
    var node = condition ? this.consequent : this.alternative
    var value = node._eval(compressor, depth)
    return value === node ? this : value
  }

  negate (compressor: any, first_in_statement) {
    var self = this.clone()
    self.consequent = self.consequent.negate(compressor)
    self.alternative = self.alternative.negate(compressor)
    return best(this, self, first_in_statement)
  }

  is_string (compressor: any) {
    return this.consequent.is_string(compressor) && this.alternative.is_string(compressor)
  }

  is_number (compressor: any) {
    return this.consequent.is_number(compressor) && this.alternative.is_number(compressor)
  }

  is_boolean () {
    return this.consequent.is_boolean() && this.alternative.is_boolean()
  }

  reduce_vars (tw: TreeWalker) {
    this.condition.walk(tw)
    push(tw)
    this.consequent.walk(tw)
    pop(tw)
    push(tw)
    this.alternative.walk(tw)
    pop(tw)
    return true
  }

  _dot_throw (compressor: any) {
    return this.consequent._dot_throw(compressor) ||
          this.alternative._dot_throw(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.consequent._walk(visitor)
      this.alternative._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.alternative)
    push(this.consequent)
    push(this.condition)
  }

  _size = () => 3
  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    self.condition = self.condition.transform(tw)
    self.consequent = self.consequent.transform(tw)
    self.alternative = self.alternative.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ConditionalExpression',
      test: to_moz(this.condition),
      consequent: to_moz(this.consequent),
      alternate: to_moz(this.alternative)
    }
  }

  needs_parens = needsParens
  _codegen (self, output) {
    self.condition.print(output)
    output.space()
    output.print('?')
    output.space()
    self.consequent.print(output)
    output.space()
    output.colon()
    self.alternative.print(output)
  }

  static documentation = 'Conditional expression using the ternary operator, i.e. `a ? b : c`'
  static propdoc = {
    condition: '[AST_Node]',
    consequent: '[AST_Node]',
    alternative: '[AST_Node]'
  }

  static PROPS = AST_Node.PROPS.concat(['condition', 'consequent', 'alternative'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.condition = args.condition
    this.consequent = args.consequent
    this.alternative = args.alternative
  }
}
