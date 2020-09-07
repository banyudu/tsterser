import AST_Node from './node'
import AST_SymbolRef from './symbol-ref'
import { OutputStream } from '../output'
import AST_PropAccess, { AST_PropAccess_Props } from './prop-access'
import Compressor from '../compressor'
import { is_lhs, make_node, best_of, make_node_from_constant, to_moz, best_of_expression, safe_to_flatten, make_sequence, is_ast_symbol_ref, is_ast_lambda, is_ast_arrow, is_ast_number, is_ast_symbol_funarg, is_ast_array, is_ast_expansion, is_ast_hole } from '../utils'
import { UNUSED, clear_flag } from '../constants'
import { is_basic_identifier_string } from '../parse'
import TreeTransformer from '../tree-transformer'
import { MozillaAst } from '../types'
import AST_Dot from './dot'

export default class AST_Sub extends AST_PropAccess {
  property: AST_Node

  _prepend_comments_check (node: AST_Node) {
    return this.expression === node
  }

  _to_mozilla_ast (parent: AST_Node): MozillaAst {
    return {
      type: 'MemberExpression',
      object: to_moz(this.expression),
      computed: true,
      property: to_moz(this.property)
    }
  }

  _optimize (compressor: Compressor): AST_Node {
    let expr = this.expression
    let prop: AST_Node = this.property
    let property: any
    if (compressor.option('properties')) {
      var key = prop.evaluate(compressor)
      if (key !== prop) {
        if (typeof key === 'string') {
          if (key == 'undefined') {
            key = undefined
          } else {
            const value = parseFloat(key)
            if (value.toString() == key) {
              key = value
            }
          }
        }
        prop = this.property = best_of_expression(prop, make_node_from_constant(key, prop).transform(compressor))
        property = '' + key
        if (is_basic_identifier_string(property) &&
                  property.length <= prop.size() + 1) {
          return (make_node('AST_Dot', this, {
            expression: expr,
            property: property,
            quote: (prop as any).quote
          }) as AST_Dot).optimize(compressor)
        }
      }
    }
    let fn
    if (compressor.option('arguments') &&
          is_ast_symbol_ref(expr) &&
          expr.name == 'arguments' &&
          expr.definition?.().orig.length == 1 &&
          is_ast_lambda((fn = expr.scope)) &&
          fn.uses_arguments &&
          !(is_ast_arrow(fn)) &&
          is_ast_number(prop)) {
      const index = prop.getValue()
      const params = new Set()
      const argnames = fn.argnames
      let shouldBreak = false
      for (let n = 0; n < argnames.length; n++) {
        if (!(is_ast_symbol_funarg(argnames[n]))) {
          shouldBreak = true
          break // destructuring parameter - bail
        }
        const param = argnames[n].name
        if (params.has(param)) {
          shouldBreak = true
          break // duplicate parameter - bail
        }
        params.add(param)
      }
      if (!shouldBreak) {
        let argname: any = fn.argnames[index]
        if (argname && compressor.has_directive('use strict')) {
          const def = argname.definition?.()
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
          const sym = make_node('AST_SymbolRef', this, argname) as AST_SymbolRef
          sym.reference()
          clear_flag(argname, UNUSED)
          return sym
        }
      }
    }
    if (is_lhs(this, compressor.parent())) return this
    if (key !== prop) {
      const sub: any = this.flatten_object(property, compressor)
      if (sub) {
        expr = this.expression = sub.expression
        prop = this.property = sub.property
      }
    }
    if (compressor.option('properties') && compressor.option('side_effects') &&
          is_ast_number(prop) && is_ast_array(expr)) {
      let index = prop.getValue()
      const elements = expr.elements
      let retValue = elements[index]
      if (safe_to_flatten(retValue, compressor)) {
        let flatten = true
        const values: any[] = []
        for (var i = elements.length; --i > index;) {
          const value = elements[i].drop_side_effect_free(compressor)
          if (value) {
            values.unshift(value)
            if (flatten && value.has_side_effects(compressor)) flatten = false
          }
        }
        if (!is_ast_expansion(retValue)) {
          retValue = is_ast_hole(retValue) ? make_node('AST_Undefined', retValue) : retValue
          if (!flatten) values.unshift(retValue)
          let shouldBreak = false
          while (--i >= 0) {
            let value = elements[i]
            if (is_ast_expansion(value)) {
              shouldBreak = true
              break
            }
            value = value.drop_side_effect_free(compressor)
            if (value) values.unshift(value)
            else index--
          }
          if (!shouldBreak) {
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
      }
    }
    let ev = this.evaluate(compressor)
    if (ev !== this) {
      ev = make_node_from_constant(ev, this).optimize(compressor)
      return best_of(compressor, ev, this)
    }
    return this
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean): AST_Node {
    const prop = this.property
    if (this.expression.may_throw_on_access(compressor)) return this
    const expression = this.expression.drop_side_effect_free(compressor, first_in_statement)
    if (!expression) return prop.drop_side_effect_free(compressor, first_in_statement)
    const property = prop.drop_side_effect_free(compressor)
    if (!property) return expression
    return make_sequence(this, [expression, property])
  }

  may_throw (compressor: Compressor) {
    const property = this.property
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.may_throw(compressor) ||
          property.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    const property = this.property
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.has_side_effects(compressor) ||
          property.has_side_effects(compressor)
  }

  walkInner (): AST_Node[] {
    const result: AST_Node[] = []
    result.push(this.expression)
    result.push(this.property)
    return result
  }

  _children_backwards (push: Function) {
    push(this.property)
    push(this.expression)
  }

  _size = () => 2
  _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
    this.property = this.property.transform(tw)
  }

  _codegen (output: OutputStream) {
    this.expression.print(output)
    output.print('[')
    this.property.print(output)
    output.print(']')
  }

  static documentation = 'Index-style property access, i.e. `a["foo"]`'

  static PROPS = AST_PropAccess.PROPS
}

export interface AST_Sub_Props extends AST_PropAccess_Props {
  property: AST_Node
}
