import AST_Node from './node'
import AST_Destructuring from './destructuring'
import {
  literals_in_boolean_context,
  inline_array_like_spread,
  trim,
  return_false,
  list_overhead,
  do_list,
  to_moz,
  pass_through,
  make_sequence,
  anyMayThrow,
  anySideEffect
} from '../utils'

import { IArray_Props, INode, IArray } from '../../types/ast'

export default class AST_Array extends AST_Node implements IArray {
  elements: INode[]

  to_fun_args (to_fun_args, insert_default, croak, default_seen_above?: AST_Node): any {
    return insert_default(new AST_Destructuring({
      start: this.start,
      end: this.end,
      is_array: true,
      names: this.elements.map(to_fun_args)
    }))
  }

  _optimize (self, compressor) {
    var optimized = literals_in_boolean_context(self, compressor)
    if (optimized !== self) {
      return optimized
    }
    return inline_array_like_spread(self, compressor, self.elements)
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    var values = trim(this.elements, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  may_throw (compressor: any) {
    return anyMayThrow(this.elements, compressor)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.elements, compressor)
  }

  _eval (compressor: any, depth) {
    if (compressor.option('unsafe')) {
      var elements: any[] = []
      for (var i = 0, len = this.elements.length; i < len; i++) {
        var element = this.elements[i]
        var value = element._eval(compressor, depth)
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

  _dot_throw = return_false
  _walk (visitor: any) {
    return visitor._visit(this, function () {
      var elements = this.elements
      for (var i = 0, len = elements.length; i < len; i++) {
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
  _transform (self, tw: any) {
    self.elements = do_list(self.elements, tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'ArrayExpression',
      elements: this.elements.map(to_moz)
    }
  }

  _codegen (self, output) {
    output.with_square(function () {
      var a = self.elements; var len = a.length
      if (len > 0) output.space()
      a.forEach(function (exp, i) {
        if (i) output.comma()
        exp.print(output)
        // If the final element is a hole, we need to make sure it
        // doesn't look like a trailing comma, by inserting an actual
        // trailing comma.
        if (i === len - 1 && exp?.isAst?.('AST_Hole')) { output.comma() }
      })
      if (len > 0) output.space()
    })
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'An array literal'
  static propdoc = {
    elements: '[AST_Node*] array of elements'
  }

  static PROPS = AST_Node.PROPS.concat(['elements'])
  constructor (args: IArray_Props) { // eslint-disable-line
    super(args)
    this.elements = args.elements
  }
}
