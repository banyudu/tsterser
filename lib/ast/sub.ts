import AST_PropAccess from './prop-access'
import { is_lhs, make_node, best_of, make_node_from_constant, to_moz, best_of_expression, safe_to_flatten, make_sequence } from '../utils'
import { UNUSED, clear_flag } from '../constants'
import { is_basic_identifier_string } from '../parse'

export default class AST_Sub extends AST_PropAccess {
  _prepend_comments_check (node) {
    return this.expression === node
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'MemberExpression',
      object: to_moz(this.expression),
      computed: true,
      property: to_moz(this.property)
    }
  }

  _optimize (compressor) {
    var expr = this.expression
    var prop = this.property
    var property: any
    if (compressor.option('properties')) {
      var key = prop.evaluate(compressor)
      if (key !== prop) {
        if (typeof key === 'string') {
          if (key == 'undefined') {
            key = undefined
          } else {
            var value = parseFloat(key)
            if (value.toString() == key) {
              key = value
            }
          }
        }
        prop = this.property = best_of_expression(prop, make_node_from_constant(key, prop).transform(compressor))
        property = '' + key
        if (is_basic_identifier_string(property) &&
                  property.length <= prop.size() + 1) {
          return make_node('AST_Dot', this, {
            expression: expr,
            property: property,
            quote: prop.quote
          }).optimize(compressor)
        }
      }
    }
    var fn
    OPT_ARGUMENTS: if (compressor.option('arguments') &&
          expr?.isAst?.('AST_SymbolRef') &&
          expr.name == 'arguments' &&
          expr.definition?.().orig.length == 1 &&
          (fn = expr.scope)?.isAst?.('AST_Lambda') &&
          fn.uses_arguments &&
          !(fn?.isAst?.('AST_Arrow')) &&
          prop?.isAst?.('AST_Number')) {
      var index = prop.getValue()
      var params = new Set()
      var argnames = fn.argnames
      for (var n = 0; n < argnames.length; n++) {
        if (!(argnames[n]?.isAst?.('AST_SymbolFunarg'))) {
          break OPT_ARGUMENTS // destructuring parameter - bail
        }
        var param = argnames[n].name
        if (params.has(param)) {
          break OPT_ARGUMENTS // duplicate parameter - bail
        }
        params.add(param)
      }
      var argname: any = fn.argnames[index]
      if (argname && compressor.has_directive('use strict')) {
        var def = argname.definition?.()
        if (!compressor.option('reduce_vars') || def.assignments || def.orig.length > 1) {
          argname = null
        }
      } else if (!argname && !compressor.option('keep_fargs') && index < fn.argnames.length + 5) {
        while (index >= fn.argnames.length) {
          argname = make_node('AST_SymbolFunarg', fn, {
            name: fn.make_var_name('argument_' + fn.argnames.length),
            scope: fn
          })
          fn.argnames.push(argname)
          fn.enclosed.push(fn.def_variable(argname))
        }
      }
      if (argname) {
        var sym = make_node('AST_SymbolRef', this, argname)
        sym.reference({})
        clear_flag(argname, UNUSED)
        return sym
      }
    }
    if (is_lhs(this, compressor.parent())) return this
    if (key !== prop) {
      var sub = this.flatten_object(property, compressor)
      if (sub) {
        expr = this.expression = sub.expression
        prop = this.property = sub.property
      }
    }
    if (compressor.option('properties') && compressor.option('side_effects') &&
          prop?.isAst?.('AST_Number') && expr?.isAst?.('AST_Array')) {
      var index = prop.getValue()
      var elements = expr.elements
      var retValue = elements[index]
      FLATTEN: if (safe_to_flatten(retValue, compressor)) {
        var flatten = true
        var values: any[] = []
        for (var i = elements.length; --i > index;) {
          const value = elements[i].drop_side_effect_free(compressor)
          if (value) {
            values.unshift(value)
            if (flatten && value.has_side_effects(compressor)) flatten = false
          }
        }
        if (retValue?.isAst?.('AST_Expansion')) break FLATTEN
        retValue = retValue?.isAst?.('AST_Hole') ? make_node('AST_Undefined', retValue) : retValue
        if (!flatten) values.unshift(retValue)
        while (--i >= 0) {
          let value = elements[i]
          if (value?.isAst?.('AST_Expansion')) break FLATTEN
          value = value.drop_side_effect_free(compressor)
          if (value) values.unshift(value)
          else index--
        }
        if (flatten) {
          values.push(retValue)
          return make_sequence(this, values).optimize(compressor)
        } else {
          return make_node('AST_Sub', this, {
            expression: make_node('AST_Array', expr, {
              elements: values
            }),
            property: make_node('AST_Number', prop, {
              value: index
            })
          })
        }
      }
    }
    var ev = this.evaluate(compressor)
    if (ev !== this) {
      ev = make_node_from_constant(ev, this).optimize(compressor)
      return best_of(compressor, ev, this)
    }
    return this
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    if (this.expression.may_throw_on_access(compressor)) return this
    var expression = this.expression.drop_side_effect_free(compressor, first_in_statement)
    if (!expression) return this.property.drop_side_effect_free(compressor, first_in_statement)
    var property = this.property.drop_side_effect_free(compressor)
    if (!property) return expression
    return make_sequence(this, [expression, property])
  }

  may_throw (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.may_throw(compressor) ||
          this.property.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.has_side_effects(compressor) ||
          this.property.has_side_effects(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      this.property._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.property)
    push(this.expression)
  }

  _size = () => 2
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.property = (self.property).transform(tw)
  }

  _codegen (self, output) {
    self.expression.print(output)
    output.print('[');
    (self.property).print(output)
    output.print(']')
  }

  static documentation = 'Index-style property access, i.e. `a["foo"]`'

  static PROPS = AST_PropAccess.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
