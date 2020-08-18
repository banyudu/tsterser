import AST_Node from './node'
import AST_Symbol from './symbol'
import TreeWalker from '../tree-walker'
import AST_SymbolFunarg from './symbol-funarg'
import AST_With from './with'
import {
  is_undeclared_ref,
  make_node,
  is_lhs,
  HOP,
  is_strict,
  is_immutable,
  has_annotation,
  walk,
  find_scope,
  is_func_expr,
  retain_top_func,
  to_node,
  make_node_from_constant,
  best_of_expression,
  safe_to_read,
  return_this,
  within_array_or_object_literal,
  recursive_ref,
  is_modified,
  ref_once,
  mark_escaped,
  scope_encloses_variables_in_this_scope
} from '../utils'
import { has_flag, set_flag, SQUEEZED, INLINED, walk_abort, pure_prop_access_globals, global_names, UNDEFINED, _NOINLINE } from '../constants'

export default class AST_SymbolRef extends AST_Symbol {
  scope: any
  thedef: any

  to_fun_args (to_fun_args, insert_default, croak, default_seen_above?: AST_Node): any {
    return insert_default(new AST_SymbolFunarg({
      name: this.name,
      start: this.start,
      end: this.end
    }))
  }

  _optimize (compressor) {
    if (!compressor.option('ie8') &&
          is_undeclared_ref(this) &&
          (!this.scope.uses_with || !compressor.find_parent(AST_With))) {
      switch (this.name) {
        case 'undefined':
          return make_node('AST_Undefined', this).optimize(compressor)
        case 'NaN':
          return make_node('AST_NaN', this).optimize(compressor)
        case 'Infinity':
          return make_node('AST_Infinity', this).optimize(compressor)
      }
    }
    var parent = compressor.parent()
    if (compressor.option('reduce_vars') && is_lhs(this, parent) !== this) {
      const def = this.definition?.()
      if (compressor.top_retain && def.global && compressor.top_retain(def)) {
        def.fixed = false
        def.should_replace = false
        def.single_use = false
        return this
      }
      var fixed = this.fixed_value()
      var single_use: any = def.single_use &&
              !(parent?.isAst?.('AST_Call') &&
                  (parent.is_expr_pure(compressor)) ||
                      has_annotation(parent, _NOINLINE))
      if (single_use && (fixed?.isAst?.('AST_Lambda') || fixed?.isAst?.('AST_Class'))) {
        if (retain_top_func(fixed, compressor)) {
          single_use = false
        } else if (def.scope !== this.scope &&
                  (def.escaped == 1 ||
                      has_flag(fixed, INLINED) ||
                      within_array_or_object_literal(compressor))) {
          single_use = false
        } else if (recursive_ref(compressor, def)) {
          single_use = false
        } else if (def.scope !== this.scope || def.orig[0]?.isAst?.('AST_SymbolFunarg')) {
          single_use = fixed.is_constant_expression(this.scope)
          if (single_use == 'f') {
            var scope = this.scope
            do {
              if (scope?.isAst?.('AST_Defun') || is_func_expr(scope)) {
                set_flag(scope, INLINED)
              }
            } while (scope = scope.parent_scope)
          }
        }
      }
      if (single_use && fixed?.isAst?.('AST_Lambda')) {
        const block_scope = find_scope(compressor)
        single_use =
                  def.scope === this.scope &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed) ||
                  parent?.isAst?.('AST_Call') &&
                      parent.expression === this &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed)
      }
      if (single_use && fixed?.isAst?.('AST_Class')) {
        const extends_inert = !fixed.extends ||
                  !fixed.extends.may_throw(compressor) &&
                      !fixed.extends.has_side_effects(compressor)
        single_use = extends_inert &&
                  !fixed.properties.some(prop =>
                    prop.may_throw(compressor) || prop.has_side_effects(compressor)
                  )
      }
      const can_pull_in = single_use && fixed
      if (can_pull_in) {
        if (fixed?.isAst?.('AST_DefClass')) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_ClassExpression', fixed, fixed)
        }
        if (fixed?.isAst?.('AST_Defun')) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_Function', fixed, fixed)
        }
        if (def.recursive_refs > 0 && fixed.name?.isAst?.('AST_SymbolDefun')) {
          const defun_def = fixed.name.definition?.()
          let lambda_def = fixed.variables.get(fixed.name.name)
          let name = lambda_def && lambda_def.orig[0]
          if (!(name?.isAst?.('AST_SymbolLambda'))) {
            name = make_node('AST_SymbolLambda', fixed.name, fixed.name)
            name.scope = fixed
            fixed.name = name
            lambda_def = fixed.def_function(name)
          }
          walk(fixed, (node: any) => {
            if (node?.isAst?.('AST_SymbolRef') && node.definition?.() === defun_def) {
              node.thedef = lambda_def
              lambda_def.references.push(node)
            }
          })
        }
        if (fixed?.isAst?.('AST_Lambda') || fixed?.isAst?.('AST_Class')) {
          find_scope(compressor).add_child_scope(fixed)
        }
        return fixed.optimize(compressor)
      }
      if (fixed && def.should_replace === undefined) {
        let init
        if (fixed?.isAst?.('AST_This')) {
          if (!(def.orig[0]?.isAst?.('AST_SymbolFunarg')) &&
                      def.references.every((ref) =>
                        def.scope === ref.scope
                      )) {
            init = fixed
          }
        } else {
          var ev = fixed.evaluate(compressor)
          if (ev !== fixed && (compressor.option('unsafe_regexp') || !(ev instanceof RegExp))) {
            init = make_node_from_constant(ev, fixed)
          }
        }
        if (init) {
          var value_length = init.optimize(compressor).size()
          var fn
          if (has_symbol_ref(fixed)) {
            fn = function () {
              var result = init.optimize(compressor)
              return result === init ? result.clone(true) : result
            }
          } else {
            value_length = Math.min(value_length, fixed.size())
            fn = function () {
              var result = best_of_expression(init.optimize(compressor), fixed)
              return result === init || result === fixed ? result.clone(true) : result
            }
          }
          var name_length = def.name.length
          var overhead = 0
          if (compressor.option('unused') && !compressor.exposed(def)) {
            overhead = (name_length + 2 + value_length) / (def.references.length - def.assignments)
          }
          def.should_replace = value_length <= name_length + overhead ? fn : false
        } else {
          def.should_replace = false
        }
      }
      if (def.should_replace) {
        return def.should_replace()
      }
    }
    return this

    function has_symbol_ref (value) {
      return walk(value, (node: any) => {
        if (node?.isAst?.('AST_SymbolRef')) return walk_abort
      })
    }
  }

  drop_side_effect_free (compressor: any) {
    const safe_access = this.is_declared(compressor) ||
          pure_prop_access_globals.has(this.name)
    return safe_access ? null : this
  }

  may_throw (compressor: any) {
    return !this.is_declared(compressor) && !pure_prop_access_globals.has(this.name)
  }

  has_side_effects (compressor: any) {
    return !this.is_declared(compressor) && !pure_prop_access_globals.has(this.name)
  }

  _eval (compressor: any, depth) {
    var fixed = this.fixed_value()
    if (!fixed) return this
    var value
    if (HOP(fixed, '_eval')) {
      value = fixed._eval(compressor)
    } else {
      this._eval = return_this
      value = fixed._eval(compressor, depth)
      delete this._eval
      if (value === fixed) return this
      fixed._eval = function () {
        return value
      }
    }
    if (value && typeof value === 'object') {
      var escaped = this.definition?.().escaped
      if (escaped && depth > escaped) return this
    }
    return value
  }

  _find_defs (compressor: any, suffix) {
    if (!this.global()) return
    var defines = compressor.option('global_defs') as AnyObject
    var name = this.name + suffix
    if (HOP(defines, name)) return to_node(defines[name], this)
  }

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    var d = this.definition?.()
    d.references.push(this)
    if (d.references.length == 1 &&
          !d.fixed &&
          d.orig[0]?.isAst?.('AST_SymbolDefun')) {
          tw.loop_ids?.set(d.id, tw.in_loop)
    }
    var fixed_value
    if (d.fixed === undefined || !safe_to_read(tw, d)) {
      d.fixed = false
    } else if (d.fixed) {
      fixed_value = this.fixed_value()
      if (
        fixed_value?.isAst?.('AST_Lambda') &&
              recursive_ref(tw, d)
      ) {
        d.recursive_refs++
      } else if (fixed_value &&
              !compressor.exposed(d) &&
              ref_once(tw, compressor, d)
      ) {
        d.single_use =
                  fixed_value?.isAst?.('AST_Lambda') && !fixed_value.pinned?.() ||
                  fixed_value?.isAst?.('AST_Class') ||
                  d.scope === this.scope && fixed_value.is_constant_expression()
      } else {
        d.single_use = false
      }
      if (is_modified(compressor, tw, this, fixed_value, 0, is_immutable(fixed_value))) {
        if (d.single_use) {
          d.single_use = 'm'
        } else {
          d.fixed = false
        }
      }
    }
    mark_escaped(tw, d, this.scope, this, fixed_value, 0, 1)
  }

  _dot_throw (compressor: any) {
    if (this.name === 'arguments') return false
    if (has_flag(this, UNDEFINED)) return true
    if (!is_strict(compressor)) return false
    if (is_undeclared_ref(this) && this.is_declared(compressor)) return false
    if (this.is_immutable()) return false
    var fixed = this.fixed_value()
    return !fixed || fixed._dot_throw(compressor)
  }

  is_declared (compressor: any) {
    return !this.definition?.().undeclared ||
          compressor.option('unsafe') && global_names.has(this.name)
  }

  is_immutable () {
    var orig = this.definition?.().orig
    return orig.length == 1 && orig[0]?.isAst?.('AST_SymbolLambda')
  }

  _size (): number {
    const { name, thedef } = this

    if (thedef && thedef.global) return name.length

    if (name === 'arguments') return 9

    return 2
  }

  static documentation = 'Reference to some symbol (not definition/declaration)'

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
