import AST_Node from './node'
import AST_Expansion from './expansion'
import AST_Constant from './constant'
import AST_String from './string'
import AST_Symbol from './symbol'
import { AST_Function } from './'

import {
  literals_in_boolean_context,
  trim,
  make_sequence,
  anyMayThrow,
  anySideEffect,
  is_strict,
  list_overhead,
  pass_through,
  do_list,
  to_moz,
  first_in_statement,
  print_braced_empty
} from '../utils'

export default class AST_Object extends AST_Node {
  properties: any

  _optimize (self, compressor) {
    var optimized = literals_in_boolean_context(self, compressor)
    if (optimized !== self) {
      return optimized
    }
    var props = self.properties
    for (var i = 0; i < props.length; i++) {
      var prop = props[i]
      if (prop instanceof AST_Expansion) {
        var expr = prop.expression
        if (expr instanceof AST_Object) {
          props.splice.apply(props, [i, 1].concat(prop.expression.properties))
          // Step back one, as the property at i is now new.
          i--
        } else if (expr instanceof AST_Constant &&
                  !(expr instanceof AST_String)) {
          // Unlike array-like spread, in object spread, spreading a
          // non-iterable value silently does nothing; it is thus safe
          // to remove. AST_String is the only iterable AST_Constant.
          props.splice(i, 1)
        }
      }
    }
    return self
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    var values = trim(this.properties, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  may_throw (compressor: any) {
    return anyMayThrow(this.properties, compressor)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.properties, compressor)
  }

  _eval (compressor: any, depth) {
    if (compressor.option('unsafe')) {
      var val = {}
      for (var i = 0, len = this.properties.length; i < len; i++) {
        var prop = this.properties[i]
        if (prop instanceof AST_Expansion) return this
        var key = prop.key
        if (key instanceof AST_Symbol) {
          key = key.name
        } else if (key instanceof AST_Node) {
          key = key._eval?.(compressor, depth)
          if (key === prop.key) return this
        }
        if (typeof Object.prototype[key] === 'function') {
          return this
        }
        if (prop.value instanceof AST_Function) continue
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

  _dot_throw (compressor: any) {
    if (!is_strict(compressor)) return false
    for (var i = this.properties.length; --i >= 0;) { if (this.properties[i]._dot_throw(compressor)) return true }
    return false
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      var properties = this.properties
      for (var i = 0, len = properties.length; i < len; i++) {
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

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.properties = do_list(self.properties, tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'ObjectExpression',
      properties: this.properties.map(to_moz)
    }
  }

  // same goes for an object literal, because otherwise it would be
  // interpreted as a block of code.
  needs_parens (output: any) {
    return !output.has_parens() && first_in_statement(output)
  }

  _codegen (self, output) {
    if (self.properties.length > 0) {
      output.with_block(function () {
        self.properties.forEach(function (prop, i) {
          if (i) {
            output.print(',')
            output.newline()
          }
          output.indent()
          prop.print(output)
        })
        output.newline()
      })
    } else print_braced_empty(self, output)
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'An object literal'
  static propdoc = {
    properties: '[AST_ObjectProperty*] array of properties'
  }

  TYPE = 'Object'
  static PROPS = AST_Node.PROPS.concat(['properties'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.properties = args.properties
  }
}
