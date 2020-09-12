import AST_Node from './node'
import AST_Statement, { AST_Statement_Props } from './statement'
import Compressor from '../compressor'
import TreeWalker from '../tree-walker'
import AST_VarDef from './var-def'
import SymbolDef from '../symbol-def'
import AST_SymbolConst from './symbol-const'
import AST_SymbolLet from './symbol-let'
import AST_SimpleStatement from './simple-statement'
import AST_Symbol from './symbol'
import AST_Binary from './binary'
import AST_Var from './var'
import AST_Sequence from './sequence'

import {
  anySideEffect,
  anyMayThrow,
  is_identifier_atom,
  reset_block_variables,
  list_overhead,
  is_ast_node,
  is_ast_try,
  is_ast_symbol_defun,
  is_ast_arrow,
  is_ast_dot,
  as_statement_array,
  is_ast_sub,
  remove,
  can_be_evicted_from_block,
  is_modified,
  is_ast_block_statement,
  is_ast_continue,
  is_ast_break,
  extract_declarations_from_unreachable_code,
  is_ast_lambda,
  maintain_this_binding,
  is_ast_return,
  to_moz,
  is_ast_unary_prefix,
  is_ast_empty_statement,
  is_ast_directive,
  is_ast_symbol_const,
  member,
  is_ast_object,
  is_ast_symbol_funarg,
  is_ref_of,
  is_func_expr,
  is_ast_symbol_declaration,
  is_ast_let,
  is_ast_this,
  is_ast_var,
  is_ast_defun,
  is_ast_const,
  merge_sequence,
  make_sequence,
  walk,
  is_ast_simple_statement,
  is_ast_export,
  is_lhs_read_only,
  is_ast_for_in,
  is_ast_default,
  is_ast_d_w_loop,
  is_ast_definitions,
  is_ast_exit,
  is_ast_iteration_statement,
  is_ast_sequence,
  is_ast_case,
  is_ast_unary,
  is_ast_switch,
  has_annotation,
  is_ast_var_def,
  is_ast_block,
  is_ast_call,
  is_ast_unary_postfix,
  make_node,
  is_ast_prop_access,
  is_lhs,
  is_ast_debugger,
  is_ast_destructuring,
  is_ast_expansion,
  is_ast_symbol,
  is_ast_conditional,
  is_ast_if,
  is_ast_for,
  is_ast_with,
  is_ast_yield,
  is_ast_await,
  is_ast_class,
  is_ast_binary,
  is_ast_loop_control,
  is_ast_symbol_ref,
  is_ast_assign,
  aborts,
  MAP,
  is_ast_scope,
  is_ast_finally,
  is_ast_catch,
  do_list
} from '../utils'
import TreeTransformer from '../tree-transformer'
import AST_Scope from './scope'
import {
  WRITE_ONLY,
  unary_side_effects,
  pure_prop_access_globals,
  _NOINLINE,
  lazy_op,
  walk_abort,
  clear_flag
} from '../constants'

export default class AST_Block extends AST_Statement {
  body: AST_Statement[]
  block_scope?: AST_Scope
  expression: any
  CHANGED: boolean = false
  private compressor_scope: AST_Scope | undefined
  private in_loop: boolean = false
  private in_try: boolean = false

  protected _block_aborts () {
    for (let i = 0; i < this.body.length; i++) {
      if (aborts(this.body[i])) {
        return this.body[i]
      }
    }
    return null
  }

  _optimize (compressor: Compressor): AST_Block {
    this.tighten_body(compressor)
    return this
  }

