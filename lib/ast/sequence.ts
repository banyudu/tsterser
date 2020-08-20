import AST_Node from './node'
import Compressor from '../compressor'
import AST_Number from './number'
import TreeWalker from '../tree-walker'
import {
  maintain_this_binding,
  first_in_statement,
  merge_sequence,
  anyMayThrow,
  anySideEffect,
  pass_through,
  to_moz,
  do_list,
  make_sequence,
  is_undefined,
  make_node,
  list_overhead
} from '../utils'

export default class AST_Sequence extends AST_Node {
  expressions: any

  _prepend_comments_check (node) {
    return this.expressions[0] === node
  }

  _optimize (compressor) {
    let self = this
    if (!compressor.option('side_effects')) return self
    var expressions: any[] = []
    filter_for_side_effects()
    var end = expressions.length - 1
    trim_right_for_undefined()
    if (end == 0) {
      self = maintain_this_binding(compressor.parent(), compressor.self(), expressions[0])
      if (!(self?.isAst?.('AST_Sequence'))) self = self.optimize(compressor)
      return self
    }
    self.expressions = expressions
    return self

    function filter_for_side_effects () {
      var first = first_in_statement(compressor)
      var last = self.expressions.length - 1
      self.expressions.forEach(function (expr, index) {
        if (index < last) expr = expr.drop_side_effect_free(compressor, first)
        if (expr) {
          merge_sequence(expressions, expr)
          first = false
        }
      })
    }

    function trim_right_for_undefined () {
      while (end > 0 && is_undefined(expressions[end], compressor)) end--
      if (end < expressions.length - 1) {
        expressions[end] = make_node('AST_UnaryPrefix', self, {
          operator: 'void',
          expression: expressions[end]
        })
        expressions.length = end + 1
      }
    }
  }

  drop_side_effect_free (compressor: Compressor) {
    var last = this.tail_node()
    var expr = last.drop_side_effect_free(compressor)
    if (expr === last) return this
    var expressions = this.expressions.slice(0, -1)
    if (expr) expressions.push(expr)
    if (!expressions.length) {
      return make_node('AST_Number', this, { value: 0 })
    }
    return make_sequence(this, expressions)
  }

  may_throw (compressor: Compressor) {
    return anyMayThrow(this.expressions, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.expressions, compressor)
  }

  negate (compressor: Compressor) {
    var expressions = this.expressions.slice()
    expressions.push(expressions.pop().negate(compressor))
    return make_sequence(this, expressions)
  }

  is_string (compressor: Compressor) {
    return this.tail_node().is_string(compressor)
  }

  is_number (compressor: Compressor) {
    return this.tail_node().is_number(compressor)
  }

  is_boolean () {
    return this.tail_node().is_boolean()
  }

  _dot_throw (compressor: Compressor) {
    return this.tail_node()._dot_throw(compressor)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function () {
      this.expressions.forEach(function (node: AST_Node) {
        node._walk(visitor)
      })
    })
  }

  addStrings (add: Function) {
    this.tail_node()?.addStrings(add)
  }

  _children_backwards (push: Function) {
    let i = this.expressions.length
    while (i--) push(this.expressions[i])
  }

  _size (): number {
    return list_overhead(this.expressions)
  }

  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    const result = do_list(self.expressions, tw)
    self.expressions = result.length
      ? result
      : [new AST_Number({ value: 0 })]
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'SequenceExpression',
      expressions: this.expressions.map(to_moz)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_Call') || // (foo, bar)() or foo(1, (2, 3), 4)
            p?.isAst?.('AST_Unary') || // !(foo, bar, baz)
            p?.isAst?.('AST_Binary') || // 1 + (2, 3) + 4 ==> 8
            p?.isAst?.('AST_VarDef') || // var a = (1, 2), b = a + a; ==> b == 4
            p?.isAst?.('AST_PropAccess') || // (1, {foo:2}).foo or (1, {foo:2})["foo"] ==> 2
            p?.isAst?.('AST_Array') || // [ 1, (2, 3), 4 ] ==> [ 1, 3, 4 ]
            p?.isAst?.('AST_ObjectProperty') || // { foo: (1, 2) }.foo ==> 2
            p?.isAst?.('AST_Conditional') || /* (false, true) ? (a = 10, b = 20) : (c = 30)
                                                                * ==> 20 (side effect, set a := 10 and b := 20) */
            p?.isAst?.('AST_Arrow') || // x => (x, x)
            p?.isAst?.('AST_DefaultAssign') || // x => (x = (0, function(){}))
            p?.isAst?.('AST_Expansion') || // [...(a, b)]
            p?.isAst?.('AST_ForOf') && this === p.object || // for (e of (foo, bar)) {}
            p?.isAst?.('AST_Yield') || // yield (foo, bar)
            p?.isAst?.('AST_Export') // export default (foo, bar)
  }

  _do_print (this: any, output: any) {
    this.expressions.forEach(function (node, index) {
      if (index > 0) {
        output.comma()
        if (output.should_break()) {
          output.newline()
          output.indent()
        }
      }
      node.print(output)
    })
  }

  _codegen (self, output) {
    self._do_print(output)
  }

  tail_node () {
    return this.expressions[this.expressions.length - 1]
  }

  static documentation = 'A sequence expression (comma-separated expressions)'
  static propdoc = {
    expressions: '[AST_Node*] array of expressions (at least two)'
  }

  static PROPS = AST_Node.PROPS.concat(['expressions'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expressions = args.expressions
  }
}
