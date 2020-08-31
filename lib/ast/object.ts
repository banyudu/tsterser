import { OutputStream } from '../output'
import AST_Node from './node'
import Compressor from '../compressor'
import AST_Destructuring from './destructuring'
import TreeWalker from '../tree-walker'

import {
  literals_in_boolean_context,
  trim,
  make_sequence,
  anyMayThrow,
  anySideEffect,
  is_strict,
  list_overhead,
  do_list,
  to_moz,
  first_in_statement,
  print_braced_empty, is_ast_expansion, is_ast_object, is_ast_symbol, is_ast_constant, is_ast_node, is_ast_string, is_ast_function
} from '../utils'

export default class AST_Object extends AST_Node {
  properties: AST_Node[]

  to_fun_args (croak: Function): any {
    return new AST_Destructuring({
      start: this.start,
      end: this.end,
      is_array: false,
      names: this.properties.map(item => item.to_fun_args(croak))
    })
  }

  _optimize (compressor: Compressor) {
    const optimized = literals_in_boolean_context(this, compressor)
    if (optimized !== this) {
      return optimized
    }
    const props = this.properties
    for (let i = 0; i < props.length; i++) {
      const prop = props[i]
      if (is_ast_expansion(prop)) {
        const expr = prop.expression
        if (is_ast_object(expr)) {
          props.splice.apply(props, [i, 1].concat(expr.properties as any) as any)
          // Step back one, as the property at i is now new.
          i--
        } else if (is_ast_constant(expr) &&
                  !(is_ast_string(expr))) {
          // Unlike array-like spread, in object spread, spreading a
          // non-iterable value silently does nothing; it is thus safe
          // to remove. AST_String is the only iterable AST_Constant.
          props.splice(i, 1)
        }
      }
    }
    return this
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean) {
    const values = trim(this.properties, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  may_throw (compressor: Compressor) {
    return anyMayThrow(this.properties, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.properties, compressor)
  }

  _eval (compressor: Compressor, depth: number) {
    if (compressor.option('unsafe')) {
      const val = {}
      for (let i = 0, len = this.properties.length; i < len; i++) {
        const prop: any = this.properties[i]
        if (is_ast_expansion(prop)) return this
        let key = prop.key
        if (is_ast_symbol(key)) {
          key = key.name
        } else if (is_ast_node(key)) {
          key = key._eval?.(compressor, depth)
          if (key === prop.key) return this
        }
        if (typeof Object.prototype[key] === 'function') {
          return this
        }
        if (is_ast_function(prop.value)) continue
        val[key] = prop.value._eval(compressor, depth)
        if (val[key] === prop.value) return this
      }
      return val
    }
    return this
  }

  is_constant_expression () {
    return this.properties.every((l) => l.is_constant_expression())
  }

  _dot_throw (compressor: Compressor) {
    if (!is_strict(compressor)) return false
    for (let i = this.properties.length; --i >= 0;) { if (this.properties[i]._dot_throw(compressor)) return true }
    return false
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      const properties = this.properties
      for (let i = 0, len = properties.length; i < len; i++) {
        properties[i]._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    let i = this.properties.length
    while (i--) push(this.properties[i])
  }

  _size (info): number {
    let base = 2
    if (first_in_statement(info)) {
      base += 2 // parens
    }
    return base + list_overhead(this.properties)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeWalker) {
    this.properties = do_list(this.properties, tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'ObjectExpression',
      properties: this.properties.map(to_moz)
    }
  }

  // same goes for an object literal, because otherwise it would be
  // interpreted as a block of code.
  needs_parens (output: OutputStream) {
    return !output.has_parens() && first_in_statement(output)
  }

  _codegen (output: OutputStream) {
    if (this.properties.length > 0) {
      output.with_block(() => {
        this.properties.forEach(function (prop, i) {
          if (i) {
            output.print(',')
            output.newline()
          }
          output.indent()
          prop.print(output)
        })
        output.newline()
      })
    } else print_braced_empty(this, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'An object literal'
  static propdoc = {
    properties: '[AST_ObjectProperty*] array of properties'
  }

  static PROPS = AST_Node.PROPS.concat(['properties'])
  constructor (args?) {
    super(args)
    this.properties = args.properties
  }
}
