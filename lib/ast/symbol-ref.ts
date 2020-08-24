import AST_Node from './node'
import Compressor from '../compressor'
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
  scope_encloses_variables_in_this_scope, is_ast_call, is_ast_symbol_ref, is_ast_symbol_defun, is_ast_symbol_lambda, is_ast_lambda, is_ast_class, is_ast_symbol_funarg, is_ast_defun, is_ast_def_class, is_ast_this
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

  _optimize (compressor: Compressor) {
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
    const parent = compressor.parent()
    if (compressor.option('reduce_vars') && is_lhs(this, parent) !== this) {
      const def = this.definition?.()
      if (compressor.top_retain && def.global && compressor.top_retain(def)) {
        def.fixed = false
        def.should_replace = false
        def.single_use = false
        return this
      }
      let fixed = this.fixed_value()
      let single_use: any = def.single_use &&
              !(is_ast_call(parent) &&
                  (parent.is_expr_pure(compressor)) ||
                      has_annotation(parent, _NOINLINE))
      if (single_use && (is_ast_lambda(fixed) || is_ast_class(fixed))) {
        if (retain_top_func(fixed, compressor)) {
          single_use = false
        } else if (def.scope !== this.scope &&
                  (def.escaped == 1 ||
                      has_flag(fixed, INLINED) ||
                      within_array_or_object_literal(compressor))) {
          single_use = false
        } else if (recursive_ref(compressor, def)) {
          single_use = false
        } else if (def.scope !== this.scope || is_ast_symbol_funarg(def.orig[0])) {
          single_use = fixed.is_constant_expression(this.scope)
          if (single_use == 'f') {
            let scope = this.scope
            do {
              if (is_ast_defun(scope) || is_func_expr(scope)) {
                set_flag(scope, INLINED)
              }
            } while ((scope = scope.parent_scope))
          }
        }
      }
      if (single_use && is_ast_lambda(fixed)) {
        const block_scope = find_scope(compressor)
        single_use =
                  def.scope === this.scope &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed) ||
                  is_ast_call(parent) &&
                      parent.expression === this &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed)
      }
      if (single_use && is_ast_class(fixed)) {
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
        if (is_ast_def_class(fixed)) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_ClassExpression', fixed, fixed)
        }
        if (is_ast_defun(fixed)) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_Function', fixed, fixed)
        }
        if (def.recursive_refs > 0 && is_ast_symbol_defun(fixed.name)) {
          const defun_def = fixed.name.definition?.()
          let lambda_def = fixed.variables.get(fixed.name.name)
          let name = lambda_def?.orig[0]
          if (!(is_ast_symbol_lambda(name))) {
            name = make_node('AST_SymbolLambda', fixed.name, fixed.name)
            name.scope = fixed
            fixed.name = name
            lambda_def = fixed.def_function(name)
          }
          walk(fixed, (node: any) => {
            if (is_ast_symbol_ref(node) && node.definition?.() === defun_def) {
              node.thedef = lambda_def
              lambda_def.references.push(node)
            }
          })
        }
        if (is_ast_lambda(fixed) || is_ast_class(fixed)) {
          find_scope(compressor).add_child_scope(fixed)
        }
        return fixed.optimize(compressor)
      }
      if (fixed && def.should_replace === undefined) {
        let init
        if (is_ast_this(fixed)) {
          if (!(is_ast_symbol_funarg(def.orig[0])) &&
                      def.references.every((ref) =>
                        def.scope === ref.scope
                      )) {
            init = fixed
          }
        } else {
          const ev = fixed.evaluate(compressor)
          if (ev !== fixed && (compressor.option('unsafe_regexp') || !(ev instanceof RegExp))) {
            init = make_node_from_constant(ev, fixed)
          }
        }
        if (init) {
          let value_length = init.optimize(compressor).size()
          let fn
          if (has_symbol_ref(fixed)) {
            fn = function () {
              const result = init.optimize(compressor)
              return result === init ? result.clone(true) : result
            }
          } else {
            value_length = Math.min(value_length, fixed.size())
            fn = function () {
              const result = best_of_expression(init.optimize(compressor), fixed)
              return result === init || result === fixed ? result.clone(true) : result
            }
          }
          const name_length = def.name.length
          let overhead = 0
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
        if (is_ast_symbol_ref(node)) return walk_abort
      })
    }
  }

  drop_side_effect_free (compressor: Compressor) {
    const safe_access = this.is_declared(compressor) ||
          pure_prop_access_globals.has(this.name)
    return safe_access ? null : this
  }

  may_throw (compressor: Compressor) {
    return !this.is_declared(compressor) && !pure_prop_access_globals.has(this.name)
  }

  has_side_effects (compressor: Compressor) {
    return !this.is_declared(compressor) && !pure_prop_access_globals.has(this.name)
  }

  _eval (compressor: Compressor, depth) {
    const fixed = this.fixed_value()
    if (!fixed) return this
    let value
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
      const escaped = this.definition?.().escaped
      if (escaped && depth > escaped) return this
    }
    return value
  }

  _find_defs (compressor: Compressor, suffix) {
    if (!this.global()) return
    const defines = compressor.option('global_defs') as AnyObject
    const name = this.name + suffix
    if (HOP(defines, name)) return to_node(defines[name], this)
  }

  reduce_vars (tw: TreeWalker, descend, compressor: Compressor) {
    const d = this.definition?.()
    d.references.push(this)
    if (d.references.length == 1 &&
          !d.fixed &&
          is_ast_symbol_defun(d.orig[0])) {
          tw.loop_ids?.set(d.id, tw.in_loop)
    }
    let fixed_value
    if (d.fixed === undefined || !safe_to_read(tw, d)) {
      d.fixed = false
    } else if (d.fixed) {
      fixed_value = this.fixed_value()
      if (
        is_ast_lambda(fixed_value) &&
              recursive_ref(tw, d)
      ) {
        d.recursive_refs++
      } else if (fixed_value &&
              !compressor.exposed(d) &&
              ref_once(tw, compressor, d)
      ) {
        d.single_use =
                  is_ast_lambda(fixed_value) && !fixed_value.pinned?.() ||
                  is_ast_class(fixed_value) ||
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

  _dot_throw (compressor: Compressor) {
    if (this.name === 'arguments') return false
    if (has_flag(this, UNDEFINED)) return true
    if (!is_strict(compressor)) return false
    if (is_undeclared_ref(this) && this.is_declared(compressor)) return false
    if (this.is_immutable()) return false
    const fixed = this.fixed_value()
    return !fixed || fixed._dot_throw(compressor)
  }

  is_declared (compressor: Compressor) {
    return !this.definition?.().undeclared ||
          compressor.option('unsafe') && global_names.has(this.name)
  }

  is_immutable () {
    const orig = this.definition?.().orig
    return orig.length == 1 && is_ast_symbol_lambda(orig[0])
  }

  _size (): number {
    const { name, thedef } = this

    if (thedef?.global) return name.length

    if (name === 'arguments') return 9

    return 2
  }

  static documentation = 'Reference to some symbol (not definition/declaration)'

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
