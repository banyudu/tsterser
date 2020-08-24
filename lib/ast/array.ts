import { OutputStream } from '../output'
import AST_Node from './node'
import Compressor from '../compressor'
import AST_Destructuring from './destructuring'
import TreeWalker from '../tree-walker'
import {
  literals_in_boolean_context,
  inline_array_like_spread,
  trim,
  list_overhead,
  do_list,
  to_moz,
  pass_through,
  make_sequence,
  anyMayThrow,
  anySideEffect, is_ast_hole
} from '../utils'

export default class AST_Array extends AST_Node {
  elements: AST_Node[]

  to_fun_args (to_fun_args, croak): any {
    return new AST_Destructuring({
      start: this.start,
      end: this.end,
      is_array: true,
      names: this.elements.map(to_fun_args)
    })
  }

  _optimize (compressor: Compressor) {
    const optimized = literals_in_boolean_context(this, compressor)
    if (optimized !== this) {
      return optimized
    }
    return inline_array_like_spread(this, compressor, this.elements)
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement) {
    const values = trim(this.elements, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  may_throw (compressor: Compressor) {
    return anyMayThrow(this.elements, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.elements, compressor)
  }

  _eval (compressor: Compressor, depth) {
    if (compressor.option('unsafe')) {
      const elements: any[] = []
      for (let i = 0, len = this.elements.length; i < len; i++) {
        const element = this.elements[i]
        const value = element._eval(compressor, depth)
        if (element === value) return this
        elements.push(value)
      }
      return elements
    }
    return this
  }

  is_constant_expression () {
    return this.elements.every((l) => l.is_constant_expression())
  }

  _dot_throw () { return false }
  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      const elements = this.elements
      for (let i = 0, len = elements.length; i < len; i++) {
        elements[i]._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    let i = this.elements.length
    while (i--) push(this.elements[i])
  }

  _size (): number {
    return 2 + list_overhead(this.elements)
  }

  shallow_cmp = pass_through
  _transform (self: AST_Array, tw: TreeWalker) {
    self.elements = do_list(self.elements, tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'ArrayExpression',
      elements: this.elements.map(to_moz)
    }
  }

  _codegen (self: AST_Array, output: OutputStream) {
    output.with_square(function () {
      const a = self.elements; const len = a.length
      if (len > 0) output.space()
      a.forEach(function (exp, i) {
        if (i) output.comma()
        exp.print(output)
        // If the final element is a hole, we need to make sure it
        // doesn't look like a trailing comma, by inserting an actual
        // trailing comma.
        if (i === len - 1 && is_ast_hole(exp)) { output.comma() }
      })
      if (len > 0) output.space()
    })
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'An array literal'
  static propdoc = {
    elements: '[AST_Node*] array of elements'
  }

  static PROPS = AST_Node.PROPS.concat(['elements'])
  constructor (args) { // eslint-disable-line
    super(args)
    this.elements = args.elements
  }
}