  may_throw (compressor: Compressor) {
    return anyMayThrow(this.body, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.body, compressor)
  }

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
  }

  is_block_scope () { return true }
  walkInner (): AST_Node[] {
    const result: AST_Node[] = []
    result.push(...this.body)
    return result
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
  }

  _size (info: any) {
    return 2 + list_overhead(this.body)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    this.body = do_list(this.body, tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
  }

  private has_overlapping_symbol (fn: AST_Scope, arg: AST_Node, fn_strict: boolean) {
    let found = false; let scan_this = !(is_ast_arrow(fn))
    arg.walk(new TreeWalker((node: AST_Node, descend) => {
      if (found) return true
      if (is_ast_symbol_ref(node) && (fn.variables.has(node.name) || redefined_within_scope(node.definition?.(), fn))) {
        let s = node.definition?.().scope
        if (s !== this.compressor_scope) {
          while ((s = s.parent_scope)) {
            if (s === this.compressor_scope) return true
          }
        }
        return (found = true)
      }
      if ((fn_strict || scan_this) && is_ast_this(node)) {
        return (found = true)
      }
      if (is_ast_scope(node) && !(is_ast_arrow(node))) {
        const prev = scan_this
        scan_this = false
        descend()
        scan_this = prev
        return true
      }
    }))
    return found
  }

  // Search from right to left for assignment-like expressions:
  // - `var a = x;`
  // - `a = x;`
  // - `++a`
  // For each candidate, scan from left to right for first usage, then try
  // to fold assignment into the site for compression.
  // Will not attempt to collapse assignments into or past code blocks
  // which are not sequentially executed, e.g. loops and conditionals.
  private collapse (compressor: Compressor) {
    if (this.compressor_scope?.pinned()) return this.body
    let args = null
    const candidates: any[] = []
    let stat_index = this.body.length

    const extract_args = () => {
      const fn = compressor.self()
      const iife = compressor.parent()
      if (is_func_expr(fn) && !fn.name && !fn.uses_arguments && !fn.pinned() && is_ast_call(iife) && iife.expression === fn && iife.args.every((arg) => !(is_ast_expansion(arg)))) {
        let fn_strict = compressor.has_directive('use strict')
        if (fn_strict && !member(fn_strict, fn.body)) fn_strict = false
        const len = fn.argnames.length
        args = iife.args.slice(len)
        const names = new Set()
        for (let i = len; --i >= 0;) {
          const sym = fn.argnames[i]
          let arg: any = iife.args[i]
          // The following two line fix is a duplicate of the fix at
          // https://github.com/terser/terser/commit/011d3eb08cefe6922c7d1bdfa113fc4aeaca1b75
          // This might mean that these two pieces of code (one here in collapse_vars and another in reduce_vars
          // Might be doing the exact same thing.
          const def = (sym as any).definition?.()
          const is_reassigned = def && def.orig.length > 1
          if (is_reassigned) continue
          args.unshift(make_node('AST_VarDef', sym, {
            name: sym,
            value: arg
          }))
          if (names.has(sym.name)) continue
          names.add(sym.name)
          if (is_ast_expansion(sym)) {
            const elements = iife.args.slice(i)
            if (elements.every((arg) =>
              !this.has_overlapping_symbol(fn as any, arg, fn_strict)
            )) {
              candidates.unshift([make_node('AST_VarDef', sym, {
                name: sym.expression,
                value: make_node('AST_Array', iife, {
                  elements: elements
                })
              })])
            }
          } else {
            if (!arg) {
              arg = make_node('AST_Undefined', sym).transform(compressor)
            } else if (is_ast_lambda(arg) && arg.pinned?.() || this.has_overlapping_symbol(fn as any, arg, fn_strict)) {
              arg = null
            }
            if (arg) {
              candidates.unshift([make_node('AST_VarDef', sym, { name: sym, value: arg })])
            }
          }
        }
      }
    }

    const may_modify = (sym: AST_Symbol) => {
      if (!sym.definition) return true // AST_Destructuring
      const def = sym.definition?.()
      if (def.orig.length == 1 && is_ast_symbol_defun(def.orig[0])) return false
      if (def.scope.get_defun_scope() !== this.compressor_scope) return true
      return !def.references.every((ref) => {
        let s = ref.scope.get_defun_scope()
        // "block" scope within AST_Catch
        if (s.TYPE == 'Scope') s = s.parent_scope
        return s === this.compressor_scope
      })
    }

    const side_effects_external = (node: AST_Node, lhs?: boolean): boolean => {
      if (is_ast_assign(node)) return side_effects_external(node.left, true)
      if (is_ast_unary(node)) return side_effects_external(node.expression, true)
      if (is_ast_var_def(node)) return !!node.value && side_effects_external(node.value)
      if (lhs) {
        if (is_ast_dot(node)) return side_effects_external(node.expression, true)
        if (is_ast_sub(node)) return side_effects_external(node.expression, true)
        if (is_ast_symbol_ref(node)) return node.definition?.().scope !== this.compressor_scope
      }
      return false
    }

    const scanner = new TreeTransformer((node: AST_Node) => {
      if (abort) return node
      // Skip nodes before `candidate` as quickly as possible
      if (!hit) {
        if (node !== hit_stack[hit_index]) return node
        hit_index++
        if (hit_index < hit_stack.length) return handle_custom_scan_order(node)
        hit = true
        stop_after = find_stop(node, 0)
        if (stop_after === node) abort = true
        return node
      }
      // Stop immediately if these node types are encountered
      const parent = scanner.parent()
      if (is_ast_assign(node) && node.operator != '=' && lhs.equivalent_to(node.left) ||
        is_ast_call(node) && is_ast_prop_access(lhs) && lhs.equivalent_to(node.expression) ||
        is_ast_debugger(node) ||
        is_ast_destructuring(node) ||
        is_ast_expansion(node) && is_ast_symbol(node.expression) && node.expression.definition?.().references.length > 1 ||
        is_ast_iteration_statement(node) && !(is_ast_for(node)) ||
        is_ast_loop_control(node) ||
        is_ast_try(node) ||
        is_ast_with(node) ||
        is_ast_yield(node) ||
        is_ast_export(node) ||
        is_ast_class(node) ||
        is_ast_for(parent) && node !== parent.init ||
        !replace_all && (is_ast_symbol_ref(node) && !node.is_declared(compressor) && !pure_prop_access_globals.has(node as any)) ||
        is_ast_await(node as any) ||
        is_ast_symbol_ref(node) && is_ast_call(parent) && has_annotation(parent, _NOINLINE)
      ) {
        abort = true
        return node
      }
      // Stop only if candidate is found within conditional branches
      if (!stop_if_hit && (!lhs_local || !replace_all) &&
                (is_ast_binary(parent) && lazy_op.has(parent.operator) && parent.left !== node ||
                    is_ast_conditional(parent) && parent.condition !== node ||
                    is_ast_if(parent) && parent.condition !== node)) {
        stop_if_hit = parent
      }
      // Replace variable with assignment when found
      if (can_replace &&
                !(is_ast_symbol_declaration(node)) &&
                lhs?.equivalent_to(node)
      ) {
        if (stop_if_hit) {
          abort = true
          return node
        }
        if (is_lhs(node, parent)) {
          if (value_def) replaced++
          return node
        } else {
          replaced++
          if (value_def && is_ast_var_def(candidate)) return node
        }
        this.CHANGED = abort = true
        compressor.info('Collapsing {name} [{file}:{line},{col}]', {
          name: node.print_to_string(),
          file: node.start.file,
          line: node.start.line,
          col: node.start.col
        })
        if (is_ast_unary_postfix(candidate)) {
          return make_node('AST_UnaryPrefix', candidate, candidate)
        }
        if (is_ast_var_def(candidate)) {
          const def = (candidate.name as any).definition?.()
          const value = candidate.value
          if (def.references.length - def.replaced == 1 && !compressor.exposed(def)) {
            def.replaced++
            if (funarg && is_identifier_atom(value)) {
              return value?.transform(compressor)
            } else {
              return maintain_this_binding(parent, node, value)
            }
          }
          return make_node('AST_Assign', candidate, {
            operator: '=',
            left: make_node('AST_SymbolRef', candidate.name, candidate.name),
            right: value
          })
        }
        clear_flag(candidate, WRITE_ONLY)
        return candidate
      }
      // These node types have child nodes that execute sequentially,
      // but are otherwise not safe to scan into or beyond them.
      let sym
      if (is_ast_call(node) ||
        is_ast_exit(node) && (side_effects || is_ast_prop_access(lhs) || may_modify(lhs)) ||
        is_ast_prop_access(node) && (side_effects || node.expression.may_throw_on_access(compressor)) ||
        is_ast_symbol_ref(node) && (lvalues.get(node.name) || side_effects && may_modify(node)) ||
        is_ast_var_def(node) && node.value && (lvalues.has(node.name.name) || side_effects && may_modify(node.name as any)) ||
        (sym = is_lhs(node.left, node)) && (is_ast_prop_access(sym) || lvalues.has(sym.name)) ||
        may_throw && (this.in_try ? node.has_side_effects(compressor) : side_effects_external(node))) {
        stop_after = node
        if (is_ast_scope(node)) abort = true
      }
      return handle_custom_scan_order(node)
    }, function (node: AST_Node) {
      if (abort) return
      if (stop_after === node) abort = true
      if (stop_if_hit === node) stop_if_hit = null
    })
    const multi_replacer = new TreeTransformer(function (node: AST_Node) {
      if (abort) return node
      // Skip nodes before `candidate` as quickly as possible
      if (!hit) {
        if (node !== hit_stack[hit_index]) return node
        hit_index++
        if (hit_index < hit_stack.length) return
        hit = true
        return node
      }
      // Replace variable when found
      if (is_ast_symbol_ref(node) &&
                node.name == def.name) {
        if (!--replaced) abort = true
        if (is_lhs(node, multi_replacer.parent())) return node
        def.replaced++
        value_def.replaced--
        return candidate.value
      }
      // Skip (non-executed) functions and (leading) default case in switch statements
      if (is_ast_default(node) || is_ast_scope(node)) return node
    })
    const is_lhs_local = (lhs: AST_Node) => {
      while (is_ast_prop_access(lhs)) lhs = lhs.expression
      return is_ast_symbol_ref(lhs) && lhs.definition?.().scope === this.compressor_scope && !(this.in_loop && (lvalues.has(lhs.name) || is_ast_unary(candidate) || is_ast_assign(candidate) && candidate.operator != '='))
    }
    let hit_stack: any[]
    let candidate: any
    let stop_after: any
    let stop_if_hit: any
    let hit_index: number = 0
    let replace_all: any
    let lhs_local: any
    let side_effects: any
    let may_throw: any
    let abort: any
    let funarg: any
    let hit: any
    let lhs: any
    let can_replace: any
    let value_def: any
    let replaced: any
    let lvalues: any
    let def: any

    while (--stat_index >= 0) {
      // Treat parameters as collapsible in IIFE, i.e.
      //   function(a, b){ ... }(x());
      // would be translated into equivalent assignments:
      //   var a = x(), b = undefined;
      if (stat_index == 0 && compressor.option('unused')) extract_args()
      // Find collapsible assignments
      hit_stack = []
      extract_candidates(this.body[stat_index])
      while (candidates.length > 0) {
        hit_stack = candidates.pop()
        hit_index = 0
        candidate = hit_stack[hit_stack.length - 1]
        value_def = null
        stop_after = null
        stop_if_hit = null
        lhs = get_lhs(candidate)
        if (!lhs || is_lhs_read_only(lhs) || lhs.has_side_effects(compressor)) continue
        // Locate symbols which may execute code outside of scanning range
        lvalues = get_lvalues(candidate)
        lhs_local = is_lhs_local(lhs)
        if (is_ast_symbol_ref(lhs)) lvalues.set(lhs.name, false)
        side_effects = value_has_side_effects(candidate)
        replace_all = replace_all_symbols()
        may_throw = candidate.may_throw(compressor)
        funarg = is_ast_symbol_funarg(candidate.name)
        hit = funarg
        abort = false
        replaced = 0
        can_replace = !args || !hit
        if (!can_replace && args) {
          if (!abort) {
            for (let j = (compressor.self() as any).argnames.lastIndexOf(candidate.name) + 1; j < args.length; j++) {
              args[j].transform(scanner)
            }
          }
          can_replace = true
        }
        if (!abort) {
          for (let i = stat_index; i < this.body.length; i++) {
            this.body[i].transform(scanner)
          }
        }
        if (value_def) {
          def = candidate.name.definition?.()
          if (abort && def.references.length - def.replaced > replaced) replaced = false
          else {
            abort = false
            hit_index = 0
            hit = funarg
            if (!abort) {
              for (let i = stat_index; i < this.body.length; i++) {
                this.body[i].transform(multi_replacer)
              }
            }
            value_def.single_use = false
          }
        }
        if (replaced && !remove_candidate(compressor, candidate, this.body[stat_index])) this.body.splice(stat_index, 1)
      }
    }

    function handle_custom_scan_order (node: AST_Node) {
      // Skip (non-executed) functions
      if (is_ast_scope(node)) return node

      // Scan case expressions first in a switch statement
      if (is_ast_switch(node)) {
        node.expression = node.expression.transform(scanner)
        if (!abort) {
          for (let i = 0, len = node.body.length; i < len; i++) {
            const branch = node.body[i]
            if (is_ast_case(branch)) {
              if (!hit) {
                if (branch !== hit_stack[hit_index]) continue
                hit_index++
              }
              branch.expression = branch.expression.transform(scanner)
              if (!replace_all) break
            }
          }
        }
        abort = true
        return node
      }
    }

    function extract_candidates (expr: AST_Node) {
      hit_stack.push(expr)
      if (is_ast_assign(expr)) {
        if (!expr.left.has_side_effects(compressor)) {
          candidates.push(hit_stack.slice())
        }
        extract_candidates(expr.right)
      } else if (is_ast_binary(expr)) {
        extract_candidates(expr.left)
        extract_candidates(expr.right)
      } else if (is_ast_call(expr) && !has_annotation(expr, _NOINLINE)) {
        extract_candidates(expr.expression)
        expr.args.forEach(extract_candidates)
      } else if (is_ast_case(expr)) {
        extract_candidates(expr.expression)
      } else if (is_ast_conditional(expr)) {
        extract_candidates(expr.condition)
        extract_candidates(expr.consequent)
        extract_candidates(expr.alternative)
      } else if (is_ast_definitions(expr)) {
        const len = expr.definitions.length
        // limit number of trailing variable definitions for consideration
        let i = len - 200
        if (i < 0) i = 0
        for (; i < len; i++) {
          extract_candidates(expr.definitions[i])
        }
      } else if (is_ast_d_w_loop(expr)) {
        extract_candidates(expr.condition)
        if (!(is_ast_block(expr.body))) {
          extract_candidates(expr.body)
        }
      } else if (is_ast_exit(expr)) {
        if (expr.value) extract_candidates(expr.value)
      } else if (is_ast_for(expr)) {
        if (expr.init) extract_candidates(expr.init)
        if (expr.condition) extract_candidates(expr.condition)
        if (expr.step) extract_candidates(expr.step)
        if (!(is_ast_block(expr.body))) {
          extract_candidates(expr.body)
        }
      } else if (is_ast_for_in(expr)) {
        extract_candidates(expr.object)
        if (!(is_ast_block(expr.body))) {
          extract_candidates(expr.body)
        }
      } else if (is_ast_if(expr)) {
        extract_candidates(expr.condition)
        if (!(is_ast_block(expr.body))) {
          extract_candidates(expr.body)
        }
        if (expr.alternative && !(is_ast_block(expr.alternative))) {
          extract_candidates(expr.alternative)
        }
      } else if (is_ast_sequence(expr)) {
        expr.expressions.forEach(extract_candidates)
      } else if (is_ast_simple_statement(expr)) {
        extract_candidates(expr.body)
      } else if (is_ast_switch(expr)) {
        extract_candidates(expr.expression)
        expr.body.forEach(extract_candidates)
      } else if (is_ast_unary(expr)) {
        if (expr.operator == '++' || expr.operator == '--') {
          candidates.push(hit_stack.slice())
        }
      } else if (is_ast_var_def(expr)) {
        if (expr.value) {
          candidates.push(hit_stack.slice())
          extract_candidates(expr.value)
        }
      }
      hit_stack.pop()
    }

    function find_stop (node: AST_Node, level: number, write_only?: boolean): AST_Node | null {
      const parent = scanner.parent(level)
      if (is_ast_assign(parent)) {
        if (write_only && !(is_ast_prop_access(parent.left) || lvalues.has((parent.left as any).name))) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (is_ast_binary(parent)) {
        if (write_only && (!lazy_op.has(parent.operator) || parent.left === node)) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (is_ast_call(parent)) return node
      if (is_ast_case(parent)) return node
      if (is_ast_conditional(parent)) {
        if (write_only && parent.condition === node) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (is_ast_definitions(parent)) {
        return find_stop(parent, level + 1, true)
      }
      if (is_ast_exit(parent)) {
        return write_only ? find_stop(parent, level + 1, write_only) : node
      }
      if (is_ast_if(parent)) {
        if (write_only && parent.condition === node) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (is_ast_iteration_statement(parent)) return node
      if (is_ast_sequence(parent)) {
        return find_stop(parent, level + 1, parent.tail_node() !== node)
      }
      if (is_ast_simple_statement(parent)) {
        return find_stop(parent, level + 1, true)
      }
      if (is_ast_switch(parent)) return node
      if (is_ast_var_def(parent)) return node
      return null
    }

    function mangleable_var (var_def: AST_VarDef) {
      const value = var_def.value
      if (!(is_ast_symbol_ref(value))) return
      if (value.name == 'arguments') return
      const def = value.definition?.()
      if (def.undeclared) return
      return (value_def = def)
    }

    function get_lhs (expr: AST_Node): AST_Node | undefined | false {
      if (is_ast_var_def(expr) && is_ast_symbol_declaration(expr.name)) {
        const def = expr.name.definition?.()
        if (!member(expr.name, def.orig)) return
        const referenced = def.references.length - def.replaced
        if (!referenced) return
        const declared = def.orig.length - def.eliminated
        if (declared > 1 && !(is_ast_symbol_funarg(expr.name)) || (referenced > 1 ? mangleable_var(expr) : !compressor.exposed(def))) {
          return make_node('AST_SymbolRef', expr.name, expr.name)
        }
      } else {
        const lhs = expr[is_ast_assign(expr) ? 'left' : 'expression']
        return !is_ref_of(lhs, AST_SymbolConst) && !is_ref_of(lhs, AST_SymbolLet) && lhs
      }
      return undefined
    }

    function get_rvalue (expr: AST_Node) {
      return expr[is_ast_assign(expr) ? 'right' : 'value']
    }

    function get_lvalues (expr: AST_Node) {
      const lvalues = new Map()
      if (is_ast_unary(expr)) return lvalues
      const tw = new TreeWalker(function (node: AST_Node) {
        let sym = node
        while (is_ast_prop_access(sym)) sym = sym.expression
        if (is_ast_symbol_ref(sym) || is_ast_this(sym)) {
          lvalues.set(sym.name, lvalues.get(sym.name) || is_modified(compressor, tw, node, node, 0))
        }
      })
      get_rvalue(expr).walk(tw)
      return lvalues
    }

    function value_has_side_effects (expr: AST_Node) {
      if (is_ast_unary(expr)) return unary_side_effects.has(expr.operator)
      return get_rvalue(expr).has_side_effects(compressor)
    }

    function replace_all_symbols () {
      if (side_effects) return false
      if (value_def) return true
      if (is_ast_symbol_ref(lhs)) {
        const def = lhs.definition?.()
        if (def.references.length - def.replaced == (is_ast_var_def(candidate) ? 1 : 2)) {
          return true
        }
      }
      return false
    }
  }

  private find_loop_scope_try (compressor: Compressor) {
    this.compressor_scope = compressor.find_parent(AST_Scope)?.get_defun_scope()
    let node = compressor.self(); let level = 0
    do {
      if (is_ast_catch(node) || is_ast_finally(node)) {
        level++
      } else if (is_ast_iteration_statement(node)) {
        this.in_loop = true
      } else if (is_ast_scope(node)) {
        this.compressor_scope = node
        break
      } else if (is_ast_try(node)) {
        this.in_try = true
      }
    } while ((node = compressor.parent(level++)))
  }

  private eliminate_spurious_blocks (statements: AST_Statement[]) {
    const seen_dirs: any[] = []
    for (let i = 0; i < statements.length;) {
      const stat = statements[i]
      if (is_ast_block_statement(stat) && stat.body.every(can_be_evicted_from_block)) {
        this.CHANGED = true
        this.eliminate_spurious_blocks(stat.body)
        statements.splice(i, 1, ...stat.body)
        i += stat.body.length
      } else if (is_ast_empty_statement(stat)) {
        this.CHANGED = true
        statements.splice(i, 1)
      } else if (is_ast_directive(stat)) {
        if (!seen_dirs.includes(stat.value)) {
          i++
          seen_dirs.push(stat.value)
        } else {
          this.CHANGED = true
          statements.splice(i, 1)
        }
      } else i++
    }
  }

  private handle_if_return (compressor: Compressor) {
    const self = compressor.self()
    const in_lambda = is_ast_lambda(self)
    const multiple_if_returns = has_multiple_if_returns(this.body)
    for (let i = this.body.length; --i >= 0;) {
      let stat: any = this.body[i]
      const j = this.next_index(i)
      const next = this.body[j]

      if (in_lambda && !next && is_ast_return(stat)) {
        if (!stat.value) {
          this.CHANGED = true
          this.body.splice(i, 1)
          continue
        }
        if (is_ast_unary_prefix(stat.value) && stat.value.operator == 'void') {
          this.CHANGED = true
          this.body[i] = make_node('AST_SimpleStatement', stat, {
            body: stat.value.expression
          }) as AST_SimpleStatement
          continue
        }
      }

      let body: any
      if (is_ast_if(stat)) {
        let ab = aborts(stat.body)
        if (this.can_merge_flow(ab, compressor, i)) {
          if (ab.label) {
            remove(ab.label.thedef.references, ab)
          }
          this.CHANGED = true
          stat = stat.clone()
          stat.condition = stat.condition.negate(compressor)
          body = as_statement_array_with_return(stat.body, ab)
          stat.body = make_node('AST_BlockStatement', stat, {
            body: as_statement_array(stat.alternative).concat(this.extract_functions(i))
          })
          stat.alternative = make_node('AST_BlockStatement', stat, {
            body: body
          })
          this.body[i] = stat.transform(compressor)
          continue
        }

        ab = aborts(stat.alternative)
        if (this.can_merge_flow(ab, compressor, i)) {
          if (ab.label) {
            remove(ab.label.thedef.references, ab)
          }
          this.CHANGED = true
          stat = stat.clone()
          stat.body = make_node('AST_BlockStatement', stat.body, {
            body: as_statement_array(stat.body).concat(this.extract_functions(i))
          })
          body = as_statement_array_with_return(stat.alternative, ab)
          stat.alternative = make_node('AST_BlockStatement', stat.alternative, {
            body: body
          })
          this.body[i] = stat.transform(compressor)
          continue
        }
      }

      if (is_ast_if(stat) && is_ast_return(stat.body)) {
        const value = stat.body.value
        // ---
        // pretty silly case, but:
        // if (foo()) return; return; ==> foo(); return;
        if (!value && !stat.alternative && (in_lambda && !next || is_ast_return(next) && !next.value)) {
          this.CHANGED = true
          this.body[i] = make_node('AST_SimpleStatement', stat.condition, {
            body: stat.condition
          }) as AST_SimpleStatement
          continue
        }
        // ---
        // if (foo()) return x; return y; ==> return foo() ? x : y;
        if (value && !stat.alternative && is_ast_return(next) && next.value) {
          this.CHANGED = true
          stat = stat.clone()
          stat.alternative = next
          this.body[i] = stat.transform(compressor)
          this.body.splice(j, 1)
          continue
        }
        // ---
        // if (foo()) return x; [ return ; ] ==> return foo() ? x : undefined;
        if (value && !stat.alternative && (!next && in_lambda && multiple_if_returns || is_ast_return(next))) {
          this.CHANGED = true
          stat = stat.clone()
          stat.alternative = next || make_node('AST_Return', stat, {
            value: null
          })
          this.body[i] = stat.transform(compressor)
          if (next) this.body.splice(j, 1)
          continue
        }
        // ---
        // if (a) return b; if (c) return d; e; ==> return a ? b : c ? d : void e;
        //
        // if sequences is not enabled, this can lead to an endless loop (issue #866).
        // however, with sequences on this helps producing slightly better output for
        // the example code.
        const prev = this.body[this.prev_index(i)]
        if (compressor.option('sequences') && in_lambda && !stat.alternative && is_ast_if(prev) && is_ast_return(prev.body) && this.next_index(j) == this.body.length && is_ast_simple_statement(next)) {
          this.CHANGED = true
          stat = stat.clone()
          stat.alternative = make_node('AST_BlockStatement', next, {
            body: [
              next,
              make_node('AST_Return', next, {
                value: null
              })
            ]
          })
          this.body[i] = stat.transform(compressor)
          this.body.splice(j, 1)
          continue
        }
      }
    }
  }

  can_merge_flow (ab: AST_Node, compressor: Compressor, i: number) {
    const self = compressor.self()
    const in_lambda = is_ast_lambda(self)
    if (!ab) return false
    for (let j = i + 1, len = this.body.length; j < len; j++) {
      const stat = this.body[j]
      if (is_ast_const(stat) || is_ast_let(stat)) return false
    }
    const lct = is_ast_loop_control(ab) ? compressor.loopcontrol_target(ab) : null
    return is_ast_return(ab) && in_lambda && is_return_void(ab.value) ||
              is_ast_continue(ab) && self === loop_body(lct) ||
              is_ast_break(ab) && is_ast_block_statement(lct) && self === lct
  }

  private extract_functions (i: number) {
    const tail = this.body.slice(i + 1)
    this.body.length = i + 1
    return tail.filter((stat) => {
      if (is_ast_defun(stat)) {
        this.body.push(stat)
        return false
      }
      return true
    })
  }

  private next_index (i: number) {
    let j: number = i + 1
    const len = this.body.length
    for (; j < len; j++) {
      const stat = this.body[j]
      if (!(is_ast_var(stat) && declarations_only(stat))) {
        break
      }
    }
    return j
  }

  private prev_index (i: number) {
    let j = i
    for (; --j >= 0;) {
      const stat = this.body[j]
      if (!(is_ast_var(stat) && declarations_only(stat))) {
        break
      }
    }
    return j
  }

  private eliminate_dead_code (statements: AST_Statement[], compressor: Compressor) {
    let has_quit: AST_Statement[] = []
    const self = compressor.self()
    let i = 0
    let n = 0
    const len = statements.length
    for (; i < len; i++) {
      const stat = statements[i]
      if (is_ast_loop_control(stat)) {
        const lct = compressor.loopcontrol_target(stat)
        if (is_ast_break(stat) && !(is_ast_iteration_statement(lct)) && loop_body(lct) === self ||
            is_ast_continue(stat) && loop_body(lct) === self) {
          if (stat.label) {
            remove<any>(stat.label.thedef.references, stat)
          }
        } else {
          statements[n++] = stat
        }
      } else {
        statements[n++] = stat
      }
      if (aborts(stat)) {
        has_quit = statements.slice(i + 1)
        break
      }
    }
    statements.length = n
    this.CHANGED = n != len
    if (has_quit) {
      has_quit.forEach(function (stat: AST_Statement) {
        extract_declarations_from_unreachable_code(compressor, stat, statements)
      })
    }
  }

  private sequencesize (compressor: Compressor) {
    if (this.body.length < 2) return
    let seq: any[] = []; let n = 0
    const push_seq = () => {
      if (!seq.length) return
      const body = make_sequence(seq[0], seq)
      this.body[n++] = make_node('AST_SimpleStatement', body, { body: body }) as AST_SimpleStatement
      seq = []
    }
    let i = 0
    const len = this.body.length
    for (; i < len; i++) {
      const stat = this.body[i]
      if (is_ast_simple_statement(stat)) {
        if (seq.length >= compressor.sequences_limit) push_seq()
        let body = stat.body
        if (seq.length > 0) body = body.drop_side_effect_free(compressor)
        if (body) merge_sequence(seq, body)
      } else if (is_ast_definitions(stat) && declarations_only(stat) ||
                is_ast_defun(stat)) {
        this.body[n++] = stat
      } else {
        push_seq()
        this.body[n++] = stat
      }
    }
    push_seq()
    this.body.length = n
    if (n != len) this.CHANGED = true
  }

  private sequencesize_2 (compressor: Compressor) {
    let n = 0
    const cons_seq = (right: AST_Node) => {
      n--
      this.CHANGED = true
      const left = prev?.body
      return make_sequence(left, [left, right])?.transform(compressor)
    }
    let prev: AST_Node | null = null
    for (let i = 0; i < this.body.length; i++) {
      const stat = this.body[i]
      if (prev) {
        if (is_ast_exit(stat)) {
          stat.value = cons_seq(stat.value || make_node('AST_Undefined', stat).transform(compressor))
        } else if (is_ast_for(stat)) {
          if (!(is_ast_definitions(stat.init))) {
            const abort = walk(prev.body, (node: AST_Node) => {
              if (is_ast_scope(node)) return true
              if (
                is_ast_binary(node) &&
                                node.operator === 'in'
              ) {
                return walk_abort
              }
            })
            if (!abort) {
              if (stat.init) stat.init = cons_seq(stat.init)
              else {
                stat.init = prev.body
                n--
                this.CHANGED = true
              }
            }
          }
        } else if (is_ast_for_in(stat)) {
          if (!(is_ast_const(stat.init)) && !(is_ast_let(stat.init))) {
            stat.object = cons_seq(stat.object)
          }
        } else if (is_ast_if(stat)) {
          stat.condition = cons_seq(stat.condition)
        } else if (is_ast_switch(stat)) {
          stat.expression = cons_seq(stat.expression)
        } else if (is_ast_with(stat)) {
          stat.expression = cons_seq(stat.expression)
        }
      }
      if (compressor.option('conditionals') && is_ast_if(stat)) {
        const decls: any[] = []
        const body = to_simple_statement(stat.body, decls)
        const alt = to_simple_statement(stat.alternative as any, decls)
        if (body !== false && alt !== false && decls.length > 0) {
          const len = decls.length
          decls.push(make_node('AST_If', stat, {
            condition: stat.condition,
            body: body || make_node('AST_EmptyStatement', stat.body),
            alternative: alt
          }))
          decls.unshift(n, 1);
          [].splice.apply(this.body, decls as any) // TODO: check type
          i += len
          n += len + 1
          prev = null
          this.CHANGED = true
          continue
        }
      }
      this.body[n++] = stat
      prev = is_ast_simple_statement(stat) ? stat : null
    }
    this.body.length = n
  }

  private join_consecutive_vars (compressor: Compressor) {
    let defs: any
    const extract_object_assignments = (value: AST_Node) => {
      this.body[++j] = stat
      const exprs = join_object_assignments(prev, value, compressor, this.compressor_scope)
      if (exprs) {
        this.CHANGED = true
        if (exprs.length) {
          return make_sequence(value, exprs)
        } else if (is_ast_sequence(value)) {
          return value.tail_node().left
        } else {
          return value.left
        }
      }
      return value
    }

    let i = 0
    let j = -1
    let stat: any
    let prev: any
    const len = this.body.length
    for (; i < len; i++) {
      stat = this.body[i]
      prev = this.body[j]
      let exprs: any
      if (is_ast_definitions(stat)) {
        if (prev && prev.TYPE == stat.TYPE) {
          prev.definitions = prev.definitions.concat(stat.definitions)
          this.CHANGED = true
        } else if (defs && defs.TYPE == stat.TYPE && declarations_only(stat)) {
          defs.definitions = defs.definitions.concat(stat.definitions)
          this.CHANGED = true
        } else {
          this.body[++j] = stat
          defs = stat
        }
      } else if (is_ast_exit(stat)) {
        stat.value = extract_object_assignments(stat.value)
      } else if (is_ast_for(stat)) {
        exprs = join_object_assignments(prev, stat.init, compressor, this.compressor_scope)
        if (exprs) {
          this.CHANGED = true
          stat.init = exprs.length ? make_sequence(stat.init, exprs) : null
          this.body[++j] = stat
        } else if (is_ast_var(prev) && (!stat.init || stat.init.TYPE == prev.TYPE)) {
          if (stat.init) {
            prev.definitions = prev.definitions.concat(stat.init.definitions)
          }
          stat.init = prev
          this.body[j] = stat
          this.CHANGED = true
        } else if (defs && stat.init && defs.TYPE == stat.init.TYPE && declarations_only(stat.init)) {
          defs.definitions = defs.definitions.concat(stat.init.definitions)
          stat.init = null
          this.body[++j] = stat
          this.CHANGED = true
        } else {
          this.body[++j] = stat
        }
      } else if (is_ast_for_in(stat)) {
        stat.object = extract_object_assignments(stat.object)
      } else if (is_ast_if(stat)) {
        stat.condition = extract_object_assignments(stat.condition)
      } else if (is_ast_simple_statement(stat)) {
        exprs = join_object_assignments(prev, stat.body, compressor, this.compressor_scope)
        if (exprs) {
          this.CHANGED = true
          if (!exprs.length) continue
          stat.body = make_sequence(stat.body, exprs)
        }
        this.body[++j] = stat
      } else if (is_ast_switch(stat)) {
        stat.expression = extract_object_assignments(stat.expression)
      } else if (is_ast_with(stat)) {
        stat.expression = extract_object_assignments(stat.expression)
      } else {
        this.body[++j] = stat
      }
    }
    this.body.length = j + 1
  }

  // Tighten a bunch of statements together. Used whenever there is a block.
  tighten_body (compressor: Compressor) {
    this.find_loop_scope_try(compressor)
    let max_iter = 10
    do {
      this.CHANGED = false
      this.eliminate_spurious_blocks(this.body)
      if (compressor.option('dead_code')) {
        this.eliminate_dead_code(this.body, compressor)
      }
      if (compressor.option('if_return')) {
        this.handle_if_return(compressor)
      }
      if (compressor.sequences_limit > 0) {
        this.sequencesize(compressor)
        this.sequencesize_2(compressor)
      }
      if (compressor.option('join_vars')) {
        this.join_consecutive_vars(compressor)
      }
      if (compressor.option('collapse_vars')) {
        this.collapse(compressor)
      }
    } while (this.CHANGED && max_iter-- > 0)
  }

  static documentation = 'A body of statements (usually braced)'
  static propdoc = {
    body: '[AST_Statement*] an array of statements',
    block_scope: '[AST_Scope] the block scope'
  } as any

  static PROPS = AST_Statement.PROPS.concat(['body', 'block_scope'])
  constructor (args: AST_Block_Props) {
    super(args)
    this.body = args.body
    this.block_scope = args.block_scope
  }
}

export interface AST_Block_Props extends AST_Statement_Props {
  body?: AST_Statement[]
  block_scope?: AST_Scope | null
  expression?: any
}

function loop_body (x: any) {
  if (is_ast_iteration_statement(x)) {
    return is_ast_block_statement(x.body) ? x.body : x
  }
  return x
}

function to_simple_statement (block: AST_Block, decls: AST_Var[]) {
  if (!(is_ast_block_statement(block))) return block
  let stat: any = null
  for (let i = 0, len = block.body.length; i < len; i++) {
    const line = block.body[i]
    if (is_ast_var(line) && declarations_only(line)) {
      decls.push(line)
    } else if (stat) {
      return false
    } else {
      stat = line
    }
  }
  return stat
}

function join_object_assignments (defn: AST_Node, body: AST_Node, compressor: Compressor, compressor_scope: AST_Scope | undefined) {
  if (!(is_ast_definitions(defn))) return
  const def = defn.definitions[defn.definitions.length - 1]
  if (!(is_ast_object(def.value))) return
  let exprs
  if (is_ast_assign(body)) {
    exprs = [body]
  } else if (is_ast_sequence(body)) {
    exprs = body.expressions.slice()
  }
  if (!exprs) return
  let trimmed = false
  do {
    const node = exprs[0]
    if (!(is_ast_assign(node))) break
    if (node.operator != '=') break
    if (!(is_ast_prop_access(node.left))) break
    const sym = node.left.expression
    if (!(is_ast_symbol_ref(sym))) break
    if (def.name.name != sym.name) break
    if (!node.right.is_constant_expression(compressor_scope)) break
    let prop: any = node.left.property
    if (is_ast_node(prop)) {
      prop = prop.evaluate?.(compressor)
    }
    if (is_ast_node(prop)) break
    prop = '' + prop
    const diff = compressor.option('ecma') < 2015 &&
              compressor.has_directive('use strict') ? function (node: AST_Node) {
        return node.key != prop && (node.key && node.key.name != prop)
      } : function (node: AST_Node) {
        return node.key && node.key.name != prop
      }
    if (!def.value.properties.every(diff)) break
    const p = def.value.properties.filter(function (p) { return p.key === prop })[0]
    if (!p) {
      def.value.properties.push(make_node('AST_ObjectKeyVal', node, {
        key: prop,
        value: node.right
      }))
    } else {
      p.value = new AST_Sequence({
        start: p.start,
        expressions: [p.value.clone(), node.right.clone()],
        end: p.end
      })
    }
    exprs.shift()
    trimmed = true
  } while (exprs.length)
  return trimmed && exprs
}

function declarations_only (node: AST_Node) {
  return node.definitions?.every((var_def) =>
    !var_def.value
  )
}

function redefined_within_scope (def: SymbolDef, scope: AST_Scope) {
  if (def.global) return false
  let cur_scope = def.scope
  while (cur_scope && cur_scope !== scope) {
    if (cur_scope.variables.has(def.name)) return true
    cur_scope = cur_scope.parent_scope
  }
  return false
}

function has_multiple_if_returns (statements: AST_Statement[]) {
  let n = 0
  for (let i = statements.length; --i >= 0;) {
    const stat = statements[i]
    if (is_ast_if(stat) && is_ast_return(stat.body)) {
      if (++n > 1) return true
    }
  }
  return false
}

function is_return_void (value: AST_Node | undefined) {
  return !value || is_ast_unary_prefix(value) && value.operator == 'void'
}

function as_statement_array_with_return (node: AST_Node, ab: AST_Binary) {
  const body = as_statement_array(node).slice(0, -1)
  if (ab.value) {
    body.push(make_node('AST_SimpleStatement', ab.value, {
      body: ab.value.expression
    }) as AST_SimpleStatement)
  }
  return body
}

function remove_candidate (compressor: Compressor, expr: AST_Node, statement: AST_Statement) {
  if (is_ast_symbol_funarg(expr.name)) {
    const iife = compressor.parent(); const argnames = (compressor.self() as any).argnames
    const index = argnames.indexOf(expr.name)
    if (index < 0) {
      iife.args.length = Math.min(iife.args.length, argnames.length - 1)
    } else {
      const args = iife.args
      if (args[index]) {
        args[index] = make_node('AST_Number', args[index], {
          value: 0
        })
      }
    }
    return true
  }
  let found = false
  return statement.transform(new TreeTransformer(function (node: AST_Node, descend: Function, in_list: boolean) {
    if (found) return node
    if (node === expr || node.body === expr) {
      found = true
      if (is_ast_var_def(node)) {
        node.value = is_ast_symbol_const(node.name)
          ? make_node('AST_Undefined', node.value) // `const` always needs value.
          : null
        return node
      }
      return in_list ? MAP.skip : null
    }
  }, function (node: AST_Node) {
    if (is_ast_sequence(node)) {
      switch (node.expressions.length) {
        case 0: return null
        case 1: return node.expressions[0]
      }
    }
  }))
}
