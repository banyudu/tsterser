import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import AST_Number from './number'
import { MozillaAst } from '../types'
import {
  maintain_this_binding,
  first_in_statement,
  merge_sequence,
  anyMayThrow,
  anySideEffect,
  to_moz,
  do_list,
  make_sequence,
  is_undefined,
  make_node,
  list_overhead, is_ast_sequence, is_ast_call, is_ast_unary, is_ast_binary, is_ast_var_def, is_ast_prop_access, is_ast_array, is_ast_object_property, is_ast_conditional, is_ast_arrow, is_ast_default_assign, is_ast_expansion, is_ast_for_of, is_ast_yield, is_ast_export
} from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_Sequence extends AST_Node {
  expressions: AST_Node[]

  public _prepend_comments_check (node: AST_Node) {
    return this.expressions[0] === node
  }

  protected _optimize (compressor: Compressor): any {
    let self: any = this
    if (!compressor.option('side_effects')) return self
    const expressions: any[] = []
    filter_for_side_effects()
    let end = expressions.length - 1
    trim_right_for_undefined()
    if (end == 0) {
      self = maintain_this_binding(compressor.parent(), compressor.self(), expressions[0])
      if (!(is_ast_sequence(self))) self = self.optimize(compressor)
      return self
    }
    self.expressions = expressions
    return self

    function filter_for_side_effects () {
      let first = first_in_statement(compressor)
      const last = self.expressions.length - 1
      self.expressions.forEach(function (expr: AST_Node, index: number) {
        const tmp = (index < last) ? expr.drop_side_effect_free(compressor, first) : expr
        if (tmp) {
          merge_sequence(expressions, tmp)
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

  public drop_side_effect_free (compressor: Compressor): any {
    const last = this.tail_node()
    const expr = last.drop_side_effect_free(compressor)
    if (expr === last) return this
    const expressions = this.expressions.slice(0, -1)
    if (expr) expressions.push(expr)
    if (!expressions.length) {
      return make_node('AST_Number', this, { value: 0 })
    }
    return make_sequence(this, expressions)
  }

  public may_throw (compressor: Compressor) {
    return anyMayThrow(this.expressions, compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return anySideEffect(this.expressions, compressor)
  }

  public negate (compressor: Compressor): AST_Node {
    const expressions = this.expressions.slice()
    expressions.push(expressions.pop()?.negate(compressor) as any)
    return make_sequence(this, expressions)
  }

  public is_string (compressor: Compressor) {
    return this.tail_node().is_string(compressor)
  }

  public is_number (compressor: Compressor) {
    return this.tail_node().is_number(compressor)
  }

  public is_boolean () {
    return this.tail_node().is_boolean()
  }

  public _dot_throw (compressor: Compressor) {
    return this.tail_node()._dot_throw(compressor)
  }

  protected walkInner () {
    const result: AST_Node[] = []
    this.expressions.forEach(function (node: AST_Node) {
      result.push(node)
    })
    return result
  }

  public addStrings (add: Function) {
    this.tail_node()?.addStrings(add)
  }

  public _children_backwards (push: Function) {
    let i = this.expressions.length
    while (i--) push(this.expressions[i])
  }

  public _size (): number {
    return list_overhead(this.expressions)
  }

  shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    const result = do_list(this.expressions, tw)
    this.expressions = result.length
      ? result
      : [new AST_Number({ value: 0 })]
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'SequenceExpression',
      expressions: this.expressions.map(to_moz)
    }
  }

  protected needs_parens (output: OutputStream): boolean {
    const p = output.parent()
    return is_ast_call(p) || // (foo, bar)() or foo(1, (2, 3), 4)
            is_ast_unary(p) || // !(foo, bar, baz)
            is_ast_binary(p) || // 1 + (2, 3) + 4 ==> 8
            is_ast_var_def(p) || // var a = (1, 2), b = a + a; ==> b == 4
            is_ast_prop_access(p) || // (1, {foo:2}).foo or (1, {foo:2})["foo"] ==> 2
            is_ast_array(p) || // [ 1, (2, 3), 4 ] ==> [ 1, 3, 4 ]
            is_ast_object_property(p) || // { foo: (1, 2) }.foo ==> 2
            is_ast_conditional(p) || /* (false, true) ? (a = 10, b = 20) : (c = 30)
                                                                * ==> 20 (side effect, set a := 10 and b := 20) */
            is_ast_arrow(p) || // x => (x, x)
            is_ast_default_assign(p) || // x => (x = (0, function(){}))
            is_ast_expansion(p) || // [...(a, b)]
            (is_ast_for_of(p) && this === p.object) || // for (e of (foo, bar)) {}
            is_ast_yield(p) || // yield (foo, bar)
            is_ast_export(p) // export default (foo, bar)
  }

  public _do_print (output: OutputStream) {
    this.expressions.forEach(function (node: AST_Node, index) {
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

  protected _codegen (output: OutputStream) {
    this._do_print(output)
  }

  public tail_node () {
    return this.expressions[this.expressions.length - 1]
  }

  static documentation = 'A sequence expression (comma-separated expressions)'
  static propdoc = {
    expressions: '[AST_Node*] array of expressions (at least two)'
  }

  static PROPS = AST_Node.PROPS.concat(['expressions'])
  constructor (args: AST_Sequence_Props) {
    super(args)
    this.expressions = args.expressions
  }
}

export interface AST_Sequence_Props extends AST_Node_Props {
  expressions: AST_Node[]
}
