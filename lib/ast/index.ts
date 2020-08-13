/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

'use strict'

import {
  HOP,
  MAP,
  noop,
  string_template,
  make_node,
  defaults,
  push_uniq,
  regexp_source_fix,
  return_false,
  return_true,
  return_this,
  remove,
  map_add,
  has_annotation,
  warn,
  is_strict,
  push,
  pop,
  mark,
  return_null,
  pass_through,
  mkshallow,
  to_moz,
  to_moz_in_destructuring,
  best_of_expression,
  best_of,
  make_sequence,
  first_in_statement,
  is_undefined,
  tighten_body,
  reset_block_variables,
  reset_def,
  anySideEffect,
  anyMayThrow,
  is_identifier_atom,
  list_overhead,
  make_node_from_constant,
  can_be_evicted_from_block,
  walk,
  do_list,
  maintain_this_binding,
  walk_body,
  extract_declarations_from_unreachable_code,
  get_value,
  aborts,
  is_func_expr,
  is_lhs,
  is_modified,
  is_ref_of,
  trim,
  inline_array_like_spread,
  print_braced_empty,
  lambda_modifiers,
  is_undeclared_ref,
  is_empty,
  display_body,
  print_braced,
  blockStateMentCodeGen,
  parenthesize_for_noin,
  suppress,
  next_mangled,
  reset_variables,
  opt_AST_Lambda,
  basic_negation,
  find_scope,
  all_refs_local,
  is_iife_call,
  safe_to_assign,
  is_reachable,
  is_object,
  is_nullish,
  is_immutable,
  is_nullish_check,
  redefined_catch_def,
  recursive_ref,
  mark_lambda,
  best,
  safe_to_read,
  mark_escaped,
  to_node,
  needsParens,
  retain_top_func,
  scope_encloses_variables_in_this_scope,
  within_array_or_object_literal,
  ref_once,
  init_scope_vars,
  to_moz_scope,
  To_Moz_FunctionExpression,
  left_is_object,
  callCodeGen,
  to_moz_block,
  keep_name
} from '../utils'

import { parse, js_error, PRECEDENCE, RESERVED_WORDS, JS_Parse_Error } from '../parse'
import { OutputStream } from '../output'

import { base54, function_defs, SymbolDef, setFunctionDefs } from '../scope'
import TreeTransformer from '../tree-transformer'

import {
  UNUSED,
  TRUTHY,
  FALSY,
  UNDEFINED,
  INLINED,
  WRITE_ONLY,
  SQUEEZED,
  TOP,
  CLEAR_BETWEEN_PASSES,
  native_fns,
  has_flag,
  static_fns,
  global_names,
  global_pure_fns,
  unary_side_effects,
  set_flag,
  lazy_op,
  unary_bool,
  binary_bool,
  unary,
  binary,
  non_converting_unary,
  non_converting_binary,
  pure_prop_access_globals,
  ASSIGN_OPS,
  ASSIGN_OPS_COMMUTATIVE,
  commutativeOperators,
  identifier_atom,
  walk_abort,
  _PURE,
  _NOINLINE,
  _INLINE,
  global_objs,
  MASK_EXPORT_DONT_MANGLE,
  MASK_EXPORT_WANT_MANGLE,
  clear_flag
} from '../constants'

import Compressor from '../compressor'

import TreeWalker from '../tree-walker'

import AST_Await from './await'
import AST_Yield from './yield'
import AST_Undefined from './undefined'
import AST_Boolean from './boolean'
import AST_Infinity from './infinity'
import AST_NaN from './nan'
import AST_ForOf from './for-of'
import AST_ForIn from './for-in'
import AST_For from './for'
import AST_Sequence from './sequence'
import AST_BlockStatement from './block-statement'
import AST_Var from './var'
import AST_Let from './let'
import AST_Const from './const'
import AST_If from './if'
import AST_Export from './export'
import AST_Definitions from './definitions'
import AST_TemplateString from './template-string'
import AST_Destructuring from './destructuring'
import AST_Dot from './dot'
import AST_Sub from './sub'
import AST_PropAccess from './prop-access'
import AST_ConciseMethod from './concise-method'
import AST_ClassProperty from './class-property'
import AST_ObjectGetter from './object-getter'
import AST_ObjectSetter from './object-setter'
import AST_ObjectKeyVal from './object-key-val'
import AST_PrefixedTemplateString from './prefixed-template-string'
import AST_ObjectProperty from './object-property'
import AST_Object from './object'
import AST_Array from './array'
import AST_SymbolExportForeign from './symbol-export-foreign'
import AST_LabelRef from './label-ref'
import AST_This from './this'
import AST_Label from './label'
import AST_SymbolImportForeign from './symbol-import-foreign'
import AST_SymbolImport from './symbol-import'
import AST_SymbolCatch from './symbol-catch'
import AST_SymbolClass from './symbol-class'
import AST_SymbolDefClass from './symbol-def-class'
import AST_SymbolLambda from './symbol-lambda'
import AST_SymbolClassProperty from './symbol-class-property'
import AST_SymbolMethod from './symbol-method'
import AST_SymbolDefun from './symbol-defun'
import AST_SymbolFunarg from './symbol-funarg'
import AST_SymbolLet from './symbol-let'
import AST_SymbolConst from './symbol-const'
import AST_SymbolBlockDeclaration from './symbol-block-declaration'
import AST_SymbolVar from './symbol-var'
import AST_SymbolDeclaration from './symbol-declaration'
import AST_Symbol from './symbol'
import AST_Default from './default'
import AST_Case from './case'
import AST_Node from './node'
import AST_Token from './token'
import AST_Statement from './statement'
import AST_Debugger from './debugger'
import AST_Directive from './directive'
import AST_SimpleStatement from './simple-statement'
import AST_EmptyStatement from './empty-statement'
import AST_NewTarget from './new-target'
import AST_Expansion from './expansion'
import AST_TemplateSegment from './template-segment'
import AST_Constant from './constant'
import AST_String from './string'
import AST_Number from './number'
import AST_BigInt from './big-int'
import AST_RegExp from './reg-exp'
import AST_Atom from './atom'
import AST_Null from './null'
import AST_Hole from './hole'
import AST_Jump from './jump'
import AST_Exit from './exit'
import AST_LoopControl from './loop-control'
import AST_Return from './return'
import AST_StatementWithBody from './statement-with-body'
import AST_Throw from './throw'
import AST_Block from './block'
import AST_Break from './break'
import AST_LabeledStatement from './labeled-statement'
import AST_IterationStatement from './iteration-statement'
import AST_With from './with'
import AST_DWLoop from './dw-loop'
import AST_Continue from './continue'
import AST_While from './while'
import AST_Do from './do'
import AST_SwitchBranch from './switch-branch'

export let unmangleable_names: Set<any> | null = null

export let printMangleOptions

/* -----[ statements ]----- */

/* -----[ scope and functions ]----- */

class AST_Scope extends AST_Block {
  functions: any
  globals: any
  variables: any
  enclosed: any
  _added_var_names?: Set<any>
  _var_name_cache: any
  parent_scope: any
  uses_eval: any
  uses_with: any
  cname: any

  process_expression (insert, compressor) {
    var self = this
    var tt = new TreeTransformer(function (node: any) {
      if (insert && node?.isAst?.('AST_SimpleStatement')) {
        return make_node('AST_Return', node, {
          value: node.body
        })
      }
      if (!insert && node?.isAst?.('AST_Return')) {
        if (compressor) {
          var value = node.value && node.value.drop_side_effect_free?.(compressor, true)
          return value ? make_node('AST_SimpleStatement', node, {
            body: value
          }) : make_node('AST_EmptyStatement', node)
        }
        return make_node('AST_SimpleStatement', node, {
          body: node.value || make_node('AST_UnaryPrefix', node, {
            operator: 'void',
            expression: make_node('AST_Number', node, {
              value: 0
            })
          })
        })
      }
      if (node?.isAst?.('AST_Class') || node?.isAst?.('AST_Lambda') && (node) !== self) {
        return node
      }
      if (node?.isAst?.('AST_Block')) {
        var index = node.body.length - 1
        if (index >= 0) {
          node.body[index] = node.body[index].transform(tt)
        }
      } else if (node?.isAst?.('AST_If')) {
        node.body = (node.body).transform(tt)
        if (node.alternative) {
          node.alternative = node.alternative.transform(tt)
        }
      } else if (node?.isAst?.('AST_With')) {
        node.body = (node.body).transform(tt)
      }
      return node
    })
    self.transform(tt)
  }

  drop_unused (compressor: any) {
    const optUnused = compressor.option('unused')
    if (!optUnused) return
    if (compressor.has_directive('use asm')) return
    var self = this
    if (self.pinned()) return
    var drop_funcs = !(self?.isAst?.('AST_Toplevel')) || compressor.toplevel.funcs
    var drop_vars = !(self?.isAst?.('AST_Toplevel')) || compressor.toplevel.vars
    const assign_as_unused = typeof optUnused === 'string' && optUnused.includes('keep_assign') ? return_false : function (node: any) {
      if (node?.isAst?.('AST_Assign') &&
              (has_flag(node, WRITE_ONLY) || node.operator == '=')
      ) {
        return node.left
      }
      if (node?.isAst?.('AST_Unary') && has_flag(node, WRITE_ONLY)) {
        return node.expression
      }
    }
    var in_use_ids = new Map()
    var fixed_ids = new Map()
    if (self?.isAst?.('AST_Toplevel') && compressor.top_retain) {
      self.variables.forEach(function (def) {
        if (compressor.top_retain?.(def) && !in_use_ids.has(def.id)) {
          in_use_ids.set(def.id, def)
        }
      })
    }
    var var_defs_by_id = new Map()
    var initializations = new Map()
    // pass 1: find out which symbols are directly used in
    // this scope (not in nested scopes).
    var scope: any = this
    var tw = new TreeWalker(function (node: any, descend) {
      if (node?.isAst?.('AST_Lambda') && node.uses_arguments && !tw.has_directive('use strict')) {
        node.argnames.forEach(function (argname) {
          if (!(argname?.isAst?.('AST_SymbolDeclaration'))) return
          var def = argname.definition?.()
          if (!in_use_ids.has(def.id)) {
            in_use_ids.set(def.id, def)
          }
        })
      }
      if (node === self) return
      if (node?.isAst?.('AST_Defun') || node?.isAst?.('AST_DefClass')) {
        var node_def = node.name?.definition?.()
        const in_export = tw.parent()?.isAst?.('AST_Export')
        if (in_export || !drop_funcs && scope === self) {
          if (node_def.global && !in_use_ids.has(node_def.id)) {
            in_use_ids.set(node_def.id, node_def)
          }
        }
        if (node?.isAst?.('AST_DefClass')) {
          if (
            node.extends &&
                      (node.extends.has_side_effects(compressor) ||
                      node.extends.may_throw(compressor))
          ) {
            node.extends.walk(tw)
          }
          for (const prop of node.properties) {
            if (
              prop.has_side_effects(compressor) ||
                          prop.may_throw(compressor)
            ) {
              prop.walk(tw)
            }
          }
        }
        map_add(initializations, node_def.id, node)
        return true // don't go in nested scopes
      }
      if (node?.isAst?.('AST_SymbolFunarg') && scope === self) {
        map_add(var_defs_by_id, node.definition?.().id, node)
      }
      if (node?.isAst?.('AST_Definitions') && scope === self) {
        const in_export = tw.parent()?.isAst?.('AST_Export')
        node.definitions.forEach(function (def) {
          if (def.name?.isAst?.('AST_SymbolVar')) {
            map_add(var_defs_by_id, def.name.definition?.().id, def)
          }
          if (in_export || !drop_vars) {
            walk(def.name, (node: any) => {
              if (node?.isAst?.('AST_SymbolDeclaration')) {
                const def = node.definition?.()
                if (
                  (in_export || def.global) &&
                                  !in_use_ids.has(def.id)
                ) {
                  in_use_ids.set(def.id, def)
                }
              }
            })
          }
          if (def.value) {
            if (def.name?.isAst?.('AST_Destructuring')) {
              def.walk(tw)
            } else {
              var node_def = def.name.definition?.()
              map_add(initializations, node_def.id, def.value)
              if (!node_def.chained && def.name.fixed_value() === def.value) {
                fixed_ids.set(node_def.id, def)
              }
            }
            if (def.value.has_side_effects(compressor)) {
              def.value.walk(tw)
            }
          }
        })
        return true
      }
      return scan_ref_scoped(node, descend)
    })
    self.walk(tw)
    // pass 2: for every used symbol we need to walk its
    // initialization code to figure out if it uses other
    // symbols (that may not be in_use).
    tw = new TreeWalker(scan_ref_scoped)
    in_use_ids.forEach(function (def) {
      var init = initializations.get(def.id)
      if (init) {
        init.forEach(function (init) {
          init.walk(tw)
        })
      }
    })
    // pass 3: we should drop declarations not in_use
    var tt = new TreeTransformer(
      function before (node, descend, in_list) {
        var parent = tt.parent()
        if (drop_vars) {
          const sym = assign_as_unused(node)
          if (sym?.isAst?.('AST_SymbolRef')) {
            var def = sym.definition?.()
            var in_use = in_use_ids.has(def.id)
            if (node?.isAst?.('AST_Assign')) {
              if (!in_use || fixed_ids.has(def.id) && fixed_ids.get(def.id) !== node) {
                return maintain_this_binding(parent, node, node.right.transform(tt))
              }
            } else if (!in_use) {
              return in_list ? MAP.skip : make_node('AST_Number', node, {
                value: 0
              })
            }
          }
        }
        if (scope !== self) return
        var def
        if (node.name &&
                  (node?.isAst?.('AST_ClassExpression') &&
                      !keep_name(compressor.option('keep_classnames'), (def = node.name?.definition?.()).name) ||
                  node?.isAst?.('AST_Function') &&
                      !keep_name(compressor.option('keep_fnames'), (def = node.name?.definition?.()).name))) {
          // any declarations with same name will overshadow
          // name of this anonymous function and can therefore
          // never be used anywhere
          if (!in_use_ids.has(def.id) || def.orig.length > 1) node.name = null
        }
        if (node?.isAst?.('AST_Lambda') && !(node?.isAst?.('AST_Accessor'))) {
          var trim = !compressor.option('keep_fargs')
          for (var a = node.argnames, i = a.length; --i >= 0;) {
            var sym = a[i]
            if (sym?.isAst?.('AST_Expansion')) {
              sym = sym.expression
            }
            if (sym?.isAst?.('AST_DefaultAssign')) {
              sym = sym.left
            }
            // Do not drop destructuring arguments.
            // They constitute a type assertion, so dropping
            // them would stop that TypeError which would happen
            // if someone called it with an incorrectly formatted
            // parameter.
            if (!(sym?.isAst?.('AST_Destructuring')) && !in_use_ids.has(sym.definition?.().id)) {
              set_flag(sym, UNUSED)
              if (trim) {
                a.pop()
                compressor[sym.unreferenced() ? 'warn' : 'info']('Dropping unused function argument {name} [{file}:{line},{col}]', template(sym))
              }
            } else {
              trim = false
            }
          }
        }
        if ((node?.isAst?.('AST_Defun') || node?.isAst?.('AST_DefClass')) && (node) !== self) {
          const def = node.name?.definition?.()
          const keep = def.global && !drop_funcs || in_use_ids.has(def.id)
          if (!keep) {
            compressor[node.name?.unreferenced() ? 'warn' : 'info']('Dropping unused function {name} [{file}:{line},{col}]', template(node.name))
            def.eliminated++
            if (node?.isAst?.('AST_DefClass')) {
              // Classes might have extends with side effects
              const side_effects = node.drop_side_effect_free(compressor)
              if (side_effects) {
                return make_node('AST_SimpleStatement', node, {
                  body: side_effects
                })
              }
            }
            return in_list ? MAP.skip : make_node('AST_EmptyStatement', node)
          }
        }
        if (node?.isAst?.('AST_Definitions') && !(parent?.isAst?.('AST_ForIn') && parent.init === node)) {
          var drop_block = !(parent?.isAst?.('AST_Toplevel')) && !(node?.isAst?.('AST_Var'))
          // place uninitialized names at the start
          var body: any[] = []; var head: any[] = []; var tail: any[] = []
          // for unused names whose initialization has
          // side effects, we can cascade the init. code
          // into the next one, or next statement.
          var side_effects: any[] = []
          node.definitions.forEach(function (def) {
            if (def.value) def.value = def.value.transform(tt)
            var is_destructure = def.name?.isAst?.('AST_Destructuring')
            var sym = is_destructure
              ? new SymbolDef(null, { name: '<destructure>' }) /* fake SymbolDef */
              : def.name.definition?.()
            if (drop_block && sym.global) return tail.push(def)
            if (!(drop_vars || drop_block) ||
                          is_destructure &&
                              (def.name.names.length ||
                                  def.name.is_array ||
                                  compressor.option('pure_getters') != true) ||
                          in_use_ids.has(sym.id)
            ) {
              if (def.value && fixed_ids.has(sym.id) && fixed_ids.get(sym.id) !== def) {
                def.value = def.value.drop_side_effect_free(compressor)
              }
              if (def.name?.isAst?.('AST_SymbolVar')) {
                var var_defs = var_defs_by_id.get(sym.id)
                if (var_defs.length > 1 && (!def.value || sym.orig.indexOf(def.name) > sym.eliminated)) {
                  compressor.warn('Dropping duplicated definition of variable {name} [{file}:{line},{col}]', template(def.name))
                  if (def.value) {
                    var ref = make_node('AST_SymbolRef', def.name, def.name)
                    sym.references.push(ref)
                    var assign = make_node('AST_Assign', def, {
                      operator: '=',
                      left: ref,
                      right: def.value
                    })
                    if (fixed_ids.get(sym.id) === def) {
                      fixed_ids.set(sym.id, assign)
                    }
                    side_effects.push(assign.transform(tt))
                  }
                  remove(var_defs, def)
                  sym.eliminated++
                  return
                }
              }
              if (def.value) {
                if (side_effects.length > 0) {
                  if (tail.length > 0) {
                    side_effects.push(def.value)
                    def.value = make_sequence(def.value, side_effects)
                  } else {
                    body.push(make_node('AST_SimpleStatement', node, {
                      body: make_sequence(node, side_effects)
                    }))
                  }
                  side_effects = []
                }
                tail.push(def)
              } else {
                head.push(def)
              }
            } else if (sym.orig[0]?.isAst?.('AST_SymbolCatch')) {
              var value = def.value && def.value.drop_side_effect_free(compressor)
              if (value) side_effects.push(value)
              def.value = null
              head.push(def)
            } else {
              var value = def.value && def.value.drop_side_effect_free(compressor)
              if (value) {
                if (!is_destructure) compressor.warn('Side effects in initialization of unused variable {name} [{file}:{line},{col}]', template(def.name))
                side_effects.push(value)
              } else {
                if (!is_destructure) compressor[def.name.unreferenced() ? 'warn' : 'info']('Dropping unused variable {name} [{file}:{line},{col}]', template(def.name))
              }
              sym.eliminated++
            }
          })
          if (head.length > 0 || tail.length > 0) {
            node.definitions = head.concat(tail)
            body.push(node)
          }
          if (side_effects.length > 0) {
            body.push(make_node('AST_SimpleStatement', node, {
              body: make_sequence(node, side_effects)
            }))
          }
          switch (body.length) {
            case 0:
              return in_list ? MAP.skip : make_node('AST_EmptyStatement', node)
            case 1:
              return body[0]
            default:
              return in_list ? MAP.splice(body) : make_node('AST_BlockStatement', node, {
                body: body
              })
          }
        }
        // certain combination of unused name + side effect leads to:
        //    https://github.com/mishoo/UglifyJS2/issues/44
        //    https://github.com/mishoo/UglifyJS2/issues/1830
        //    https://github.com/mishoo/UglifyJS2/issues/1838
        // that's an invalid AST.
        // We fix it at this stage by moving the `var` outside the `for`.
        if (node?.isAst?.('AST_For')) {
          descend(node, this)
          var block
          if (node.init?.isAst?.('AST_BlockStatement')) {
            block = node.init
            node.init = block.body.pop()
            block.body.push(node)
          }
          if (node.init?.isAst?.('AST_SimpleStatement')) {
            // TODO: check type
            node.init = node.init.body
          } else if (is_empty(node.init)) {
            node.init = null
          }
          return !block ? node : in_list ? MAP.splice(block.body) : block
        }
        if (node?.isAst?.('AST_LabeledStatement') &&
                  node.body?.isAst?.('AST_For')
        ) {
          descend(node, this)
          if (node.body?.isAst?.('AST_BlockStatement')) {
            const block = node.body
            node.body = block.body.pop() // TODO: check type
            block.body.push(node)
            return in_list ? MAP.splice(block.body) : block
          }
          return node
        }
        if (node?.isAst?.('AST_BlockStatement')) {
          descend(node, this)
          if (in_list && node.body.every(can_be_evicted_from_block)) {
            return MAP.splice(node.body)
          }
          return node
        }
        if (node?.isAst?.('AST_Scope')) {
          const save_scope = scope
          scope = node
          descend(node, this)
          scope = save_scope
          return node
        }

        function template (sym) {
          return {
            name: sym.name,
            file: sym.start.file,
            line: sym.start.line,
            col: sym.start.col
          }
        }
      }
    )

    self.transform(tt)

    function scan_ref_scoped (node, descend) {
      var node_def
      const sym = assign_as_unused(node)
      if (sym?.isAst?.('AST_SymbolRef') &&
              !is_ref_of(node.left, AST_SymbolBlockDeclaration) &&
              self.variables.get(sym.name) === (node_def = sym.definition?.())
      ) {
        if (node?.isAst?.('AST_Assign')) {
          node.right.walk(tw)
          if (!node_def.chained && node.left.fixed_value() === node.right) {
            fixed_ids.set(node_def.id, node)
          }
        }
        return true
      }
      if (node?.isAst?.('AST_SymbolRef')) {
        node_def = node.definition?.()
        if (!in_use_ids.has(node_def.id)) {
          in_use_ids.set(node_def.id, node_def)
          if (node_def.orig[0]?.isAst?.('AST_SymbolCatch')) {
            const redef = node_def.scope.is_block_scope() &&
                          node_def.scope.get_defun_scope().variables.get(node_def.name)
            if (redef) in_use_ids.set(redef.id, redef)
          }
        }
        return true
      }
      if (node?.isAst?.('AST_Scope')) {
        var save_scope = scope
        scope = node
        descend()
        scope = save_scope
        return true
      }
    }
  }

  hoist_declarations (compressor: any) {
    var self = this
    if (compressor.has_directive('use asm')) return self
    // Hoisting makes no sense in an arrow func
    if (!Array.isArray(self.body)) return self

    var hoist_funs = compressor.option('hoist_funs')
    var hoist_vars = compressor.option('hoist_vars')

    if (hoist_funs || hoist_vars) {
      var dirs: any[] = []
      var hoisted: any[] = []
      var vars = new Map(); var vars_found = 0; var var_decl = 0
      // let's count var_decl first, we seem to waste a lot of
      // space if we hoist `var` when there's only one.
      walk(self, (node: any) => {
        if (node?.isAst?.('AST_Scope') && node !== self) { return true }
        if (node?.isAst?.('AST_Var')) {
          ++var_decl
          return true
        }
      })
      hoist_vars = hoist_vars && var_decl > 1
      var tt = new TreeTransformer(
        function before (node: any) {
          if (node !== self) {
            if (node?.isAst?.('AST_Directive')) {
              dirs.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_funs && node?.isAst?.('AST_Defun') &&
                          !(tt.parent()?.isAst?.('AST_Export')) &&
                          tt.parent() === self) {
              hoisted.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_vars && node?.isAst?.('AST_Var')) {
              node.definitions.forEach(function (def) {
                if (def.name?.isAst?.('AST_Destructuring')) return
                vars.set(def.name.name, def)
                ++vars_found
              })
              var seq = node.to_assignments(compressor)
              var p = tt.parent()
              if (p?.isAst?.('AST_ForIn') && p.init === node) {
                if (seq == null) {
                  var def = node.definitions[0].name
                  return make_node('AST_SymbolRef', def, def)
                }
                return seq
              }
              if (p?.isAst?.('AST_For') && p.init === node) {
                return seq
              }
              if (!seq) return make_node('AST_EmptyStatement', node)
              return make_node('AST_SimpleStatement', node, {
                body: seq
              })
            }
            if (node?.isAst?.('AST_Scope')) { return node } // to avoid descending in nested scopes
          }
        }
      )
      self = self.transform(tt)
      if (vars_found > 0) {
        // collect only vars which don't show up in self's arguments list
        var defs: any[] = []
        const is_lambda = self?.isAst?.('AST_Lambda')
        const args_as_names = is_lambda ? (self as unknown as AST_Lambda).args_as_names() : null
        vars.forEach((def, name) => {
          if (is_lambda && args_as_names.some((x) => x.name === def.name.name)) {
            vars.delete(name)
          } else {
            def = def.clone()
            def.value = null
            defs.push(def)
            vars.set(name, def)
          }
        })
        if (defs.length > 0) {
          // try to merge in assignments
          for (var i = 0; i < self.body.length;) {
            if (self.body[i]?.isAst?.('AST_SimpleStatement')) {
              var expr = self.body[i].body; var sym; var assign
              if (expr?.isAst?.('AST_Assign') &&
                              expr.operator == '=' &&
                              (sym = expr.left)?.isAst?.('AST_Symbol') &&
                              vars.has(sym.name)
              ) {
                var def = vars.get(sym.name)
                if (def.value) break
                def.value = expr.right
                remove(defs, def)
                defs.push(def)
                self.body.splice(i, 1)
                continue
              }
              if (expr?.isAst?.('AST_Sequence') &&
                              (assign = expr.expressions[0])?.isAst?.('AST_Assign') &&
                              assign.operator == '=' &&
                              (sym = assign.left)?.isAst?.('AST_Symbol') &&
                              vars.has(sym.name)
              ) {
                var def = vars.get(sym.name)
                if (def.value) break
                def.value = assign.right
                remove(defs, def)
                defs.push(def)
                self.body[i].body = make_sequence(expr, expr.expressions.slice(1))
                continue
              }
            }
            if (self.body[i]?.isAst?.('AST_EmptyStatement')) {
              self.body.splice(i, 1)
              continue
            }
            if (self.body[i]?.isAst?.('AST_BlockStatement')) {
              var tmp = [i, 1].concat(self.body[i].body)
              self.body.splice.apply(self.body, tmp)
              continue
            }
            break
          }
          defs = make_node('AST_Var', self, {
            definitions: defs
          })
          hoisted.push(defs)
        }
      }
      self.body = dirs.concat(hoisted, self.body)
    }
    return self
  }

  make_var_name (prefix) {
    var var_names = this.var_names()
    prefix = prefix.replace(/(?:^[^a-z_$]|[^a-z0-9_$])/ig, '_')
    var name = prefix
    for (var i = 0; var_names.has(name); i++) name = prefix + '$' + i
    this.add_var_name(name)
    return name
  }

  hoist_properties (compressor: any) {
    var self = this
    if (!compressor.option('hoist_props') || compressor.has_directive('use asm')) return self
    var top_retain = self?.isAst?.('AST_Toplevel') && compressor.top_retain || return_false
    var defs_by_id = new Map()
    var hoister = new TreeTransformer(function (node: any, descend) {
      if (node?.isAst?.('AST_Definitions') &&
              hoister.parent()?.isAst?.('AST_Export')) return node
      if (node?.isAst?.('AST_VarDef')) {
        const sym = node.name
        let def
        let value
        if (sym.scope === self &&
                  (def = sym.definition?.()).escaped != 1 &&
                  !def.assignments &&
                  !def.direct_access &&
                  !def.single_use &&
                  !compressor.exposed(def) &&
                  !top_retain(def) &&
                  (value = sym.fixed_value()) === node.value &&
                  value?.isAst?.('AST_Object') &&
                  value.properties.every(prop => typeof prop.key === 'string')
        ) {
          descend(node, this)
          const defs = new Map()
          const assignments: any[] = []
          value.properties.forEach(function (prop) {
            assignments.push(make_node('AST_VarDef', node, {
              name: make_sym(sym, prop.key, defs),
              value: prop.value
            }))
          })
          defs_by_id.set(def.id, defs)
          return MAP.splice(assignments)
        }
      } else if (node?.isAst?.('AST_PropAccess') &&
              node.expression?.isAst?.('AST_SymbolRef')
      ) {
        const defs = defs_by_id.get(node.expression.definition?.().id)
        if (defs) {
          const def = defs.get(String(get_value(node.property)))
          const sym = make_node('AST_SymbolRef', node, {
            name: def.name,
            scope: node.expression.scope,
            thedef: def
          })
          sym.reference({})
          return sym
        }
      }

      function make_sym (sym: any | any, key: string, defs: Map<string, any>) {
        const new_var = make_node(sym.constructor.name, sym, {
          name: self.make_var_name(sym.name + '_' + key),
          scope: self
        })
        const def = self.def_variable(new_var)
        defs.set(String(key), def)
        self.enclosed.push(def)
        return new_var
      }
    })
    return self.transform(hoister)
  }

  init_scope_vars = init_scope_vars
  var_names = function varNames (this: any): Set<string> | null {
    var var_names = this._var_name_cache
    if (!var_names) {
      this._var_name_cache = var_names = new Set(
        this.parent_scope ? varNames.call(this.parent_scope) : null
      )
      if (this._added_var_names) {
        this._added_var_names.forEach(name => { var_names?.add(name) })
      }
      this.enclosed.forEach(function (def: any) {
              var_names?.add(def.name)
      })
      this.variables.forEach(function (_, name: string) {
              var_names?.add(name)
      })
    }
    return var_names
  }

  add_var_name (name: string) {
    // TODO change enclosed too
    if (!this._added_var_names) {
      // TODO stop adding var names entirely
      this._added_var_names = new Set()
    }
    this._added_var_names.add(name)
    if (!this._var_name_cache) this.var_names() // regen cache
    this._var_name_cache.add(name)
  }

  // TODO create function that asks if we can inline
  add_child_scope (scope: any) {
    // `scope` is going to be moved into wherever the compressor is
    // right now. Update the required scopes' information

    if (scope.parent_scope === this) return

    scope.parent_scope = this
    scope._var_name_cache = null
    if (scope._added_var_names) {
      scope._added_var_names.forEach(name => scope.add_var_name(name))
    }

    // TODO uses_with, uses_eval, etc

    const new_scope_enclosed_set = new Set(scope.enclosed)
    const scope_ancestry = (() => {
      const ancestry: any[] = []
      let cur = this
      do {
        ancestry.push(cur)
      } while ((cur = cur.parent_scope))
      ancestry.reverse()
      return ancestry
    })()

    const to_enclose: any[] = []
    for (const scope_topdown of scope_ancestry) {
      to_enclose.forEach(e => push_uniq(scope_topdown.enclosed, e))
      for (const def of scope_topdown.variables.values()) {
        if (new_scope_enclosed_set.has(def)) {
          push_uniq(to_enclose, def)
          push_uniq(scope_topdown.enclosed, def)
        }
      }
    }
  }

  is_block_scope = function () {
    return this._block_scope || false
  }

  find_variable (name: any | string) {
    if (name?.isAst?.('AST_Symbol')) name = name.name
    return this.variables.get(name) ||
          (this.parent_scope && this.parent_scope.find_variable(name))
  }

  def_function (this: any, symbol: any, init: boolean) {
    var def = this.def_variable(symbol, init)
    if (!def.init || def.init?.isAst?.('AST_Defun')) def.init = init
    this.functions.set(symbol.name, def)
    return def
  }

  def_variable (symbol: any, init?: boolean) {
    var def = this.variables.get(symbol.name)
    if (def) {
      def.orig.push(symbol)
      if (def.init && (def.scope !== symbol.scope || def.init?.isAst?.('AST_Function'))) {
        def.init = init
      }
    } else {
      def = new SymbolDef(this, symbol, init)
      this.variables.set(symbol.name, def)
      def.global = !this.parent_scope
    }
    return symbol.thedef = def
  }

  next_mangled (options: any, def: any) {
    return next_mangled(this, options)
  }

  get_defun_scope () {
    var self = this
    while (self.is_block_scope()) {
      self = self.parent_scope
    }
    return self
  }

  clone = function (deep: boolean) {
    var node = this._clone(deep)
    if (this.variables) node.variables = new Map(this.variables)
    if (this.functions) node.functions = new Map(this.functions)
    if (this.enclosed) node.enclosed = this.enclosed.slice()
    if (this._block_scope) node._block_scope = this._block_scope
    return node
  }

  pinned () {
    return this.uses_eval || this.uses_with
  }

  figure_out_scope (options: any, data: any = {}) {
    options = defaults(options, {
      cache: null,
      ie8: false,
      safari10: false
    })

    const { parent_scope = null, toplevel = this } = data

    if (!(toplevel?.isAst?.('AST_Toplevel'))) {
      throw new Error('Invalid toplevel scope')
    }

    // pass 1: setup scope chaining and handle definitions
    var scope: any = this.parent_scope = parent_scope
    var labels = new Map()
    var defun: any = null
    var in_destructuring: any = null
    var for_scopes: any[] = []
    var tw = new TreeWalker((node, descend) => {
      if (node.is_block_scope()) {
        const save_scope = scope
        node.block_scope = scope = new AST_Scope(node)
        scope._block_scope = true
        // AST_Try in the AST sadly *is* (not has) a body itself,
        // and its catch and finally branches are children of the AST_Try itself
        const parent_scope = node?.isAst?.('AST_Catch')
          ? save_scope.parent_scope
          : save_scope
        scope.init_scope_vars(parent_scope)
        scope.uses_with = save_scope.uses_with
        scope.uses_eval = save_scope.uses_eval
        if (options.safari10) {
          if (node?.isAst?.('AST_For') || node?.isAst?.('AST_ForIn')) {
            for_scopes.push(scope)
          }
        }

        if (node?.isAst?.('AST_Switch')) {
          // XXX: HACK! Ensure the switch expression gets the correct scope (the parent scope) and the body gets the contained scope
          // AST_Switch has a scope within the body, but it itself "is a block scope"
          // This means the switched expression has to belong to the outer scope
          // while the body inside belongs to the switch itself.
          // This is pretty nasty and warrants an AST change similar to AST_Try (read above)
          const the_block_scope = scope
          scope = save_scope
          node.expression.walk(tw)
          scope = the_block_scope
          for (let i = 0; i < node.body.length; i++) {
            node.body[i].walk(tw)
          }
        } else {
          descend()
        }
        scope = save_scope
        return true
      }
      if (node?.isAst?.('AST_Destructuring')) {
        const save_destructuring = in_destructuring
        in_destructuring = node
        descend()
        in_destructuring = save_destructuring
        return true
      }
      if (node?.isAst?.('AST_Scope')) {
                node.init_scope_vars?.(scope)
                var save_scope = scope
                var save_defun = defun
                var save_labels = labels
                defun = scope = node
                labels = new Map()
                descend()
                scope = save_scope
                defun = save_defun
                labels = save_labels
                return true // don't descend again in TreeWalker
      }
      if (node?.isAst?.('AST_LabeledStatement')) {
        var l = node.label
        if (labels.has(l.name)) {
          throw new Error(string_template('Label {name} defined twice', l))
        }
        labels.set(l.name, l)
        descend()
        labels.delete(l.name)
        return true // no descend again
      }
      if (node?.isAst?.('AST_With')) {
        for (var s: any | null = scope; s; s = s.parent_scope) { s.uses_with = true }
        return
      }
      if (node?.isAst?.('AST_Symbol')) {
        node.scope = scope
      }
      if (node?.isAst?.('AST_Label')) {
        // TODO: check type
        node.thedef = node
        node.references = [] as any
      }
      if (node?.isAst?.('AST_SymbolLambda')) {
        defun.def_function(node, node.name == 'arguments' ? undefined : defun)
      } else if (node?.isAst?.('AST_SymbolDefun')) {
        // Careful here, the scope where this should be defined is
        // the parent scope.  The reason is that we enter a new
        // scope when we encounter the AST_Defun node (which is
        // ?.isAst?.('AST_Scope')) but we get to the symbol a bit
        // later.
        mark_export((node.scope = defun.parent_scope.get_defun_scope()).def_function(node, defun), 1)
      } else if (node?.isAst?.('AST_SymbolClass')) {
        mark_export(defun.def_variable(node, defun), 1)
      } else if (node?.isAst?.('AST_SymbolImport')) {
        scope.def_variable(node)
      } else if (node?.isAst?.('AST_SymbolDefClass')) {
        // This deals with the name of the class being available
        // inside the class.
        mark_export((node.scope = defun.parent_scope).def_function(node, defun), 1)
      } else if (
        node?.isAst?.('AST_SymbolVar') ||
                node?.isAst?.('AST_SymbolLet') ||
                node?.isAst?.('AST_SymbolConst') ||
                node?.isAst?.('AST_SymbolCatch')
      ) {
        var def: any
        if (node?.isAst?.('AST_SymbolBlockDeclaration')) {
          def = scope.def_variable(node, null)
        } else {
          def = defun.def_variable(node, node.TYPE == 'SymbolVar' ? null : undefined)
        }
        if (!def.orig.every((sym) => {
          if (sym === node) return true
          if (node?.isAst?.('AST_SymbolBlockDeclaration')) {
            return sym?.isAst?.('AST_SymbolLambda')
          }
          return !(sym?.isAst?.('AST_SymbolLet') || sym?.isAst?.('AST_SymbolConst'))
        })) {
          js_error(
                        `"${node.name}" is redeclared`,
                        node.start.file,
                        node.start.line,
                        node.start.col,
                        node.start.pos
          )
        }
        if (!(node?.isAst?.('AST_SymbolFunarg'))) mark_export(def, 2)
        if (defun !== scope) {
          node.mark_enclosed()
          const def = scope.find_variable(node)
          if (node.thedef !== def) {
            node.thedef = def
            node.reference()
          }
        }
      } else if (node?.isAst?.('AST_LabelRef')) {
        var sym = labels.get(node.name)
        if (!sym) {
          throw new Error(string_template('Undefined label {name} [{line},{col}]', {
            name: node.name,
            line: node.start.line,
            col: node.start.col
          }))
        }
        node.thedef = sym
      }
      if (!(scope?.isAst?.('AST_Toplevel')) && (node?.isAst?.('AST_Export') || node?.isAst?.('AST_Import'))) {
        js_error(
                    `"${node.TYPE}" statement may only appear at the top level`,
                    node.start.file,
                    node.start.line,
                    node.start.col,
                    node.start.pos
        )
      }
    })
    this.walk(tw)

    function mark_export (def: any, level: number) {
      if (in_destructuring) {
        var i = 0
        do {
          level++
        } while (tw.parent(i++) !== in_destructuring)
      }
      var node = tw.parent(level)
      if (def.export = node?.isAst?.('AST_Export') ? MASK_EXPORT_DONT_MANGLE : 0) {
        var exported = node.exported_definition
        if ((exported?.isAst?.('AST_Defun') || exported?.isAst?.('AST_DefClass')) && node.is_default) {
          def.export = MASK_EXPORT_WANT_MANGLE
        }
      }
    }

    // pass 2: find back references and eval
    const is_toplevel = this?.isAst?.('AST_Toplevel')
    if (is_toplevel) {
      this.globals = new Map()
    }

    var tw = new TreeWalker((node: any) => {
      if (node?.isAst?.('AST_LoopControl') && node.label) {
        node.label.thedef.references.push(node) // TODO: check type
        return true
      }
      if (node?.isAst?.('AST_SymbolRef')) {
        var name = node.name
        if (name == 'eval' && tw.parent()?.isAst?.('AST_Call')) {
          for (var s: any = node.scope; s && !s.uses_eval; s = s.parent_scope) {
            s.uses_eval = true
          }
        }
        var sym
        if (tw.parent()?.isAst?.('AST_NameMapping') && tw.parent(1).module_name ||
                    !(sym = node.scope.find_variable(name))) {
          sym = toplevel.def_global?.(node)
          if (node?.isAst?.('AST_SymbolExport')) sym.export = MASK_EXPORT_DONT_MANGLE
        } else if (sym.scope?.isAst?.('AST_Lambda') && name == 'arguments') {
          sym.scope.uses_arguments = true
        }
        node.thedef = sym
        node.reference()
        if (node.scope.is_block_scope() &&
                    !(sym.orig[0]?.isAst?.('AST_SymbolBlockDeclaration'))) {
          node.scope = node.scope.get_defun_scope()
        }
        return true
      }
      // ensure mangling works if catch reuses a scope variable
      var def
      if (node?.isAst?.('AST_SymbolCatch') && (def = redefined_catch_def(node.definition()))) {
        let s: any = node.scope
        while (s) {
          push_uniq(s.enclosed, def)
          if (s === def.scope) break
          s = s.parent_scope
        }
      }
    })
    this.walk(tw)

    // pass 3: work around IE8 and Safari catch scope bugs
    if (options.ie8 || options.safari10) {
      walk(this, (node: any) => {
        if (node?.isAst?.('AST_SymbolCatch')) {
          var name = node.name
          var refs = node.thedef.references
          var scope = node.scope.get_defun_scope()
          var def = scope.find_variable(name) ||
                        toplevel.globals.get(name) ||
                        scope.def_variable(node)
          refs.forEach(function (ref) {
            ref.thedef = def
            ref.reference()
          })
          node.thedef = def
          node.reference()
          return true
        }
      })
    }

    // pass 4: add symbol definitions to loop scopes
    // Safari/Webkit bug workaround - loop init let variable shadowing argument.
    // https://github.com/mishoo/UglifyJS2/issues/1753
    // https://bugs.webkit.org/show_bug.cgi?id=171041
    if (options.safari10) {
      for (const scope of for_scopes) {
                scope.parent_scope?.variables.forEach(function (def) {
                  push_uniq(scope.enclosed, def)
                })
      }
    }
  }

  static documentation = 'Base class for all statements introducing a lexical scope'
  static propdoc = {
    variables: '[Map/S] a map of name -> SymbolDef for all variables/functions defined in this scope',
    functions: '[Map/S] like `variables`, but only lists function declarations',
    uses_with: '[boolean/S] tells whether this scope uses the `with` statement',
    uses_eval: '[boolean/S] tells whether this scope contains a direct call to the global `eval`',
    parent_scope: '[AST_Scope?/S] link to the parent scope',
    enclosed: '[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes',
    cname: '[integer/S] current index for mangling variables (used internally by the mangler)'
  } as any

  static PROPS = AST_Block.PROPS.concat(['variables', 'functions', 'uses_with', 'uses_eval', 'parent_scope', 'enclosed', 'cname', '_var_name_cache'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.variables = args.variables
    this.functions = args.functions
    this.uses_with = args.uses_with
    this.uses_eval = args.uses_eval
    this.parent_scope = args.parent_scope
    this.enclosed = args.enclosed
    this.cname = args.cname
    this._var_name_cache = args._var_name_cache
  }
}

class AST_Toplevel extends AST_Scope {
  variables: any
  globals: any
  mangled_names: any

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    this.globals.forEach(function (def) {
      reset_def(compressor, def)
    })
    reset_variables(tw, compressor, this)
  }

  resolve_defines (compressor: any) {
    if (!compressor.option('global_defs')) return this
    this.figure_out_scope({ ie8: compressor.option('ie8') })
    return this.transform(new TreeTransformer(function (node: any) {
      var def = node._find_defs(compressor, '')
      if (!def) return
      var level = 0; var child = node; var parent
      while (parent = this.parent(level++)) {
        if (!(parent?.isAst?.('AST_PropAccess'))) break
        if (parent.expression !== child) break
        child = parent
      }
      if (is_lhs(child, parent)) {
        warn(compressor, node)
        return
      }
      return def
    }))
  }

  reset_opt_flags (compressor: any) {
    const self = this
    const reduce_vars = compressor.option('reduce_vars')

    const preparation = new TreeWalker(function (node: any, descend) {
      clear_flag(node, CLEAR_BETWEEN_PASSES)
      if (reduce_vars) {
        if (compressor.top_retain &&
                  node?.isAst?.('AST_Defun') && // Only functions are retained
                  preparation.parent() === self
        ) {
          set_flag(node, TOP)
        }
        return node.reduce_vars(preparation, descend, compressor)
      }
    })
    // Stack of look-up tables to keep track of whether a `SymbolDef` has been
    // properly assigned before use:
    // - `push()` & `pop()` when visiting conditional branches
    preparation.safe_ids = Object.create(null)
    preparation.in_loop = null
    preparation.loop_ids = new Map()
    preparation.defs_to_safe_ids = new Map()
    self.walk(preparation)
  }

  drop_console () {
    return this.transform(new TreeTransformer(function (self) {
      if (self.TYPE == 'Call') {
        var exp = self.expression
        if (exp?.isAst?.('AST_PropAccess')) {
          var name = exp.expression
          while (name.expression) {
            name = name.expression
          }
          if (is_undeclared_ref(name) && name.name == 'console') {
            return make_node('AST_Undefined', self)
          }
        }
      }
    }))
  }

  def_global (node: any) {
    var globals = this.globals; var name = node.name
    if (globals.has(name)) {
      return globals.get(name)
    } else {
      var g = new SymbolDef(this, node)
      g.undeclared = true
      g.global = true
      globals.set(name, g)
      return g
    }
  }

  is_block_scope = return_false
  next_mangled (options: any) {
    let name
    const mangled_names = this.mangled_names
    do {
      name = next_mangled(this, options)
    } while (mangled_names.has(name))
    return name
  }

  _default_mangler_options (options: any) {
    options = defaults(options, {
      eval: false,
      ie8: false,
      keep_classnames: false,
      keep_fnames: false,
      module: false,
      reserved: [],
      toplevel: false
    })
    if (options.module) options.toplevel = true
    let reserved: string[] | Set<string> | undefined = options.reserved
    if (!Array.isArray(options.reserved) &&
          !(options.reserved instanceof Set)
    ) {
      reserved = []
    }
    options.reserved = new Set(reserved)
    // Never mangle arguments
    options.reserved.add('arguments')
    return options
  }

  wrap_commonjs (name: string) {
    var body = this.body
    var _wrapped_tl = "(function(exports){'$ORIG';})(typeof " + name + "=='undefined'?(" + name + '={}):' + name + ');'
    var wrapped_tl = parse(_wrapped_tl)
    wrapped_tl = wrapped_tl.transform(new TreeTransformer(function (node: any) {
      if (node?.isAst?.('AST_Directive') && node.value == '$ORIG') {
        return MAP.splice(body)
      }
      return undefined
    }))
    return wrapped_tl
  }

  wrap_enclose (args_values: string) {
    if (typeof args_values !== 'string') args_values = ''
    var index = args_values.indexOf(':')
    if (index < 0) index = args_values.length
    var body = this.body
    return parse([
      '(function(',
      args_values.slice(0, index),
      '){"$ORIG"})(',
      args_values.slice(index + 1),
      ')'
    ].join('')).transform(new TreeTransformer(function (node: any) {
      if (node?.isAst?.('AST_Directive') && node.value == '$ORIG') {
        return MAP.splice(body)
      }
      return undefined
    }))
  }

  shallow_cmp = pass_through
  _size = function () {
    return list_overhead(this.body)
  }

  _to_mozilla_ast (parent) {
    return to_moz_scope('Program', this)
  }

  _codegen (self, output) {
    display_body(self.body as any[], true, output, true)
    output.print('')
  }

  add_source_map = noop
  compute_char_frequency (options: any) {
    printMangleOptions = this._default_mangler_options(options)
    try {
      base54.consider(this.print_to_string(), 1)
    } finally {
      printMangleOptions = undefined
    }
    base54.sort()
  }

  expand_names (options: any) {
    base54.reset()
    base54.sort()
    options = this._default_mangler_options(options)
    var avoid = this.find_colliding_names(options)
    var cname = 0
    this.globals.forEach(rename)
    this.walk(new TreeWalker(function (node: any) {
      if (node?.isAst?.('AST_Scope')) node.variables.forEach(rename)
      if (node?.isAst?.('AST_SymbolCatch')) rename(node.definition())
    }))

    function next_name () {
      var name
      do {
        name = base54(cname++)
      } while (avoid.has(name) || RESERVED_WORDS.has(name))
      return name
    }

    function rename (def: any) {
      if (def.global && options.cache) return
      if (def.unmangleable(options)) return
      if (options.reserved?.has(def.name)) return
      const redefinition = redefined_catch_def(def)
      const name = def.name = redefinition ? redefinition.name : next_name()
      def.orig.forEach(function (sym) {
        sym.name = name
      })
      def.references.forEach(function (sym) {
        sym.name = name
      })
    }
  }

  find_colliding_names (options: any) {
    const cache = options.cache && options.cache.props
    const avoid = new Set()
      options.reserved?.forEach(to_avoid)
      this.globals.forEach(add_def)
      this.walk(new TreeWalker(function (node: any) {
        if (node?.isAst?.('AST_Scope')) node.variables.forEach(add_def)
        if (node?.isAst?.('AST_SymbolCatch')) add_def(node.definition())
      }))
      return avoid

      function to_avoid (name: string) {
        avoid.add(name)
      }

      function add_def (def: any) {
        var name = def.name
        if (def.global && cache && cache.has(name)) name = cache.get(name) as string
        else if (!def.unmangleable(options)) return
        to_avoid(name)
      }
  }

  mangle_names (options: any) {
    options = this._default_mangler_options(options)

    // We only need to mangle declaration nodes.  Special logic wired
    // into the code generator will display the mangled name if it's
    // present (and for AST_SymbolRef-s it'll use the mangled name of
    // the AST_SymbolDeclaration that it points to).
    var lname = -1
    var to_mangle: any[] = []

    if (options.keep_fnames) {
      setFunctionDefs(new Set())
    }

    const mangled_names = this.mangled_names = new Set()
    if (options.cache) {
      this.globals.forEach(collect)
      if (options.cache.props) {
        options.cache.props.forEach(function (mangled_name) {
          mangled_names.add(mangled_name)
        })
      }
    }

    var tw = new TreeWalker(function (node: any, descend) {
      if (node?.isAst?.('AST_LabeledStatement')) {
        // lname is incremented when we get to the AST_Label
        var save_nesting = lname
        descend()
        lname = save_nesting
        return true // don't descend again in TreeWalker
      }
      if (node?.isAst?.('AST_Scope')) {
        node.variables.forEach(collect)
        return
      }
      if (node.is_block_scope()) {
              node.block_scope?.variables.forEach(collect)
              return
      }
      if (
        function_defs &&
              node?.isAst?.('AST_VarDef') &&
              node.value?.isAst?.('AST_Lambda') &&
              !node.value.name &&
              keep_name(options.keep_fnames, node.name.name)
      ) {
        function_defs.add(node.name.definition?.().id)
        return
      }
      if (node?.isAst?.('AST_Label')) {
        let name
        do {
          name = base54(++lname)
        } while (RESERVED_WORDS.has(name))
        node.mangled_name = name
        return true
      }
      if (!(options.ie8 || options.safari10) && node?.isAst?.('AST_SymbolCatch')) {
        to_mangle.push(node.definition())
      }
    })

    this.walk(tw)

    if (options.keep_fnames || options.keep_classnames) {
      unmangleable_names = new Set()
      // Collect a set of short names which are unmangleable,
      // for use in avoiding collisions in next_mangled.
      to_mangle.forEach(def => {
        if (def.name.length < 6 && def.unmangleable(options)) {
                  unmangleable_names?.add(def.name)
        }
      })
    }

    to_mangle.forEach(def => { def.mangle(options) })

    setFunctionDefs(null)
    unmangleable_names = null

    function collect (symbol: any) {
      const should_mangle = !options.reserved?.has(symbol.name) &&
              !(symbol.export & MASK_EXPORT_DONT_MANGLE)
      if (should_mangle) {
        to_mangle.push(symbol)
      }
    }
  }

  static documentation = 'The toplevel scope'
  static propdoc = {
    globals: '[Map/S] a map of name -> SymbolDef for all undeclared names'
  }

  static PROPS = AST_Scope.PROPS.concat(['globals'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.globals = args.globals
  }
}

class AST_Lambda extends AST_Scope {
  argnames: any
  uses_arguments: any
  name: any
  is_generator: any
  async: any

  _optimize = opt_AST_Lambda
  may_throw = return_false
  has_side_effects = return_false
  _eval = return_this as any
  is_constant_expression = all_refs_local
  reduce_vars = mark_lambda
  contains_this () {
    return walk(this, (node: any) => {
      if (node?.isAst?.('AST_This')) return walk_abort
      if (
        node !== this &&
              node?.isAst?.('AST_Scope') &&
              !(node?.isAst?.('AST_Arrow'))
      ) {
        return true
      }
    })
  }

  is_block_scope = return_false
  init_scope_vars = function () {
    init_scope_vars.apply(this, arguments)
    this.uses_arguments = false
    this.def_variable(new AST_SymbolFunarg({
      name: 'arguments',
      start: this.start,
      end: this.end
    }))
  }

  args_as_names () {
    var out: any[] = []
    for (var i = 0; i < this.argnames.length; i++) {
      if (this.argnames[i]?.isAst?.('AST_Destructuring')) {
        out.push(...this.argnames[i].all_symbols())
      } else {
        out.push(this.argnames[i])
      }
    }
    return out
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      if (this.name) this.name._walk(visitor)
      var argnames = this.argnames
      for (var i = 0, len = argnames.length; i < len; i++) {
        argnames[i]._walk(visitor)
      }
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])

    i = this.argnames.length
    while (i--) push(this.argnames[i])

    if (this.name) push(this.name)
  }

  shallow_cmp = mkshallow({
    is_generator: 'eq',
    async: 'eq'
  })

  _transform (self, tw: any) {
    if (self.name) self.name = self.name.transform(tw)
    self.argnames = do_list(self.argnames, tw)
    if (self.body?.isAst?.('AST_Node')) {
      self.body = (self.body).transform(tw)
    } else {
      self.body = do_list(self.body, tw)
    }
  }

  _to_mozilla_ast (parent) {
    return To_Moz_FunctionExpression(this, parent)
  }

  _do_print (this: any, output: any, nokeyword: boolean) {
    var self = this
    if (!nokeyword) {
      if (self.async) {
        output.print('async')
        output.space()
      }
      output.print('function')
      if (self.is_generator) {
        output.star()
      }
      if (self.name) {
        output.space()
      }
    }
    if (self.name?.isAst?.('AST_Symbol')) {
      self.name.print(output)
    } else if (nokeyword && self.name?.isAst?.('AST_Node')) {
      output.with_square(function () {
                self.name?.print(output) // Computed method name
      })
    }
    output.with_parens(function () {
      self.argnames.forEach(function (arg, i) {
        if (i) output.comma()
        arg.print(output)
      })
    })
    output.space()
    print_braced(self, output, true)
  }

  _codegen (self, output) {
    self._do_print(output)
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for functions'
  static propdoc = {
    name: '[AST_SymbolDeclaration?] the name of this function',
    argnames: '[AST_SymbolFunarg|AST_Destructuring|AST_Expansion|AST_DefaultAssign*] array of function arguments, destructurings, or expanding arguments',
    uses_arguments: '[boolean/S] tells whether this function accesses the arguments array',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }

  static PROPS = AST_Scope.PROPS.concat(['name', 'argnames', 'uses_arguments', 'is_generator', 'async'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.name = args.name
    this.argnames = args.argnames
    this.uses_arguments = args.uses_arguments
    this.is_generator = args.is_generator
    this.async = args.async
  }
}

class AST_Accessor extends AST_Lambda {
  drop_side_effect_free = return_null
  reduce_vars = function (tw: TreeWalker, descend, compressor: any) {
    push(tw)
    reset_variables(tw, compressor, this)
    descend()
    pop(tw)
    return true
  }

  _size = function () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  static documentation = 'A setter/getter function.  The `name` property is always null.'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Function extends AST_Lambda {
  name: any

  _optimize = function (self, compressor) {
    self = opt_AST_Lambda(self, compressor)
    if (compressor.option('unsafe_arrows') &&
          compressor.option('ecma') >= 2015 &&
          !self.name &&
          !self.is_generator &&
          !self.uses_arguments &&
          !self.pinned()) {
      const has_special_symbol = walk(self, (node: any) => {
        if (node?.isAst?.('AST_This')) return walk_abort
      })
      if (!has_special_symbol) return make_node('AST_Arrow', self, self).optimize(compressor)
    }
    return self
  }

  drop_side_effect_free = return_null
  _eval = function (compressor: any) {
    if (compressor.option('unsafe')) {
      var fn: any = function () {}
      fn.node = this
      fn.toString = function () {
        return this.node.print_to_string()
      }
      return fn
    }
    return this
  }

  negate () {
    return basic_negation(this)
  }

  _dot_throw = return_false
  next_mangled (options: any, def: any) {
    // #179, #326
    // in Safari strict mode, something like (function x(x){...}) is a syntax error;
    // a function expression's argument cannot shadow the function expression's name

    var tricky_def = def.orig[0]?.isAst?.('AST_SymbolFunarg') && this.name && this.name.definition()

    // the function's mangled_name is null when keep_fnames is true
    var tricky_name = tricky_def ? tricky_def.mangled_name || tricky_def.name : null

    while (true) {
      var name = next_mangled(this, options)
      if (!tricky_name || tricky_name != name) { return name }
    }
  }

  _size = function (info: any) {
    const first: any = !!first_in_statement(info)
    return (first * 2) + lambda_modifiers(this) + 12 + list_overhead(this.argnames) + list_overhead(this.body)
  } as any

  _to_mozilla_ast (parent) {
    return To_Moz_FunctionExpression(this, parent)
  }

  // a function expression needs parens around it when it's provably
  // the first token to appear in a statement.
  needs_parens (output: any) {
    if (!output.has_parens() && first_in_statement(output)) {
      return true
    }

    if (output.option('webkit')) {
      var p = output.parent()
      if (p?._needs_parens(this)) { return true }
    }

    if (output.option('wrap_iife')) {
      var p = output.parent()
      if (p?.isAst?.('AST_Call') && p.expression === this) {
        return true
      }
    }

    if (output.option('wrap_func_args')) {
      var p = output.parent()
      if (p?.isAst?.('AST_Call') && p.args.includes(this)) {
        return true
      }
    }

    return false
  }

  static documentation = 'A function expression'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Arrow extends AST_Lambda {
  _optimize = opt_AST_Lambda
  drop_side_effect_free = return_null
  negate () {
    return basic_negation(this)
  }

  _dot_throw = return_false
  init_scope_vars = function () {
    init_scope_vars.apply(this, arguments)
    this.uses_arguments = false
  }

  _size = function (info?: any): number {
    let args_and_arrow = 2 + list_overhead(this.argnames)

    if (
      !(
        this.argnames.length === 1 &&
                this.argnames[0]?.isAst?.('AST_Symbol')
      )
    ) {
      args_and_arrow += 2
    }

    return lambda_modifiers(this) + args_and_arrow + (Array.isArray(this.body) ? list_overhead(this.body) : this.body._size())
  }

  _to_mozilla_ast (parent): any {
    var body = {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
    return {
      type: 'ArrowFunctionExpression',
      params: this.argnames.map(to_moz),
      async: this.async,
      body: body
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_PropAccess') && p.expression === this
  }

  _do_print (this: any, output: any) {
    var self = this
    var parent = output.parent()
    var needs_parens = (parent?.isAst?.('AST_Binary') && !(parent?.isAst?.('AST_Assign'))) ||
            parent?.isAst?.('AST_Unary') ||
            (parent?.isAst?.('AST_Call') && self === parent.expression)
    if (needs_parens) { output.print('(') }
    if (self.async) {
      output.print('async')
      output.space()
    }
    if (self.argnames.length === 1 && self.argnames[0]?.isAst?.('AST_Symbol')) {
      self.argnames[0].print(output)
    } else {
      output.with_parens(function () {
        self.argnames.forEach(function (arg, i) {
          if (i) output.comma()
          arg.print(output)
        })
      })
    }
    output.space()
    output.print('=>')
    output.space()
    const first_statement = self.body[0]
    if (
      self.body.length === 1 &&
            first_statement?.isAst?.('AST_Return')
    ) {
      const returned = first_statement.value
      if (!returned) {
        output.print('{}')
      } else if (left_is_object(returned)) {
        output.print('(')
                returned.print?.(output)
                output.print(')')
      } else {
                returned.print?.(output)
      }
    } else {
      print_braced(self, output)
    }
    if (needs_parens) { output.print(')') }
  }

  static documentation = 'An ES6 Arrow function ((a) => b)'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Defun extends AST_Lambda {
  name: any
  _size = function () {
    return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'FunctionDeclaration',
      id: to_moz(this.name),
      params: this.argnames.map(to_moz),
      generator: this.is_generator,
      async: this.async,
      body: to_moz_scope('BlockStatement', this)
    }
  }

  static documentation = 'A function definition'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

/* -----[ JUMPS ]----- */

/* -----[ IF ]----- */

/* -----[ SWITCH ]----- */

class AST_Switch extends AST_Block {
  _optimize (self, compressor) {
    if (!compressor.option('switches')) return self
    var branch
    var value = self.expression.evaluate(compressor)
    if (!(value?.isAst?.('AST_Node'))) {
      var orig = self.expression
      self.expression = make_node_from_constant(value, orig)
      self.expression = best_of_expression(self.expression.transform(compressor), orig)
    }
    if (!compressor.option('dead_code')) return self
    if (value?.isAst?.('AST_Node')) {
      value = self.expression.tail_node().evaluate(compressor)
    }
    var decl: any[] = []
    var body: any[] = []
    var default_branch
    var exact_match
    for (var i = 0, len = self.body.length; i < len && !exact_match; i++) {
      branch = self.body[i]
      if (branch?.isAst?.('AST_Default')) {
        if (!default_branch) {
          default_branch = branch
        } else {
          eliminate_branch(branch, body[body.length - 1])
        }
      } else if (!(value?.isAst?.('AST_Node'))) {
        var exp = branch.expression.evaluate(compressor)
        if (!(exp?.isAst?.('AST_Node')) && exp !== value) {
          eliminate_branch(branch, body[body.length - 1])
          continue
        }
        if (exp?.isAst?.('AST_Node')) exp = branch.expression.tail_node().evaluate(compressor)
        if (exp === value) {
          exact_match = branch
          if (default_branch) {
            var default_index = body.indexOf(default_branch)
            body.splice(default_index, 1)
            eliminate_branch(default_branch, body[default_index - 1])
            default_branch = null
          }
        }
      }
      if (aborts(branch)) {
        var prev = body[body.length - 1]
        if (aborts(prev) && prev.body.length == branch.body.length &&
                  make_node('AST_BlockStatement', prev, prev).equivalent_to(make_node('AST_BlockStatement', branch, branch))) {
          prev.body = []
        }
      }
      body.push(branch)
    }
    while (i < len) eliminate_branch(self.body[i++], body[body.length - 1])
    if (body.length > 0) {
      body[0].body = decl.concat(body[0].body)
    }
    self.body = body
    while (branch = body[body.length - 1]) {
      var stat = branch.body[branch.body.length - 1]
      if (stat?.isAst?.('AST_Break') && compressor.loopcontrol_target(stat) === self) { branch.body.pop() }
      if (branch.body.length || branch?.isAst?.('AST_Case') &&
              (default_branch || branch.expression.has_side_effects(compressor))) break
      if (body.pop() === default_branch) default_branch = null
    }
    if (body.length == 0) {
      return make_node('AST_BlockStatement', self, {
        body: decl.concat(make_node('AST_SimpleStatement', self.expression, {
          body: self.expression
        }))
      }).optimize(compressor)
    }
    if (body.length == 1 && (body[0] === exact_match || body[0] === default_branch)) {
      var has_break = false
      var tw = new TreeWalker(function (node: any) {
        if (has_break ||
                  node?.isAst?.('AST_Lambda') ||
                  node?.isAst?.('AST_SimpleStatement')) return true
        if (node?.isAst?.('AST_Break') && tw.loopcontrol_target(node) === self) { has_break = true }
      })
      self.walk(tw)
      if (!has_break) {
        var statements = body[0].body.slice()
        var exp = body[0].expression
        if (exp) {
          statements.unshift(make_node('AST_SimpleStatement', exp, {
            body: exp
          }))
        }
        statements.unshift(make_node('AST_SimpleStatement', self.expression, {
          body: self.expression
        }))
        return make_node('AST_BlockStatement', self, {
          body: statements
        }).optimize(compressor)
      }
    }
    return self

    function eliminate_branch (branch, prev) {
      if (prev && !aborts(prev)) {
        prev.body = prev.body.concat(branch.body)
      } else {
        extract_declarations_from_unreachable_code(compressor, branch, decl)
      }
    }
  }

  may_throw (compressor: any) {
    return this.expression.may_throw(compressor) ||
          anyMayThrow(this.body, compressor)
  }

  has_side_effects (compressor: any) {
    return this.expression.has_side_effects(compressor) ||
          anySideEffect(this.body, compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  _size (): number {
    return 8 + list_overhead(this.body)
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'SwitchStatement',
      discriminant: to_moz(this.expression),
      cases: this.body.map(to_moz)
    }
  }

  _codegen (self, output) {
    output.print('switch')
    output.space()
    output.with_parens(function () {
      self.expression.print(output)
    })
    output.space()
    var last = self.body.length - 1
    if (last < 0) print_braced_empty(self, output)
    else {
      output.with_block(function () {
        (self.body as any[]).forEach(function (branch, i) {
          output.indent(true)
          branch.print(output)
          if (i < last && branch.body.length > 0) { output.newline() }
        })
      })
    }
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A `switch` statement'
  static propdoc = {
    expression: '[AST_Node] the `switch` “discriminant”'
  }

  static PROPS = AST_Block.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}

/* -----[ EXCEPTIONS ]----- */

class AST_Try extends AST_Block {
  bfinally: any
  bcatch: any

  _optimize = function (self, compressor) {
    tighten_body(self.body, compressor)
    if (self.bcatch && self.bfinally && self.bfinally.body.every(is_empty)) self.bfinally = null
    if (compressor.option('dead_code') && self.body.every(is_empty)) {
      var body: any[] = []
      if (self.bcatch) {
        extract_declarations_from_unreachable_code(compressor, self.bcatch, body)
      }
      if (self.bfinally) body.push(...self.bfinally.body)
      return make_node('AST_BlockStatement', self, {
        body: body
      }).optimize(compressor)
    }
    return self
  }

  may_throw = function (compressor: any) {
    return this.bcatch ? this.bcatch.may_throw(compressor) : anyMayThrow(this.body, compressor) ||
          this.bfinally && this.bfinally.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return anySideEffect(this.body, compressor) ||
          this.bcatch && this.bcatch.has_side_effects(compressor) ||
          this.bfinally && this.bfinally.has_side_effects(compressor)
  }

  reduce_vars = function (tw: TreeWalker, descend, compressor: any) {
    reset_block_variables(compressor, this)
    push(tw)
    walk_body(this, tw)
    pop(tw)
    if (this.bcatch) {
      push(tw)
      this.bcatch.walk(tw)
      pop(tw)
    }
    if (this.bfinally) this.bfinally.walk(tw)
    return true
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      walk_body(this, visitor)
      if (this.bcatch) this.bcatch._walk(visitor)
      if (this.bfinally) this.bfinally._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.bfinally) push(this.bfinally)
    if (this.bcatch) push(this.bcatch)
    let i = this.body.length
    while (i--) push(this.body[i])
  }

  _size = function (): number {
    return 3 + list_overhead(this.body)
  }

  shallow_cmp = mkshallow({
    bcatch: 'exist',
    bfinally: 'exist'
  })

  _transform (self, tw: any) {
    self.body = do_list(self.body, tw)
    if (self.bcatch) self.bcatch = self.bcatch.transform(tw)
    if (self.bfinally) self.bfinally = self.bfinally.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'TryStatement',
      block: to_moz_block(this),
      handler: to_moz(this.bcatch),
      guardedHandlers: [],
      finalizer: to_moz(this.bfinally)
    }
  }

  _codegen = function (self, output) {
    output.print('try')
    output.space()
    print_braced(self, output)
    if (self.bcatch) {
      output.space()
      self.bcatch.print(output)
    }
    if (self.bfinally) {
      output.space()
      self.bfinally.print(output)
    }
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'A `try` statement'
  static propdoc = {
    bcatch: '[AST_Catch?] the catch block, or null if not present',
    bfinally: '[AST_Finally?] the finally block, or null if not present'
  }

  static PROPS = AST_Block.PROPS.concat(['bcatch', 'bfinally'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.bcatch = args.bcatch
    this.bfinally = args.bfinally
  }
}

class AST_Catch extends AST_Block {
  argname: any

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.argname) this.argname._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    if (this.argname) push(this.argname)
  }

  _size = function (): number {
    let size = 7 + list_overhead(this.body)
    if (this.argname) {
      size += 2
    }
    return size
  }

  shallow_cmp = mkshallow({
    argname: 'exist'
  })

  _transform (self, tw: any) {
    if (self.argname) self.argname = self.argname.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'CatchClause',
      param: to_moz(this.argname),
      guard: null,
      body: to_moz_block(this)
    }
  }

  _codegen = function (self, output) {
    output.print('catch')
    if (self.argname) {
      output.space()
      output.with_parens(function () {
        self.argname.print(output)
      })
    }
    output.space()
    print_braced(self, output)
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'A `catch` node; only makes sense as part of a `try` statement'
  static propdoc = {
    argname: '[AST_SymbolCatch|AST_Destructuring|AST_Expansion|AST_DefaultAssign] symbol for the exception'
  }

  static PROPS = AST_Block.PROPS.concat(['argname'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.argname = args.argname
  }
}

class AST_Finally extends AST_Block {
  argname: any
  shallow_cmp = pass_through
  _size = function (): number {
    return 7 + list_overhead(this.body)
  }

  _codegen = function (self, output) {
    output.print('finally')
    output.space()
    print_braced(self, output)
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static documentation = 'A `finally` node; only makes sense as part of a `try` statement'

  static PROPS = AST_Block.PROPS.concat(['argname'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.argname = args.argname
  }
}

/* -----[ VAR/CONST ]----- */

class AST_VarDef extends AST_Node {
  name: any
  value: any

  may_throw (compressor: any) {
    if (!this.value) return false
    return this.value.may_throw(compressor)
  }

  has_side_effects () {
    return this.value
  }

  reduce_vars (tw, descend) {
    var node = this
    if (node.name?.isAst?.('AST_Destructuring')) {
      suppress(node.name)
      return
    }
    var d = node.name.definition?.()
    if (node.value) {
      if (safe_to_assign(tw, d, node.name.scope, node.value)) {
        d.fixed = function () {
          return node.value
        }
        tw.loop_ids.set(d.id, tw.in_loop)
        mark(tw, d, false)
        descend()
        mark(tw, d, true)
        return true
      } else {
        d.fixed = false
      }
    }
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.name._walk(visitor)
      if (this.value) this.value._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.value) push(this.value)
    push(this.name)
  }

  _size (): number {
    return this.value ? 1 : 0
  }

  shallow_cmp = mkshallow({
    value: 'exist'
  })

  _transform (self, tw: any) {
    self.name = self.name.transform(tw)
    if (self.value) self.value = self.value.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'VariableDeclarator',
      id: to_moz(this.name),
      init: to_moz(this.value)
    }
  }

  _codegen (self, output) {
    self.name.print(output)
    if (self.value) {
      output.space()
      output.print('=')
      output.space()
      var p = output.parent(1)
      var noin = p?.isAst?.('AST_For') || p?.isAst?.('AST_ForIn')
      parenthesize_for_noin(self.value, output, noin)
    }
  }

  static documentation = 'A variable declaration; only appears in a AST_Definitions node'
  static propdoc = {
    name: '[AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar] name of the variable',
    value: "[AST_Node?] initializer, or null of there's no initializer"
  }

  static PROPS = AST_Node.PROPS.concat(['name', 'value'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.name = args.name
    this.value = args.value
  }
}

class AST_NameMapping extends AST_Node {
  name: any
  foreign_name: any

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.foreign_name._walk(visitor)
      this.name._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.name)
    push(this.foreign_name)
  }

  _size (): number {
    // foreign name isn't mangled
    return this.name ? 4 : 0
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.foreign_name = self.foreign_name.transform(tw)
    self.name = self.name.transform(tw)
  }

  _codegen (self, output) {
    var is_import = output.parent()?.isAst?.('AST_Import')
    var definition = self.name.definition()
    var names_are_different =
            (definition && definition.mangled_name || self.name.name) !==
            self.foreign_name.name
    if (names_are_different) {
      if (is_import) {
        output.print(self.foreign_name.name)
      } else {
        self.name.print(output)
      }
      output.space()
      output.print('as')
      output.space()
      if (is_import) {
        self.name.print(output)
      } else {
        output.print(self.foreign_name.name)
      }
    } else {
      self.name.print(output)
    }
  }

  static documentation = 'The part of the export/import statement that declare names from a module.'
  static propdoc = {
    foreign_name: '[AST_SymbolExportForeign|AST_SymbolImportForeign] The name being exported/imported (as specified in the module)',
    name: '[AST_SymbolExport|AST_SymbolImport] The name as it is visible to this module.'
  }

  static PROPS = AST_Node.PROPS.concat(['foreign_name', 'name'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.foreign_name = args.foreign_name
    this.name = args.name
  }
}

class AST_Import extends AST_Node {
  imported_name: any
  module_name: any
  imported_names: any

  _optimize (self) {
    return self
  }

  aborts () { return null }
  _walk (visitor: any) {
    return visitor._visit(this, function (this: any) {
      if (this.imported_name) {
        this.imported_name._walk(visitor)
      }
      if (this.imported_names) {
        this.imported_names.forEach(function (name_import) {
          name_import._walk(visitor)
        })
      }
      this.module_name._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.module_name)
    if (this.imported_names) {
      let i = this.imported_names.length
      while (i--) push(this.imported_names[i])
    }
    if (this.imported_name) push(this.imported_name)
  }

  _size (): number {
    // import
    let size = 6

    if (this.imported_name) size += 1

    // from
    if (this.imported_name || this.imported_names) size += 5

    // braces, and the commas
    if (this.imported_names) {
      size += 2 + list_overhead(this.imported_names)
    }

    return size
  }

  shallow_cmp = mkshallow({
    imported_name: 'exist',
    imported_names: 'exist'
  })

  _transform (self, tw: any) {
    if (self.imported_name) self.imported_name = self.imported_name.transform(tw)
    if (self.imported_names) do_list(self.imported_names, tw)
    self.module_name = self.module_name.transform(tw)
  }

  _to_mozilla_ast (parent) {
    var specifiers: any[] = []
    if (this.imported_name) {
      specifiers.push({
        type: 'ImportDefaultSpecifier',
        local: to_moz(this.imported_name)
      })
    }
    if (this.imported_names && this.imported_names[0].foreign_name.name === '*') {
      specifiers.push({
        type: 'ImportNamespaceSpecifier',
        local: to_moz(this.imported_names[0].name)
      })
    } else if (this.imported_names) {
      this.imported_names.forEach(function (name_mapping) {
        specifiers.push({
          type: 'ImportSpecifier',
          local: to_moz(name_mapping.name),
          imported: to_moz(name_mapping.foreign_name)
        })
      })
    }
    return {
      type: 'ImportDeclaration',
      specifiers: specifiers,
      source: to_moz(this.module_name)
    }
  }

  _codegen (self, output) {
    output.print('import')
    output.space()
    if (self.imported_name) {
      self.imported_name.print(output)
    }
    if (self.imported_name && self.imported_names) {
      output.print(',')
      output.space()
    }
    if (self.imported_names) {
      if (self.imported_names.length === 1 && self.imported_names[0].foreign_name.name === '*') {
        self.imported_names[0].print(output)
      } else {
        output.print('{')
        self.imported_names.forEach(function (name_import, i) {
          output.space()
          name_import.print(output)
          if (i < self.imported_names.length - 1) {
            output.print(',')
          }
        })
        output.space()
        output.print('}')
      }
    }
    if (self.imported_name || self.imported_names) {
      output.space()
      output.print('from')
      output.space()
    }
    self.module_name.print(output)
    output.semicolon()
  }

  static documentation = 'An `import` statement'
  static propdoc = {
    imported_name: "[AST_SymbolImport] The name of the variable holding the module's default export.",
    imported_names: '[AST_NameMapping*] The names of non-default imported variables',
    module_name: '[AST_String] String literal describing where this module came from'
  }

  static PROPS = AST_Node.PROPS.concat(['imported_name', 'imported_names', 'module_name'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.imported_name = args.imported_name
    this.imported_names = args.imported_names
    this.module_name = args.module_name
  }
}

/* -----[ OTHER ]----- */

class AST_Call extends AST_Node {
  _annotations: any
  expression: any
  args: any[]

  _optimize (self, compressor) {
    var exp = self.expression
    var fn = exp
    inline_array_like_spread(self, compressor, self.args)
    var simple_args = self.args.every((arg) =>
      !(arg?.isAst?.('AST_Expansion'))
    )
    if (compressor.option('reduce_vars') &&
          fn?.isAst?.('AST_SymbolRef') &&
          !has_annotation(self, _NOINLINE)
    ) {
      const fixed = fn.fixed_value()
      if (!retain_top_func(fixed, compressor)) {
        fn = fixed
      }
    }
    var is_func = fn?.isAst?.('AST_Lambda')
    if (compressor.option('unused') &&
          simple_args &&
          is_func &&
          !fn.uses_arguments &&
          !fn.pinned()) {
      var pos = 0; var last = 0
      for (var i = 0, len = self.args.length; i < len; i++) {
        if (fn.argnames[i]?.isAst?.('AST_Expansion')) {
          if (has_flag(fn.argnames[i].expression, UNUSED)) {
            while (i < len) {
              var node = self.args[i++].drop_side_effect_free(compressor)
              if (node) {
                self.args[pos++] = node
              }
            }
          } else {
            while (i < len) {
              self.args[pos++] = self.args[i++]
            }
          }
          last = pos
          break
        }
        var trim = i >= fn.argnames.length
        if (trim || has_flag(fn.argnames[i], UNUSED)) {
          var node = self.args[i].drop_side_effect_free(compressor)
          if (node) {
            self.args[pos++] = node
          } else if (!trim) {
            self.args[pos++] = make_node('AST_Number', self.args[i], {
              value: 0
            })
            continue
          }
        } else {
          self.args[pos++] = self.args[i]
        }
        last = pos
      }
      self.args.length = last
    }
    if (compressor.option('unsafe')) {
      if (is_undeclared_ref(exp)) {
        switch (exp.name) {
          case 'Array':
            if (self.args.length != 1) {
              return make_node('AST_Array', self, {
                elements: self.args
              }).optimize(compressor)
            } else if (self.args[0]?.isAst?.('AST_Number') && self.args[0].value <= 11) {
              const elements: any[] = []
              for (let i = 0; i < self.args[0].value; i++) elements.push(new AST_Hole())
              return new AST_Array({ elements })
            }
            break
          case 'Object':
            if (self.args.length == 0) {
              return make_node('AST_Object', self, {
                properties: []
              })
            }
            break
          case 'String':
            if (self.args.length == 0) {
              return make_node('AST_String', self, {
                value: ''
              })
            }
            if (self.args.length <= 1) {
              return make_node('AST_Binary', self, {
                left: self.args[0],
                operator: '+',
                right: make_node('AST_String', self, { value: '' })
              }).optimize(compressor)
            }
            break
          case 'Number':
            if (self.args.length == 0) {
              return make_node('AST_Number', self, {
                value: 0
              })
            }
            if (self.args.length == 1 && compressor.option('unsafe_math')) {
              return make_node('AST_UnaryPrefix', self, {
                expression: self.args[0],
                operator: '+'
              }).optimize(compressor)
            }
            break
          case 'Symbol':
            if (self.args.length == 1 && self.args[0]?.isAst?.('AST_String') && compressor.option('unsafe_symbols')) { self.args.length = 0 }
            break
          case 'Boolean':
            if (self.args.length == 0) return make_node('AST_False', self)
            if (self.args.length == 1) {
              return make_node('AST_UnaryPrefix', self, {
                expression: make_node('AST_UnaryPrefix', self, {
                  expression: self.args[0],
                  operator: '!'
                }),
                operator: '!'
              }).optimize(compressor)
            }
            break
          case 'RegExp':
            var params: any[] = []
            if (self.args.length >= 1 &&
                  self.args.length <= 2 &&
                  self.args.every((arg) => {
                    var value = arg.evaluate(compressor)
                    params.push(value)
                    return arg !== value
                  })
            ) {
              let [source, flags] = params
              source = regexp_source_fix(new RegExp(source).source)
              const rx = make_node('AST_RegExp', self, {
                value: { source, flags }
              })
              if (rx._eval(compressor) !== rx) {
                return rx
              }
              compressor.warn('Error converting {expr} [{file}:{line},{col}]', {
                expr: self.print_to_string(),
                file: self.start.file,
                line: self.start.line,
                col: self.start.col
              })
            }
            break
        }
      } else if (exp?.isAst?.('AST_Dot')) {
        switch (exp.property) {
          case 'toString':
            if (self.args.length == 0 && !exp.expression.may_throw_on_access(compressor)) {
              return make_node('AST_Binary', self, {
                left: make_node('AST_String', self, { value: '' }),
                operator: '+',
                right: exp.expression
              }).optimize(compressor)
            }
            break
          case 'join':
            if (exp.expression?.isAst?.('AST_Array')) {
              EXIT: {
                var separator
                if (self.args.length > 0) {
                  separator = self.args[0].evaluate(compressor)
                  if (separator === self.args[0]) break EXIT // not a constant
                }
                var elements: any[] = []
                var consts: any[] = []
                for (let i = 0, len = exp.expression.elements.length; i < len; i++) {
                  var el = exp.expression.elements[i]
                  if (el?.isAst?.('AST_Expansion')) break EXIT
                  var value = el.evaluate(compressor)
                  if (value !== el) {
                    consts.push(value)
                  } else {
                    if (consts.length > 0) {
                      elements.push(make_node('AST_String', self, {
                        value: consts.join(separator)
                      }))
                      consts.length = 0
                    }
                    elements.push(el)
                  }
                }
                if (consts.length > 0) {
                  elements.push(make_node('AST_String', self, {
                    value: consts.join(separator)
                  }))
                }
                if (elements.length == 0) return make_node('AST_String', self, { value: '' })
                if (elements.length == 1) {
                  if (elements[0].is_string(compressor)) {
                    return elements[0]
                  }
                  return make_node('AST_Binary', elements[0], {
                    operator: '+',
                    left: make_node('AST_String', self, { value: '' }),
                    right: elements[0]
                  })
                }
                if (separator == '') {
                  var first
                  if (elements[0].is_string(compressor) ||
                          elements[1].is_string(compressor)) {
                    first = elements.shift()
                  } else {
                    first = make_node('AST_String', self, { value: '' })
                  }
                  return elements.reduce(function (prev, el) {
                    return make_node('AST_Binary', el, {
                      operator: '+',
                      left: prev,
                      right: el
                    })
                  }, first).optimize(compressor)
                }
                // need this awkward cloning to not affect original element
                // best_of will decide which one to get through.
                var node = self.clone()
                node.expression = node.expression.clone()
                node.expression.expression = node.expression.expression.clone()
                node.expression.expression.elements = elements
                return best_of(compressor, self, node)
              }
            }
            break
          case 'charAt':
            if (exp.expression.is_string(compressor)) {
              var arg = self.args[0]
              var index = arg ? arg.evaluate(compressor) : 0
              if (index !== arg) {
                return make_node('AST_Sub', exp, {
                  expression: exp.expression,
                  property: make_node_from_constant(index | 0, arg || exp)
                }).optimize(compressor)
              }
            }
            break
          case 'apply':
            if (self.args.length == 2 && self.args[1]?.isAst?.('AST_Array')) {
              var args = self.args[1].elements.slice()
              args.unshift(self.args[0])
              return make_node('AST_Call', self, {
                expression: make_node('AST_Dot', exp, {
                  expression: exp.expression,
                  property: 'call'
                }),
                args: args
              }).optimize(compressor)
            }
            break
          case 'call':
            var func = exp.expression
            if (func?.isAst?.('AST_SymbolRef')) {
              func = func.fixed_value()
            }
            if (func?.isAst?.('AST_Lambda') && !func.contains_this()) {
              return (self.args.length ? make_sequence(this, [
                self.args[0],
                make_node('AST_Call', self, {
                  expression: exp.expression,
                  args: self.args.slice(1)
                })
              ]) : make_node('AST_Call', self, {
                expression: exp.expression,
                args: []
              })).optimize(compressor)
            }
            break
        }
      }
    }
    if (compressor.option('unsafe_Function') &&
          is_undeclared_ref(exp) &&
          exp.name == 'Function') {
      // new Function() => function(){}
      if (self.args.length == 0) {
        return make_node('AST_Function', self, {
          argnames: [],
          body: []
        }).optimize(compressor)
      }
      if (self.args.every((x) =>
        x?.isAst?.('AST_String')
      )) {
        // quite a corner-case, but we can handle it:
        //   https://github.com/mishoo/UglifyJS2/issues/203
        // if the code argument is a constant, then we can minify it.
        try {
          var code = 'n(function(' + self.args.slice(0, -1).map(function (arg) {
            return arg.value
          }).join(',') + '){' + self.args[self.args.length - 1].value + '})'
          var ast = parse(code)
          var mangle = { ie8: compressor.option('ie8') }
          ast.figure_out_scope(mangle)
          var comp = new Compressor(compressor.options)
          ast = ast.transform(comp)
          ast.figure_out_scope(mangle)
          base54.reset()
          ast.compute_char_frequency(mangle)
          ast.mangle_names(mangle)
          var fun
          walk(ast, (node: any) => {
            if (is_func_expr(node)) {
              fun = node
              return walk_abort
            }
          })
          const code2 = OutputStream()
          blockStateMentCodeGen.call(fun, fun, code2)
          self.args = [
            make_node('AST_String', self, {
              value: fun.argnames.map(function (arg) {
                return arg.print_to_string()
              }).join(',')
            }),
            make_node('AST_String', self.args[self.args.length - 1], {
              value: code2.get().replace(/^{|}$/g, '')
            })
          ]
          return self
        } catch (ex) {
          if (ex instanceof JS_Parse_Error) {
            compressor.warn('Error parsing code passed to new Function [{file}:{line},{col}]', self.args[self.args.length - 1].start)
            compressor.warn(ex.toString())
          } else {
            throw ex
          }
        }
      }
    }
    var stat = is_func && fn.body[0]
    var is_regular_func = is_func && !fn.is_generator && !fn.async
    var can_inline = is_regular_func && compressor.option('inline') && !self.is_expr_pure(compressor)
    if (can_inline && stat?.isAst?.('AST_Return')) {
      let returned = stat.value
      if (!returned || returned.is_constant_expression()) {
        if (returned) {
          returned = returned.clone(true)
        } else {
          returned = make_node('AST_Undefined', self)
        }
        const args = self.args.concat(returned)
        return make_sequence(self, args).optimize(compressor)
      }

      // optimize identity function
      if (
        fn.argnames.length === 1 &&
              (fn.argnames[0]?.isAst?.('AST_SymbolFunarg')) &&
              self.args.length < 2 &&
              returned?.isAst?.('AST_SymbolRef') &&
              returned.name === fn.argnames[0].name
      ) {
        let parent
        if (
          self.args[0]?.isAst?.('AST_PropAccess') &&
                  (parent = compressor.parent())?.isAst?.('AST_Call') &&
                  parent.expression === self
        ) {
          // identity function was being used to remove `this`, like in
          //
          // id(bag.no_this)(...)
          //
          // Replace with a larger but more effish (0, bag.no_this) wrapper.

          return make_sequence(self, [
            make_node('AST_Number', self, { value: 0 }),
            self.args[0].optimize(compressor)
          ])
        }
        // replace call with first argument or undefined if none passed
        return (self.args[0] || make_node('AST_Undefined')).optimize(compressor)
      }
    }
    if (can_inline) {
      var scope; var in_loop; var level = -1
      let def
      let returned_value
      let nearest_scope
      if (simple_args &&
              !fn.uses_arguments &&
              !fn.pinned() &&
              !(compressor.parent()?.isAst?.('AST_Class')) &&
              !(fn.name && fn?.isAst?.('AST_Function')) &&
              (returned_value = can_flatten_body(stat)) &&
              (exp === fn ||
                  has_annotation(self, _INLINE) ||
                  compressor.option('unused') &&
                      (def = exp.definition?.()).references.length == 1 &&
                      !recursive_ref(compressor, def) &&
                      fn.is_constant_expression(exp.scope)) &&
              !has_annotation(self, _PURE | _NOINLINE) &&
              !fn.contains_this() &&
              can_inject_symbols() &&
              (nearest_scope = find_scope(compressor)) &&
              !scope_encloses_variables_in_this_scope(nearest_scope, fn) &&
              !(function in_default_assign () {
                // Due to the fact function parameters have their own scope
                // which can't use `var something` in the function body within,
                // we simply don't inline into DefaultAssign.
                let i = 0
                let p
                while ((p = compressor.parent(i++))) {
                  if (p?.isAst?.('AST_DefaultAssign')) return true
                  if (p?.isAst?.('AST_Block')) break
                }
                return false
              })() &&
              !(scope?.isAst?.('AST_Class'))
      ) {
        set_flag(fn, SQUEEZED)
        nearest_scope.add_child_scope(fn)
        return make_sequence(self, flatten_fn(returned_value)).optimize(compressor)
      }
    }
    const can_drop_this_call = is_regular_func && compressor.option('side_effects') && fn.body.every(is_empty)
    if (can_drop_this_call) {
      const args = self.args.concat(make_node('AST_Undefined', self))
      return make_sequence(self, args).optimize(compressor)
    }
    if (compressor.option('negate_iife') &&
          compressor.parent()?.isAst?.('AST_SimpleStatement') &&
          is_iife_call(self)) {
      return self.negate(compressor, true)
    }
    var ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self

    function return_value (stat) {
      if (!stat) return make_node('AST_Undefined', self)
      if (stat?.isAst?.('AST_Return')) {
        if (!stat.value) return make_node('AST_Undefined', self)
        return stat.value.clone(true)
      }
      if (stat?.isAst?.('AST_SimpleStatement')) {
        return make_node('AST_UnaryPrefix', stat, {
          operator: 'void',
          expression: (stat.body).clone(true)
        })
      }
    }

    function can_flatten_body (stat) {
      var body = fn.body
      var len = body.length
      if (compressor.option('inline') < 3) {
        return len == 1 && return_value(stat)
      }
      stat = null
      for (var i = 0; i < len; i++) {
        var line = body[i]
        if (line?.isAst?.('AST_Var')) {
          if (stat && !line.definitions.every((var_def) =>
            !var_def.value
          )) {
            return false
          }
        } else if (stat) {
          return false
        } else if (!(line?.isAst?.('AST_EmptyStatement'))) {
          stat = line
        }
      }
      return return_value(stat)
    }

    function can_inject_args (block_scoped, safe_to_inject) {
      for (var i = 0, len = fn.argnames.length; i < len; i++) {
        var arg = fn.argnames[i]
        if (arg?.isAst?.('AST_DefaultAssign')) {
          if (has_flag(arg.left, UNUSED)) continue
          return false
        }
        if (arg?.isAst?.('AST_Destructuring')) return false
        if (arg?.isAst?.('AST_Expansion')) {
          if (has_flag(arg.expression, UNUSED)) continue
          return false
        }
        if (has_flag(arg, UNUSED)) continue
        if (!safe_to_inject ||
                  block_scoped.has(arg.name) ||
                  identifier_atom.has(arg.name) ||
                  scope.var_names().has(arg.name)) {
          return false
        }
        if (in_loop) in_loop.push(arg.definition?.())
      }
      return true
    }

    function can_inject_args_values () {
      var arg_vals_outer_refs = new Set()
      const value_walker = (node: any) => {
        if (node?.isAst?.('AST_Scope')) {
          var scope_outer_refs = new Set()
          node.enclosed.forEach(function (def) {
            scope_outer_refs.add(def.name)
          })
          node.variables.forEach(function (name) {
            scope_outer_refs.delete(name)
          })
          scope_outer_refs.forEach(function (name) {
            arg_vals_outer_refs.add(name)
          })
          return true
        }
      }
      for (let i = 0; i < self.args.length; i++) {
        walk(self.args[i], value_walker)
      }
      if (arg_vals_outer_refs.size == 0) return true
      for (let i = 0, len = fn.argnames.length; i < len; i++) {
        var arg = fn.argnames[i]
        if (arg?.isAst?.('AST_DefaultAssign') && has_flag(arg.left, UNUSED)) continue
        if (arg?.isAst?.('AST_Expansion') && has_flag(arg.expression, UNUSED)) continue
        if (has_flag(arg, UNUSED)) continue
        if (arg_vals_outer_refs.has(arg.name)) return false
      }
      for (let i = 0, len = fn.body.length; i < len; i++) {
        var stat = fn.body[i]
        if (!(stat?.isAst?.('AST_Var'))) continue
        for (var j = stat.definitions.length; --j >= 0;) {
          var name = stat.definitions[j].name
          if (name?.isAst?.('AST_Destructuring') ||
                      arg_vals_outer_refs.has(name.name)) {
            return false
          }
        }
      }
      return true
    }

    function can_inject_vars (block_scoped, safe_to_inject) {
      var len = fn.body.length
      for (var i = 0; i < len; i++) {
        var stat = fn.body[i]
        if (!(stat?.isAst?.('AST_Var'))) continue
        if (!safe_to_inject) return false
        for (var j = stat.definitions.length; --j >= 0;) {
          var name = stat.definitions[j].name
          if (name?.isAst?.('AST_Destructuring') ||
                      block_scoped.has(name.name) ||
                      identifier_atom.has(name.name) ||
                      scope.var_names().has(name.name)) {
            return false
          }
          if (in_loop) in_loop.push(name.definition?.())
        }
      }
      return true
    }

    function can_inject_symbols () {
      var block_scoped = new Set()
      do {
        scope = compressor.parent(++level)
        if (scope.is_block_scope() && scope.block_scope) {
          // TODO this is sometimes undefined during compression.
          // But it should always have a value!
          scope.block_scope.variables.forEach(function (variable) {
            block_scoped.add(variable.name)
          })
        }
        if (scope?.isAst?.('AST_Catch')) {
          // TODO can we delete? AST_Catch is a block scope.
          if (scope.argname) {
            block_scoped.add(scope.argname.name)
          }
        } else if (scope?.isAst?.('AST_IterationStatement')) {
          in_loop = []
        } else if (scope?.isAst?.('AST_SymbolRef')) {
          if (scope.fixed_value()?.isAst?.('AST_Scope')) return false
        }
      } while (!(scope?.isAst?.('AST_Scope')))

      var safe_to_inject = !(scope?.isAst?.('AST_Toplevel')) || compressor.toplevel.vars
      var inline = compressor.option('inline')
      if (!can_inject_vars(block_scoped, inline >= 3 && safe_to_inject)) return false
      if (!can_inject_args(block_scoped, inline >= 2 && safe_to_inject)) return false
      if (!can_inject_args_values()) return false
      return !in_loop || in_loop.length == 0 || !is_reachable(fn, in_loop)
    }

    function append_var (decls, expressions, name, value) {
      var def = name.definition?.()
      scope.variables.set(name.name, def)
      scope.enclosed.push(def)
      if (!scope.var_names().has(name.name)) {
        scope.add_var_name(name.name)
        decls.push(make_node('AST_VarDef', name, {
          name: name,
          value: null
        }))
      }
      var sym = make_node('AST_SymbolRef', name, name)
      def.references.push(sym)
      if (value) {
        expressions.push(make_node('AST_Assign', self, {
          operator: '=',
          left: sym,
          right: value.clone()
        }))
      }
    }

    function flatten_args (decls, expressions) {
      var len = fn.argnames.length
      for (var i = self.args.length; --i >= len;) {
        expressions.push(self.args[i])
      }
      for (i = len; --i >= 0;) {
        var name = fn.argnames[i]
        var value = self.args[i]
        if (has_flag(name, UNUSED) || !name.name || scope.var_names().has(name.name)) {
          if (value) expressions.push(value)
        } else {
          var symbol = make_node('AST_SymbolVar', name, name)
                  name.definition?.().orig.push(symbol)
                  if (!value && in_loop) value = make_node('AST_Undefined', self)
                  append_var(decls, expressions, symbol, value)
        }
      }
      decls.reverse()
      expressions.reverse()
    }

    function flatten_vars (decls, expressions) {
      var pos = expressions.length
      for (var i = 0, lines = fn.body.length; i < lines; i++) {
        var stat = fn.body[i]
        if (!(stat?.isAst?.('AST_Var'))) continue
        for (var j = 0, defs = stat.definitions.length; j < defs; j++) {
          var var_def = stat.definitions[j]
          var name = var_def.name
          append_var(decls, expressions, name, var_def.value)
          if (in_loop && fn.argnames.every((argname) =>
            argname.name != name.name
          )) {
            var def = fn.variables.get(name.name)
            var sym = make_node('AST_SymbolRef', name, name)
            def.references.push(sym)
            expressions.splice(pos++, 0, make_node('AST_Assign', var_def, {
              operator: '=',
              left: sym,
              right: make_node('AST_Undefined', name)
            }))
          }
        }
      }
    }

    function flatten_fn (returned_value) {
      var decls: any[] = []
      var expressions: any[] = []
      flatten_args(decls, expressions)
      flatten_vars(decls, expressions)
      expressions.push(returned_value)
      if (decls.length) {
        const i = scope.body.indexOf(compressor.parent(level - 1)) + 1
        scope.body.splice(i, 0, make_node('AST_Var', fn, {
          definitions: decls
        }))
      }
      return expressions.map(exp => exp.clone(true))
    }
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    if (!this.is_expr_pure(compressor)) {
      if (this.expression.is_call_pure(compressor)) {
        var exprs = this.args.slice()
        exprs.unshift(this.expression.expression)
        exprs = trim(exprs, compressor, first_in_statement)
        return exprs && make_sequence(this, exprs)
      }
      if (is_func_expr(this.expression) &&
              (!this.expression.name || !this.expression.name.definition?.().references.length)) {
        var node = this.clone()
        node.expression.process_expression(false, compressor)
        return node
      }
      return this
    }
    if (has_annotation(this, _PURE)) {
      compressor.warn('Dropping __PURE__ call [{file}:{line},{col}]', this.start)
    }
    var args = trim(this.args, compressor, first_in_statement)
    return args && make_sequence(this, args)
  }

  may_throw (compressor: any) {
    if (anyMayThrow(this.args, compressor)) return true
    if (this.is_expr_pure(compressor)) return false
    if (this.expression.may_throw(compressor)) return true
    return !(this.expression?.isAst?.('AST_Lambda')) ||
          anyMayThrow(this.expression.body, compressor)
  }

  has_side_effects (compressor: any) {
    if (!this.is_expr_pure(compressor) &&
          (!this.expression.is_call_pure(compressor) ||
              this.expression.has_side_effects(compressor))) {
      return true
    }
    return anySideEffect(this.args, compressor)
  }

  _eval (compressor: any, depth) {
    var exp = this.expression
    if (compressor.option('unsafe') && exp?.isAst?.('AST_PropAccess')) {
      var key = exp.property
      if (key?.isAst?.('AST_Node')) {
        key = key._eval?.(compressor, depth)
        if (key === exp.property) return this
      }
      var val
      var e = exp.expression
      if (is_undeclared_ref(e)) {
        var first_arg =
                  e.name === 'hasOwnProperty' &&
                  key === 'call' &&
                  (this.args[0] && this.args[0].evaluate(compressor))

        first_arg = first_arg?.isAst?.('AST_Dot') ? first_arg.expression : first_arg

        if ((first_arg == null || first_arg.thedef && first_arg.thedef.undeclared)) {
          return this.clone()
        }
        var static_fn = static_fns.get(e.name)
        if (!static_fn || !static_fn.has(key)) return this
        val = global_objs[e.name]
      } else {
        val = e._eval(compressor, depth + 1)
        if (val === e || !val) return this
        var native_fn = native_fns.get(val.constructor.name)
        if (!native_fn || !native_fn.has(key)) return this
      }
      var args: any[] = []
      for (var i = 0, len = this.args.length; i < len; i++) {
        var arg = this.args[i]
        var value = arg._eval(compressor, depth)
        if (arg === value) return this
        args.push(value)
      }
      try {
        return val[key as string].apply(val, args)
      } catch (ex) {
        compressor.warn('Error evaluating {code} [{file}:{line},{col}]', {
          code: this.print_to_string(),
          file: this.start.file,
          line: this.start.line,
          col: this.start.col
        })
      }
    }
    return this
  }

  is_expr_pure (compressor: any) {
    if (compressor.option('unsafe')) {
      var expr = this.expression
      var first_arg = (this.args && this.args[0] && this.args[0].evaluate(compressor))
      if (
        expr.expression && expr.expression.name === 'hasOwnProperty' &&
              (first_arg == null || first_arg.thedef && first_arg.thedef.undeclared)
      ) {
        return false
      }
      if (is_undeclared_ref(expr) && global_pure_fns.has(expr.name)) return true
      let static_fn
      if (expr?.isAst?.('AST_Dot') &&
              is_undeclared_ref(expr.expression) &&
              (static_fn = static_fns.get(expr.expression.name)) &&
              static_fn.has(expr.property)) {
        return true
      }
    }
    return !!has_annotation(this, _PURE) || !compressor.pure_funcs(this)
  }

  initialize () {
    if (this._annotations == null) this._annotations = 0
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      var args = this.args
      for (var i = 0, len = args.length; i < len; i++) {
        args[i]._walk(visitor)
      }
      this.expression._walk(visitor) // TODO why do we need to crawl this last?
    })
  }

  _children_backwards (push: Function) {
    let i = this.args.length
    while (i--) push(this.args[i])
    push(this.expression)
  }

  _size (): number {
    return 2 + list_overhead(this.args)
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.args = do_list(self.args, tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'CallExpression',
      callee: to_moz(this.expression),
      arguments: this.args.map(to_moz)
    }
  }

  needs_parens (output: any) {
    var p = output.parent(); var p1
    if (p?.isAst?.('AST_New') && p.expression === this ||
            p?.isAst?.('AST_Export') && p.is_default && this.expression?.isAst?.('AST_Function')) { return true }

    // workaround for Safari bug.
    // https://bugs.webkit.org/show_bug.cgi?id=123506
    return this.expression?.isAst?.('AST_Function') &&
            p?.isAst?.('AST_PropAccess') &&
            p.expression === this &&
            (p1 = output.parent(1))?.isAst?.('AST_Assign') &&
            p1.left === p
  }

  _codegen = callCodeGen
  static documentation = 'A function call expression'
  static propdoc = {
    expression: '[AST_Node] expression to invoke as function',
    args: '[AST_Node*] array of arguments',
    _annotations: '[number] bitfield containing information about the call'
  }

  static PROPS = AST_Node.PROPS.concat(['expression', 'args', '_annotations'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.args = args.args
    this._annotations = args._annotations
    this.initialize()
  }
}

class AST_New extends AST_Call {
  _optimize (self, compressor) {
    if (
      compressor.option('unsafe') &&
          is_undeclared_ref(self.expression) &&
          ['Object', 'RegExp', 'Function', 'Error', 'Array'].includes(self.expression.name)
    ) return make_node('AST_Call', self, self).transform(compressor)
    return self
  }

  _eval = return_this
  _size (): number {
    return 6 + list_overhead(this.args)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'NewExpression',
      callee: to_moz(this.expression),
      arguments: this.args.map(to_moz)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    if (this.args.length === 0 &&
            (p?.isAst?.('AST_PropAccess') || // (new Date).getTime(), (new Date)["getTime"]()
                p?.isAst?.('AST_Call') && p.expression === this)) // (new foo)(bar)
    { return true }
    return undefined
  }

  _codegen = function (self, output) {
    output.print('new')
    output.space()
    callCodeGen(self, output)
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'An object instantiation.  Derives from a function call since it has exactly the same properties'

  static PROPS = AST_Call.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Unary extends AST_Node {
  operator: any
  expression: any
  drop_side_effect_free (compressor: any, first_in_statement) {
    if (unary_side_effects.has(this.operator)) {
      if (!this.expression.has_side_effects(compressor)) {
        set_flag(this, WRITE_ONLY)
      } else {
        clear_flag(this, WRITE_ONLY)
      }
      return this
    }
    if (this.operator == 'typeof' && this.expression?.isAst?.('AST_SymbolRef')) return null
    var expression = this.expression.drop_side_effect_free(compressor, first_in_statement)
    if (first_in_statement && expression && is_iife_call(expression)) {
      if (expression === this.expression && this.operator == '!') return this
      return expression.negate(compressor, first_in_statement)
    }
    return expression
  }

  may_throw (compressor: any) {
    if (this.operator == 'typeof' && this.expression?.isAst?.('AST_SymbolRef')) { return false }
    return this.expression.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return unary_side_effects.has(this.operator) ||
          this.expression.has_side_effects(compressor)
  }

  is_constant_expression () {
    return this.expression.is_constant_expression()
  }

  is_number () {
    return unary.has(this.operator)
  }

  reduce_vars (tw) {
    var node = this
    if (node.operator !== '++' && node.operator !== '--') return
    var exp = node.expression
    if (!(exp?.isAst?.('AST_SymbolRef'))) return
    var def = exp.definition?.()
    var safe = safe_to_assign(tw, def, exp.scope, true)
    def.assignments++
    if (!safe) return
    var fixed = def.fixed
    if (!fixed) return
    def.references.push(exp)
    def.chained = true
    def.fixed = function () {
      return make_node('AST_Binary', node, {
        operator: node.operator.slice(0, -1),
        left: make_node('AST_UnaryPrefix', node, {
          operator: '+',
          expression: fixed?.isAst?.('AST_Node') ? fixed : fixed()
        }),
        right: make_node('AST_Number', node, {
          value: 1
        })
      })
    }
    mark(tw, def, true)
    return true
  }

  lift_sequences (compressor: any) {
    if (compressor.option('sequences')) {
      if (this.expression?.isAst?.('AST_Sequence')) {
        var x = this.expression.expressions.slice()
        var e = this.clone()
        e.expression = x.pop()
        x.push(e)
        return make_sequence(this, x).optimize(compressor)
      }
    }
    return this
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size (): number {
    if (this.operator === 'typeof') return 7
    if (this.operator === 'void') return 5
    return this.operator.length
  }

  shallow_cmp = mkshallow({ operator: 'eq' })
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: this.operator == '++' || this.operator == '--' ? 'UpdateExpression' : 'UnaryExpression',
      operator: this.operator,
      prefix: this?.isAst?.('AST_UnaryPrefix'),
      argument: to_moz(this.expression)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_PropAccess') && p.expression === this ||
            p?.isAst?.('AST_Call') && p.expression === this ||
            p?.isAst?.('AST_Binary') &&
                p.operator === '**' &&
                this?.isAst?.('AST_UnaryPrefix') &&
                p.left === this &&
                this.operator !== '++' &&
                this.operator !== '--'
  }

  static documentation = 'Base class for unary expressions'
  static propdoc = {
    operator: '[string] the operator',
    expression: '[AST_Node] expression that this unary operator applies to'
  }

  static PROPS = AST_Node.PROPS.concat(['operator', 'expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.operator = args.operator
    this.expression = args.expression
  }
}

class AST_UnaryPrefix extends AST_Unary {
  _optimize (self, compressor) {
    var e = self.expression
    if (self.operator == 'delete' &&
          !(e?.isAst?.('AST_SymbolRef') ||
              e?.isAst?.('AST_PropAccess') ||
              is_identifier_atom(e))) {
      if (e?.isAst?.('AST_Sequence')) {
        const exprs = e.expressions.slice()
        exprs.push(make_node('AST_True', self))
        return make_sequence(self, exprs).optimize(compressor)
      }
      return make_sequence(self, [e, make_node('AST_True', self)]).optimize(compressor)
    }
    var seq = self.lift_sequences(compressor)
    if (seq !== self) {
      return seq
    }
    if (compressor.option('side_effects') && self.operator == 'void') {
      e = e.drop_side_effect_free(compressor)
      if (e) {
        self.expression = e
        return self
      } else {
        return make_node('AST_Undefined', self).optimize(compressor)
      }
    }
    if (compressor.in_boolean_context()) {
      switch (self.operator) {
        case '!':
          if (e?.isAst?.('AST_UnaryPrefix') && e.operator == '!') {
            // !!foo ==> foo, if we're in boolean context
            return e.expression
          }
          if (e?.isAst?.('AST_Binary')) {
            self = best_of(compressor, self, e.negate(compressor, first_in_statement(compressor)))
          }
          break
        case 'typeof':
          // typeof always returns a non-empty string, thus it's
          // always true in booleans
          compressor.warn('Boolean expression always true [{file}:{line},{col}]', self.start)
          return (e?.isAst?.('AST_SymbolRef') ? make_node('AST_True', self) : make_sequence(self, [
            e,
            make_node('AST_True', self)
          ])).optimize(compressor)
      }
    }
    if (self.operator == '-' && e?.isAst?.('AST_Infinity')) {
      e = e.transform(compressor)
    }
    if (e?.isAst?.('AST_Binary') &&
          (self.operator == '+' || self.operator == '-') &&
          (e.operator == '*' || e.operator == '/' || e.operator == '%')) {
      return make_node('AST_Binary', self, {
        operator: e.operator,
        left: make_node('AST_UnaryPrefix', e.left, {
          operator: self.operator,
          expression: e.left
        }),
        right: e.right
      })
    }
    // avoids infinite recursion of numerals
    if (self.operator != '-' ||
          !(e?.isAst?.('AST_Number') || e?.isAst?.('AST_Infinity') || e?.isAst?.('AST_BigInt'))) {
      var ev = self.evaluate(compressor)
      if (ev !== self) {
        ev = make_node_from_constant(ev, self).optimize(compressor)
        return best_of(compressor, ev, self)
      }
    }
    return self
  }

  _eval (compressor: any, depth) {
    var e = this.expression
    // Function would be evaluated to an array and so typeof would
    // incorrectly return 'object'. Hence making is a special case.
    if (compressor.option('typeofs') &&
          this.operator == 'typeof' &&
          (e?.isAst?.('AST_Lambda') ||
              e?.isAst?.('AST_SymbolRef') &&
                  e.fixed_value()?.isAst?.('AST_Lambda'))) {
      return typeof function () {}
    }
    if (!non_converting_unary.has(this.operator)) depth++
    e = e._eval(compressor, depth)
    if (e === this.expression) return this
    switch (this.operator) {
      case '!': return !e
      case 'typeof':
        // typeof <RegExp> returns "object" or "function" on different platforms
        // so cannot evaluate reliably
        if (e instanceof RegExp) return this
        return typeof e
      case 'void': return void e
      case '~': return ~e
      case '-': return -e
      case '+': return +e
    }
    return this
  }

  negate () {
    if (this.operator == '!') { return this.expression }
    return basic_negation(this)
  }

  is_string () {
    return this.operator == 'typeof'
  }

  is_boolean () {
    return unary_bool.has(this.operator)
  }

  _dot_throw () {
    return this.operator == 'void'
  }

  _codegen (self, output) {
    var op = self.operator
    output.print(op)
    if (/^[a-z]/i.test(op) ||
            (/[+-]$/.test(op) &&
                self.expression?.isAst?.('AST_UnaryPrefix') &&
                /^[+-]/.test(self.expression.operator))) {
      output.space()
    }
    self.expression.print(output)
  }

  static documentation = 'Unary prefix expression, i.e. `typeof i` or `++i`'

  static PROPS = AST_Unary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_UnaryPostfix extends AST_Unary {
  _optimize (self, compressor) {
    return self.lift_sequences(compressor)
  }

  _dot_throw = return_false
  _codegen (self, output) {
    self.expression.print(output)
    output.print(self.operator)
  }

  static documentation = 'Unary postfix expression, i.e. `i++`'

  static PROPS = AST_Unary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Binary extends AST_Node {
  left: any
  operator: any
  right: any

  _codegen_should_output_space (child: AST_Node) {
    return /^\w/.test(this.operator) && this.left === child
  }

  _optimize (self, compressor) {
    function reversible () {
      return self.left.is_constant() ||
              self.right.is_constant() ||
              !self.left.has_side_effects(compressor) &&
                  !self.right.has_side_effects(compressor)
    }
    function reverse (op?) {
      if (reversible()) {
        if (op) self.operator = op
        var tmp = self.left
        self.left = self.right
        self.right = tmp
      }
    }
    if (commutativeOperators.has(self.operator)) {
      if (self.right.is_constant() &&
              !self.left.is_constant()) {
        // if right is a constant, whatever side effects the
        // left side might have could not influence the
        // result.  hence, force switch.

        if (!(self.left?.isAst?.('AST_Binary') &&
                    PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
          reverse()
        }
      }
    }
    self = self.lift_sequences(compressor)
    var is_strict_comparison: any
    if (compressor.option('comparisons')) {
      switch (self.operator) {
        case '===':
        case '!==':
          is_strict_comparison = true
          if ((self.left.is_string(compressor) && self.right.is_string(compressor)) ||
              (self.left.is_number(compressor) && self.right.is_number(compressor)) ||
              (self.left.is_boolean() && self.right.is_boolean()) ||
              self.left.equivalent_to(self.right)) {
            self.operator = self.operator.substr(0, 2)
          }
        // XXX: intentionally falling down to the next case
        case '==':
        case '!=':
        // void 0 == x => null == x
          if (!is_strict_comparison && is_undefined(self.left, compressor)) {
            self.left = make_node('AST_Null', self.left)
          } else if (compressor.option('typeofs') &&
              // "undefined" == typeof x => undefined === x
              self.left?.isAst?.('AST_String') &&
              self.left.value == 'undefined' &&
              self.right?.isAst?.('AST_UnaryPrefix') &&
              self.right.operator == 'typeof') {
            var expr = self.right.expression
            if (expr?.isAst?.('AST_SymbolRef') ? expr.is_declared(compressor)
              : !(expr?.isAst?.('AST_PropAccess') && compressor.option('ie8'))) {
              self.right = expr
              self.left = make_node('AST_Undefined', self.left).optimize(compressor)
              if (self.operator.length == 2) self.operator += '='
            }
          } else if (self.left?.isAst?.('AST_SymbolRef') &&
              // obj !== obj => false
              self.right?.isAst?.('AST_SymbolRef') &&
              self.left.definition?.() === self.right.definition?.() &&
              is_object(self.left.fixed_value())) {
            return make_node(self.operator[0] == '=' ? 'AST_True' : 'AST_False', self)
          }
          break
        case '&&':
        case '||':
          var lhs = self.left
          if (lhs.operator == self.operator) {
            lhs = lhs.right
          }
          if (lhs?.isAst?.('AST_Binary') &&
              lhs.operator == (self.operator == '&&' ? '!==' : '===') &&
              self.right?.isAst?.('AST_Binary') &&
              lhs.operator == self.right.operator &&
              (is_undefined(lhs.left, compressor) && self.right.left?.isAst?.('AST_Null') ||
                  lhs.left?.isAst?.('AST_Null') && is_undefined(self.right.left, compressor)) &&
              !lhs.right.has_side_effects(compressor) &&
              lhs.right.equivalent_to(self.right.right)) {
            var combined = make_node('AST_Binary', self, {
              operator: lhs.operator.slice(0, -1),
              left: make_node('AST_Null', self),
              right: lhs.right
            })
            if (lhs !== self.left) {
              combined = make_node('AST_Binary', self, {
                operator: self.operator,
                left: self.left.left,
                right: combined
              })
            }
            return combined
          }
          break
      }
    }
    if (self.operator == '+' && compressor.in_boolean_context()) {
      var ll = self.left.evaluate(compressor)
      var rr = self.right.evaluate(compressor)
      if (ll && typeof ll === 'string') {
        compressor.warn('+ in boolean context always true [{file}:{line},{col}]', self.start)
        return make_sequence(self, [
          self.right,
          make_node('AST_True', self)
        ]).optimize(compressor)
      }
      if (rr && typeof rr === 'string') {
        compressor.warn('+ in boolean context always true [{file}:{line},{col}]', self.start)
        return make_sequence(self, [
          self.left,
          make_node('AST_True', self)
        ]).optimize(compressor)
      }
    }
    if (compressor.option('comparisons') && self.is_boolean()) {
      if (!(compressor.parent()?.isAst?.('AST_Binary')) ||
              compressor.parent()?.isAst?.('AST_Assign')) {
        var negated = make_node('AST_UnaryPrefix', self, {
          operator: '!',
          expression: self.negate(compressor, first_in_statement(compressor))
        })
        self = best_of(compressor, self, negated)
      }
      if (compressor.option('unsafe_comps')) {
        switch (self.operator) {
          case '<': reverse('>'); break
          case '<=': reverse('>='); break
        }
      }
    }
    if (self.operator == '+') {
      if (self.right?.isAst?.('AST_String') &&
              self.right.getValue() == '' &&
              self.left.is_string(compressor)) {
        return self.left
      }
      if (self.left?.isAst?.('AST_String') &&
              self.left.getValue() == '' &&
              self.right.is_string(compressor)) {
        return self.right
      }
      if (self.left?.isAst?.('AST_Binary') &&
              self.left.operator == '+' &&
              self.left.left?.isAst?.('AST_String') &&
              self.left.left.getValue() == '' &&
              self.right.is_string(compressor)) {
        self.left = self.left.right
        return self.transform(compressor)
      }
    }
    if (compressor.option('evaluate')) {
      switch (self.operator) {
        case '&&':
          var ll = has_flag(self.left, TRUTHY)
            ? true
            : has_flag(self.left, FALSY)
              ? false
              : self.left.evaluate(compressor)
          if (!ll) {
            compressor.warn('Condition left of && always false [{file}:{line},{col}]', self.start)
            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor)
          } else if (!(ll?.isAst?.('AST_Node'))) {
            compressor.warn('Condition left of && always true [{file}:{line},{col}]', self.start)
            return make_sequence(self, [self.left, self.right]).optimize(compressor)
          }
          var rr = self.right.evaluate(compressor)
          if (!rr) {
            if (compressor.in_boolean_context()) {
              compressor.warn('Boolean && always false [{file}:{line},{col}]', self.start)
              return make_sequence(self, [
                self.left,
                make_node('AST_False', self)
              ]).optimize(compressor)
            } else {
              set_flag(self, FALSY)
            }
          } else if (!(rr?.isAst?.('AST_Node'))) {
            var parent = compressor.parent()
            if (parent.operator == '&&' && parent.left === compressor.self() || compressor.in_boolean_context()) {
              compressor.warn('Dropping side-effect-free && [{file}:{line},{col}]', self.start)
              return self.left.optimize(compressor)
            }
          }
          // x || false && y ---> x ? y : false
          if (self.left.operator == '||') {
            var lr = self.left.right.evaluate(compressor)
            if (!lr) {
              return make_node('AST_Conditional', self, {
                condition: self.left.left,
                consequent: self.right,
                alternative: self.left.right
              }).optimize(compressor)
            }
          }
          break
        case '||':
          var ll = has_flag(self.left, TRUTHY)
            ? true
            : has_flag(self.left, FALSY)
              ? false
              : self.left.evaluate(compressor)
          if (!ll) {
            compressor.warn('Condition left of || always false [{file}:{line},{col}]', self.start)
            return make_sequence(self, [self.left, self.right]).optimize(compressor)
          } else if (!(ll?.isAst?.('AST_Node'))) {
            compressor.warn('Condition left of || always true [{file}:{line},{col}]', self.start)
            return maintain_this_binding(compressor.parent(), compressor.self(), self.left).optimize(compressor)
          }
          var rr = self.right.evaluate(compressor)
          if (!rr) {
            var parent = compressor.parent()
            if (parent.operator == '||' && parent.left === compressor.self() || compressor.in_boolean_context()) {
              compressor.warn('Dropping side-effect-free || [{file}:{line},{col}]', self.start)
              return self.left.optimize(compressor)
            }
          } else if (!(rr?.isAst?.('AST_Node'))) {
            if (compressor.in_boolean_context()) {
              compressor.warn('Boolean || always true [{file}:{line},{col}]', self.start)
              return make_sequence(self, [
                self.left,
                make_node('AST_True', self)
              ]).optimize(compressor)
            } else {
              set_flag(self, TRUTHY)
            }
          }
          if (self.left.operator == '&&') {
            var lr = self.left.right.evaluate(compressor)
            if (lr && !(lr?.isAst?.('AST_Node'))) {
              return make_node('AST_Conditional', self, {
                condition: self.left.left,
                consequent: self.left.right,
                alternative: self.right
              }).optimize(compressor)
            }
          }
          break
        case '??':
          if (is_nullish(self.left)) {
            return self.right
          }

          var ll = self.left.evaluate(compressor)
          if (!(ll?.isAst?.('AST_Node'))) {
            // if we know the value for sure we can simply compute right away.
            return ll == null ? self.right : self.left
          }

          if (compressor.in_boolean_context()) {
            const rr = self.right.evaluate(compressor)
            if (!(rr?.isAst?.('AST_Node')) && !rr) {
              return self.left
            }
          }
      }
      var associative = true
      switch (self.operator) {
        case '+':
          // "foo" + ("bar" + x) => "foobar" + x
          if (self.left?.isAst?.('AST_Constant') &&
                  self.right?.isAst?.('AST_Binary') &&
                  self.right.operator == '+' &&
                  self.right.is_string(compressor)) {
            var binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left,
              right: self.right.left
            })
            var l = binary.optimize(compressor)
            if (binary !== l) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: l,
                right: self.right.right
              })
            }
          }
          // (x + "foo") + "bar" => x + "foobar"
          if (self.right?.isAst?.('AST_Constant') &&
                  self.left?.isAst?.('AST_Binary') &&
                  self.left.operator == '+' &&
                  self.left.is_string(compressor)) {
            var binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left.right,
              right: self.right
            })
            var r = binary.optimize(compressor)
            if (binary !== r) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: self.left.left,
                right: r
              })
            }
          }
          // (x + "foo") + ("bar" + y) => (x + "foobar") + y
          if (self.left?.isAst?.('AST_Binary') &&
                  self.left.operator == '+' &&
                  self.left.is_string(compressor) &&
                  self.right?.isAst?.('AST_Binary') &&
                  self.right.operator == '+' &&
                  self.right.is_string(compressor)) {
            var binary = make_node('AST_Binary', self, {
              operator: '+',
              left: self.left.right,
              right: self.right.left
            })
            var m = binary.optimize(compressor)
            if (binary !== m) {
              self = make_node('AST_Binary', self, {
                operator: '+',
                left: make_node('AST_Binary', self.left, {
                  operator: '+',
                  left: self.left.left,
                  right: m
                }),
                right: self.right.right
              })
            }
          }
          // a + -b => a - b
          if (self.right?.isAst?.('AST_UnaryPrefix') &&
                  self.right.operator == '-' &&
                  self.left.is_number(compressor)) {
            self = make_node('AST_Binary', self, {
              operator: '-',
              left: self.left,
              right: self.right.expression
            })
            break
          }
          // -a + b => b - a
          if (self.left?.isAst?.('AST_UnaryPrefix') &&
                  self.left.operator == '-' &&
                  reversible() &&
                  self.right.is_number(compressor)) {
            self = make_node('AST_Binary', self, {
              operator: '-',
              left: self.right,
              right: self.left.expression
            })
            break
          }
          // `foo${bar}baz` + 1 => `foo${bar}baz1`
          if (self.left?.isAst?.('AST_TemplateString')) {
            var l = self.left
            var r = self.right.evaluate(compressor)
            if (r != self.right) {
              l.segments[l.segments.length - 1].value += r.toString()
              return l
            }
          }
          // 1 + `foo${bar}baz` => `1foo${bar}baz`
          if (self.right?.isAst?.('AST_TemplateString')) {
            var r = self.right
            var l = self.left.evaluate(compressor)
            if (l != self.left) {
              r.segments[0].value = l.toString() + r.segments[0].value
              return r
            }
          }
          // `1${bar}2` + `foo${bar}baz` => `1${bar}2foo${bar}baz`
          if (self.left?.isAst?.('AST_TemplateString') &&
                  self.right?.isAst?.('AST_TemplateString')) {
            var l = self.left
            var segments = l.segments
            var r = self.right
            segments[segments.length - 1].value += r.segments[0].value
            for (var i = 1; i < r.segments.length; i++) {
              segments.push(r.segments[i])
            }
            return l
          }
        case '*':
          associative = compressor.option('unsafe_math')
        case '&':
        case '|':
        case '^':
          // a + +b => +b + a
          if (self.left.is_number(compressor) &&
                  self.right.is_number(compressor) &&
                  reversible() &&
                  !(self.left?.isAst?.('AST_Binary') &&
                      self.left.operator != self.operator &&
                      PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
            var reversed = make_node('AST_Binary', self, {
              operator: self.operator,
              left: self.right,
              right: self.left
            })
            if (self.right?.isAst?.('AST_Constant') &&
                      !(self.left?.isAst?.('AST_Constant'))) {
              self = best_of(compressor, reversed, self)
            } else {
              self = best_of(compressor, self, reversed)
            }
          }
          if (associative && self.is_number(compressor)) {
            // a + (b + c) => (a + b) + c
            if (self.right?.isAst?.('AST_Binary') &&
                      self.right.operator == self.operator) {
              self = make_node('AST_Binary', self, {
                operator: self.operator,
                left: make_node('AST_Binary', self.left, {
                  operator: self.operator,
                  left: self.left,
                  right: self.right.left,
                  start: self.left.start,
                  end: self.right.left.end
                }),
                right: self.right.right
              })
            }
            // (n + 2) + 3 => 5 + n
            // (2 * n) * 3 => 6 + n
            if (self.right?.isAst?.('AST_Constant') &&
                      self.left?.isAst?.('AST_Binary') &&
                      self.left.operator == self.operator) {
              if (self.left.left?.isAst?.('AST_Constant')) {
                self = make_node('AST_Binary', self, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left, {
                    operator: self.operator,
                    left: self.left.left,
                    right: self.right,
                    start: self.left.left.start,
                    end: self.right.end
                  }),
                  right: self.left.right
                })
              } else if (self.left.right?.isAst?.('AST_Constant')) {
                self = make_node('AST_Binary', self, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left, {
                    operator: self.operator,
                    left: self.left.right,
                    right: self.right,
                    start: self.left.right.start,
                    end: self.right.end
                  }),
                  right: self.left.left
                })
              }
            }
            // (a | 1) | (2 | d) => (3 | a) | b
            if (self.left?.isAst?.('AST_Binary') &&
                      self.left.operator == self.operator &&
                      self.left.right?.isAst?.('AST_Constant') &&
                      self.right?.isAst?.('AST_Binary') &&
                      self.right.operator == self.operator &&
                      self.right.left?.isAst?.('AST_Constant')) {
              self = make_node('AST_Binary', self, {
                operator: self.operator,
                left: make_node('AST_Binary', self.left, {
                  operator: self.operator,
                  left: make_node('AST_Binary', self.left.left, {
                    operator: self.operator,
                    left: self.left.right,
                    right: self.right.left,
                    start: self.left.right.start,
                    end: self.right.left.end
                  }),
                  right: self.left.left
                }),
                right: self.right.right
              })
            }
          }
      }
    }
    // x && (y && z)  ==>  x && y && z
    // x || (y || z)  ==>  x || y || z
    // x + ("y" + z)  ==>  x + "y" + z
    // "x" + (y + "z")==>  "x" + y + "z"
    if (self.right?.isAst?.('AST_Binary') &&
          self.right.operator == self.operator &&
          (lazy_op.has(self.operator) ||
              (self.operator == '+' &&
                  (self.right.left.is_string(compressor) ||
                      (self.left.is_string(compressor) &&
                          self.right.right.is_string(compressor)))))
    ) {
      self.left = make_node('AST_Binary', self.left, {
        operator: self.operator,
        left: self.left,
        right: self.right.left
      })
      self.right = self.right.right
      return self.transform(compressor)
    }
    var ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    var right = this.right.drop_side_effect_free(compressor)
    if (!right) return this.left.drop_side_effect_free(compressor, first_in_statement)
    if (lazy_op.has(this.operator)) {
      if (right === this.right) return this
      var node = this.clone()
      node.right = right
      return node
    } else {
      var left = this.left.drop_side_effect_free(compressor, first_in_statement)
      if (!left) return this.right.drop_side_effect_free(compressor, first_in_statement)
      return make_sequence(this, [left, right])
    }
  }

  may_throw (compressor: any) {
    return this.left.may_throw(compressor) ||
          this.right.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.left.has_side_effects(compressor) ||
          this.right.has_side_effects(compressor)
  }

  _eval (compressor: any, depth) {
    if (!non_converting_binary.has(this.operator)) depth++
    var left = this.left._eval(compressor, depth)
    if (left === this.left) return this
    var right = this.right._eval(compressor, depth)
    if (right === this.right) return this
    var result
    switch (this.operator) {
      case '&&' : result = left && right; break
      case '||' : result = left || right; break
      case '??' : result = left != null ? left : right; break
      case '|' : result = left | right; break
      case '&' : result = left & right; break
      case '^' : result = left ^ right; break
      case '+' : result = left + right; break
      case '*' : result = left * right; break
      case '**' : result = Math.pow(left, right); break
      case '/' : result = left / right; break
      case '%' : result = left % right; break
      case '-' : result = left - right; break
      case '<<' : result = left << right; break
      case '>>' : result = left >> right; break
      case '>>>' : result = left >>> right; break
      case '==' : result = left == right; break
      case '===' : result = left === right; break
      case '!=' : result = left != right; break
      case '!==' : result = left !== right; break
      case '<' : result = left < right; break
      case '<=' : result = left <= right; break
      case '>' : result = left > right; break
      case '>=' : result = left >= right; break
      default:
        return this
    }
    if (isNaN(result) && compressor.find_parent(AST_With)) {
      // leave original expression as is
      return this
    }
    return result
  }

  is_constant_expression () {
    return this.left.is_constant_expression() &&
          this.right.is_constant_expression()
  }

  negate (compressor: any, first_in_statement) {
    var self = this.clone(); var op = this.operator
    if (compressor.option('unsafe_comps')) {
      switch (op) {
        case '<=' : self.operator = '>'; return self
        case '<' : self.operator = '>='; return self
        case '>=' : self.operator = '<'; return self
        case '>' : self.operator = '<='; return self
      }
    }
    switch (op) {
      case '==' : self.operator = '!='; return self
      case '!=' : self.operator = '=='; return self
      case '===': self.operator = '!=='; return self
      case '!==': self.operator = '==='; return self
      case '&&':
        self.operator = '||'
        self.left = self.left.negate(compressor, first_in_statement)
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
      case '||':
        self.operator = '&&'
        self.left = self.left.negate(compressor, first_in_statement)
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
      case '??':
        self.right = self.right.negate(compressor)
        return best(this, self, first_in_statement)
    }
    return basic_negation(this)
  }

  is_string (compressor: any) {
    return this.operator == '+' &&
          (this.left.is_string(compressor) || this.right.is_string(compressor))
  }

  is_number (compressor: any) {
    return binary.has(this.operator) || this.operator == '+' &&
          this.left.is_number(compressor) &&
          this.right.is_number(compressor)
  }

  is_boolean () {
    return binary_bool.has(this.operator) ||
          lazy_op.has(this.operator) &&
              this.left.is_boolean() &&
              this.right.is_boolean()
  }

  reduce_vars (tw, descend, compressor: any) {
    if (!lazy_op.has(this.operator)) return
    this.left.walk(tw)
    push(tw)
    this.right.walk(tw)
    pop(tw)
    return true
  }

  _dot_throw (compressor: any) {
    return (this.operator == '&&' || this.operator == '||' || this.operator == '??') &&
          (this.left._dot_throw(compressor) || this.right._dot_throw(compressor))
  }

  lift_sequences (compressor: any) {
    if (compressor.option('sequences')) {
      if (this.left?.isAst?.('AST_Sequence')) {
        var x = this.left.expressions.slice()
        var e = this.clone()
        e.left = x.pop()
        x.push(e)
        return make_sequence(this, x).optimize(compressor)
      }
      if (this.right?.isAst?.('AST_Sequence') && !this.left.has_side_effects(compressor)) {
        var assign = this.operator == '=' && this.left?.isAst?.('AST_SymbolRef')
        var x = this.right.expressions
        var last = x.length - 1
        for (var i = 0; i < last; i++) {
          if (!assign && x[i].has_side_effects(compressor)) break
        }
        if (i == last) {
          x = x.slice()
          var e = this.clone()
          e.right = x.pop()
          x.push(e)
          return make_sequence(this, x).optimize(compressor)
        } else if (i > 0) {
          var e = this.clone()
          e.right = make_sequence(this.right, x.slice(i))
          x = x.slice(0, i)
          x.push(e)
          return make_sequence(this, x).optimize(compressor)
        }
      }
    }
    return this
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.left._walk(visitor)
      this.right._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.right)
    push(this.left)
  }

  shallow_cmp = mkshallow({ operator: 'eq' })
  _size (info): number {
    if (this.operator === 'in') return 4

    let size = this.operator.length

    if (
      (this.operator === '+' || this.operator === '-') &&
            this.right?.isAst?.('AST_Unary') && this.right.operator === this.operator
    ) {
      // 1+ +a > needs space between the +
      size += 1
    }

    if (this.needs_parens(info)) {
      size += 2
    }

    return size
  }

  _transform (self, tw: any) {
    self.left = self.left.transform(tw)
    self.right = self.right.transform(tw)
  }

  _to_mozilla_ast (parent) {
    if (this.operator == '=' && to_moz_in_destructuring()) {
      return {
        type: 'AssignmentPattern',
        left: to_moz(this.left),
        right: to_moz(this.right)
      }
    }

    const type = this.operator == '&&' || this.operator == '||' || this.operator === '??'
      ? 'LogicalExpression'
      : 'BinaryExpression'

    return {
      type,
      left: to_moz(this.left),
      operator: this.operator,
      right: to_moz(this.right)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    // (foo && bar)()
    if (p?.isAst?.('AST_Call') && p.expression === this) { return true }
    // typeof (foo && bar)
    if (p?.isAst?.('AST_Unary')) { return true }
    // (foo && bar)["prop"], (foo && bar).prop
    if (p?._needs_parens(this)) { return true }
    // this deals with precedence: 3 * (2 + 1)
    if (p?.isAst?.('AST_Binary')) {
      const po = p.operator
      const so = this.operator

      if (so === '??' && (po === '||' || po === '&&')) {
        return true
      }

      const pp = PRECEDENCE[po]
      const sp = PRECEDENCE[so]
      if (pp > sp ||
                (pp == sp &&
                    (this === p.right || po == '**'))) {
        return true
      }
    }
    return undefined
  }

  _codegen (self, output) {
    var op = self.operator
    self.left.print(output)
    if (op[0] == '>' && /* ">>" ">>>" ">" ">=" */
            self.left?.isAst?.('AST_UnaryPostfix') &&
            self.left.operator == '--') {
      // space is mandatory to avoid outputting -->
      output.print(' ')
    } else {
      // the space is optional depending on "beautify"
      output.space()
    }
    output.print(op)
    if ((op == '<' || op == '<<') &&
            self.right?.isAst?.('AST_UnaryPrefix') &&
            self.right.operator == '!' &&
            self.right.expression?.isAst?.('AST_UnaryPrefix') &&
            self.right.expression.operator == '--') {
      // space is mandatory to avoid outputting <!--
      output.print(' ')
    } else {
      // the space is optional depending on "beautify"
      output.space()
    }
    self.right.print(output)
  }

  static documentation = 'Binary expression, i.e. `a + b`'
  static propdoc = {
    left: '[AST_Node] left-hand side expression',
    operator: '[string] the operator',
    right: '[AST_Node] right-hand side expression'
  }

  static PROPS = AST_Node.PROPS.concat(['operator', 'left', 'right'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.operator = args.operator
    this.left = args.left
    this.right = args.right
  }
}

class AST_Conditional extends AST_Node {
  alternative: any
  consequent: any
  condition: any

  _optimize (self, compressor) {
    if (!compressor.option('conditionals')) return self
    // This looks like lift_sequences(), should probably be under "sequences"
    if (self.condition?.isAst?.('AST_Sequence')) {
      var expressions = self.condition.expressions.slice()
      self.condition = expressions.pop()
      expressions.push(self)
      return make_sequence(self, expressions)
    }
    var cond = self.condition.evaluate(compressor)
    if (cond !== self.condition) {
      if (cond) {
        compressor.warn('Condition always true [{file}:{line},{col}]', self.start)
        return maintain_this_binding(compressor.parent(), compressor.self(), self.consequent)
      } else {
        compressor.warn('Condition always false [{file}:{line},{col}]', self.start)
        return maintain_this_binding(compressor.parent(), compressor.self(), self.alternative)
      }
    }
    var negated = cond.negate(compressor, first_in_statement(compressor))
    if (best_of(compressor, cond, negated) === negated) {
      self = make_node('AST_Conditional', self, {
        condition: negated,
        consequent: self.alternative,
        alternative: self.consequent
      })
    }
    var condition = self.condition
    var consequent = self.consequent
    var alternative = self.alternative
    // x?x:y --> x||y
    if (condition?.isAst?.('AST_SymbolRef') &&
          consequent?.isAst?.('AST_SymbolRef') &&
          condition.definition?.() === consequent.definition?.()) {
      return make_node('AST_Binary', self, {
        operator: '||',
        left: condition,
        right: alternative
      })
    }
    // if (foo) exp = something; else exp = something_else;
    //                   |
    //                   v
    // exp = foo ? something : something_else;
    if (consequent?.isAst?.('AST_Assign') &&
          alternative?.isAst?.('AST_Assign') &&
          consequent.operator == alternative.operator &&
          consequent.left.equivalent_to(alternative.left) &&
          (!self.condition.has_side_effects(compressor) ||
              consequent.operator == '=' &&
                  !consequent.left.has_side_effects(compressor))) {
      return make_node('AST_Assign', self, {
        operator: consequent.operator,
        left: consequent.left,
        right: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: consequent.right,
          alternative: alternative.right
        })
      })
    }
    // x ? y(a) : y(b) --> y(x ? a : b)
    var arg_index
    if (consequent?.isAst?.('AST_Call') &&
          alternative.TYPE === consequent.TYPE &&
          consequent.args.length > 0 &&
          consequent.args.length == alternative.args.length &&
          consequent.expression.equivalent_to(alternative.expression) &&
          !self.condition.has_side_effects(compressor) &&
          !consequent.expression.has_side_effects(compressor) &&
          typeof (arg_index = single_arg_diff()) === 'number') {
      var node = consequent.clone()
      node.args[arg_index] = make_node('AST_Conditional', self, {
        condition: self.condition,
        consequent: consequent.args[arg_index],
        alternative: alternative.args[arg_index]
      })
      return node
    }
    // a ? b : c ? b : d --> (a || c) ? b : d
    if (alternative?.isAst?.('AST_Conditional') &&
          consequent.equivalent_to(alternative.consequent)) {
      return make_node('AST_Conditional', self, {
        condition: make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: alternative.condition
        }),
        consequent: consequent,
        alternative: alternative.alternative
      }).optimize(compressor)
    }

    // a == null ? b : a -> a ?? b
    if (
      compressor.option('ecma') >= 2020 &&
          is_nullish_check(condition, alternative, compressor)
    ) {
      return make_node('AST_Binary', self, {
        operator: '??',
        left: alternative,
        right: consequent
      }).optimize(compressor)
    }

    // a ? b : (c, b) --> (a || c), b
    if (alternative?.isAst?.('AST_Sequence') &&
          consequent.equivalent_to(alternative.expressions[alternative.expressions.length - 1])) {
      return make_sequence(self, [
        make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: make_sequence(self, alternative.expressions.slice(0, -1))
        }),
        consequent
      ]).optimize(compressor)
    }
    // a ? b : (c && b) --> (a || c) && b
    if (alternative?.isAst?.('AST_Binary') &&
          alternative.operator == '&&' &&
          consequent.equivalent_to(alternative.right)) {
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: make_node('AST_Binary', self, {
          operator: '||',
          left: condition,
          right: alternative.left
        }),
        right: consequent
      }).optimize(compressor)
    }
    // x?y?z:a:a --> x&&y?z:a
    if (consequent?.isAst?.('AST_Conditional') &&
          consequent.alternative.equivalent_to(alternative)) {
      return make_node('AST_Conditional', self, {
        condition: make_node('AST_Binary', self, {
          left: self.condition,
          operator: '&&',
          right: consequent.condition
        }),
        consequent: consequent.consequent,
        alternative: alternative
      })
    }
    // x ? y : y --> x, y
    if (consequent.equivalent_to(alternative)) {
      return make_sequence(self, [
        self.condition,
        consequent
      ]).optimize(compressor)
    }
    // x ? y || z : z --> x && y || z
    if (consequent?.isAst?.('AST_Binary') &&
          consequent.operator == '||' &&
          consequent.right.equivalent_to(alternative)) {
      return make_node('AST_Binary', self, {
        operator: '||',
        left: make_node('AST_Binary', self, {
          operator: '&&',
          left: self.condition,
          right: consequent.left
        }),
        right: alternative
      }).optimize(compressor)
    }
    var in_bool = compressor.in_boolean_context()
    if (is_true(self.consequent)) {
      if (is_false(self.alternative)) {
        // c ? true : false ---> !!c
        return booleanize(self.condition)
      }
      // c ? true : x ---> !!c || x
      return make_node('AST_Binary', self, {
        operator: '||',
        left: booleanize(self.condition),
        right: self.alternative
      })
    }
    if (is_false(self.consequent)) {
      if (is_true(self.alternative)) {
        // c ? false : true ---> !c
        return booleanize(self.condition.negate(compressor))
      }
      // c ? false : x ---> !c && x
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: booleanize(self.condition.negate(compressor)),
        right: self.alternative
      })
    }
    if (is_true(self.alternative)) {
      // c ? x : true ---> !c || x
      return make_node('AST_Binary', self, {
        operator: '||',
        left: booleanize(self.condition.negate(compressor)),
        right: self.consequent
      })
    }
    if (is_false(self.alternative)) {
      // c ? x : false ---> !!c && x
      return make_node('AST_Binary', self, {
        operator: '&&',
        left: booleanize(self.condition),
        right: self.consequent
      })
    }

    return self

    function booleanize (node: any) {
      if (node.is_boolean()) return node
      // !!expression
      return make_node('AST_UnaryPrefix', node, {
        operator: '!',
        expression: node.negate(compressor)
      })
    }

    // AST_True or !0
    function is_true (node: any) {
      return node?.isAst?.('AST_True') ||
              in_bool &&
                  node?.isAst?.('AST_Constant') &&
                  node.getValue() ||
              (node?.isAst?.('AST_UnaryPrefix') &&
                  node.operator == '!' &&
                  node.expression?.isAst?.('AST_Constant') &&
                  !node.expression.getValue())
    }
    // AST_False or !1
    function is_false (node: any) {
      return node?.isAst?.('AST_False') ||
              in_bool &&
                  node?.isAst?.('AST_Constant') &&
                  !node.getValue() ||
              (node?.isAst?.('AST_UnaryPrefix') &&
                  node.operator == '!' &&
                  node.expression?.isAst?.('AST_Constant') &&
                  node.expression.getValue())
    }

    function single_arg_diff () {
      var a = consequent.args
      var b = alternative.args
      for (var i = 0, len = a.length; i < len; i++) {
        if (a[i]?.isAst?.('AST_Expansion')) return
        if (!a[i].equivalent_to(b[i])) {
          if (b[i]?.isAst?.('AST_Expansion')) return
          for (var j = i + 1; j < len; j++) {
            if (a[j]?.isAst?.('AST_Expansion')) return
            if (!a[j].equivalent_to(b[j])) return
          }
          return i
        }
      }
    }
  }

  drop_side_effect_free (compressor: any) {
    var consequent = this.consequent.drop_side_effect_free(compressor)
    var alternative = this.alternative.drop_side_effect_free(compressor)
    if (consequent === this.consequent && alternative === this.alternative) return this
    if (!consequent) {
      return alternative ? make_node('AST_Binary', this, {
        operator: '||',
        left: this.condition,
        right: alternative
      }) : this.condition.drop_side_effect_free(compressor)
    }
    if (!alternative) {
      return make_node('AST_Binary', this, {
        operator: '&&',
        left: this.condition,
        right: consequent
      })
    }
    var node = this.clone()
    node.consequent = consequent
    node.alternative = alternative
    return node
  }

  may_throw (compressor: any) {
    return this.condition.may_throw(compressor) ||
          this.consequent.may_throw(compressor) ||
          this.alternative.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.condition.has_side_effects(compressor) ||
          this.consequent.has_side_effects(compressor) ||
          this.alternative.has_side_effects(compressor)
  }

  _eval (compressor: any, depth) {
    var condition = this.condition._eval(compressor, depth)
    if (condition === this.condition) return this
    var node = condition ? this.consequent : this.alternative
    var value = node._eval(compressor, depth)
    return value === node ? this : value
  }

  negate (compressor: any, first_in_statement) {
    var self = this.clone()
    self.consequent = self.consequent.negate(compressor)
    self.alternative = self.alternative.negate(compressor)
    return best(this, self, first_in_statement)
  }

  is_string (compressor: any) {
    return this.consequent.is_string(compressor) && this.alternative.is_string(compressor)
  }

  is_number (compressor: any) {
    return this.consequent.is_number(compressor) && this.alternative.is_number(compressor)
  }

  is_boolean () {
    return this.consequent.is_boolean() && this.alternative.is_boolean()
  }

  reduce_vars (tw) {
    this.condition.walk(tw)
    push(tw)
    this.consequent.walk(tw)
    pop(tw)
    push(tw)
    this.alternative.walk(tw)
    pop(tw)
    return true
  }

  _dot_throw (compressor: any) {
    return this.consequent._dot_throw(compressor) ||
          this.alternative._dot_throw(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.consequent._walk(visitor)
      this.alternative._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.alternative)
    push(this.consequent)
    push(this.condition)
  }

  _size = () => 3
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.condition = self.condition.transform(tw)
    self.consequent = self.consequent.transform(tw)
    self.alternative = self.alternative.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ConditionalExpression',
      test: to_moz(this.condition),
      consequent: to_moz(this.consequent),
      alternate: to_moz(this.alternative)
    }
  }

  needs_parens = needsParens
  _codegen (self, output) {
    self.condition.print(output)
    output.space()
    output.print('?')
    output.space()
    self.consequent.print(output)
    output.space()
    output.colon()
    self.alternative.print(output)
  }

  static documentation = 'Conditional expression using the ternary operator, i.e. `a ? b : c`'
  static propdoc = {
    condition: '[AST_Node]',
    consequent: '[AST_Node]',
    alternative: '[AST_Node]'
  }

  static PROPS = AST_Node.PROPS.concat(['condition', 'consequent', 'alternative'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.condition = args.condition
    this.consequent = args.consequent
    this.alternative = args.alternative
  }
}

class AST_Assign extends AST_Binary {
  _optimize (self, compressor) {
    var def
    if (compressor.option('dead_code') &&
          self.left?.isAst?.('AST_SymbolRef') &&
          (def = self.left.definition?.()).scope === compressor.find_parent(AST_Lambda)) {
      var level = 0; var node; var parent = self
      do {
        node = parent
        parent = compressor.parent(level++)
        if (parent?.isAst?.('AST_Exit')) {
          if (in_try(level, parent)) break
          if (is_reachable(def.scope, [def])) break
          if (self.operator == '=') return self.right
          def.fixed = false
          return make_node('AST_Binary', self, {
            operator: self.operator.slice(0, -1),
            left: self.left,
            right: self.right
          }).optimize(compressor)
        }
      } while (parent?.isAst?.('AST_Binary') && parent.right === node ||
              parent?.isAst?.('AST_Sequence') && parent.tail_node() === node)
    }
    self = self.lift_sequences(compressor)
    if (self.operator == '=' && self.left?.isAst?.('AST_SymbolRef') && self.right?.isAst?.('AST_Binary')) {
      // x = expr1 OP expr2
      if (self.right.left?.isAst?.('AST_SymbolRef') &&
              self.right.left.name == self.left.name &&
              ASSIGN_OPS.has(self.right.operator)) {
        // x = x - 2  --->  x -= 2
        self.operator = self.right.operator + '='
        self.right = self.right.right
      } else if (self.right.right?.isAst?.('AST_SymbolRef') &&
              self.right.right.name == self.left.name &&
              ASSIGN_OPS_COMMUTATIVE.has(self.right.operator) &&
              !self.right.left.has_side_effects(compressor)) {
        // x = 2 & x  --->  x &= 2
        self.operator = self.right.operator + '='
        self.right = self.right.left
      }
    }
    return self

    function in_try (level, node) {
      var right = self.right
      self.right = make_node('AST_Null', right)
      var may_throw = node.may_throw(compressor)
      self.right = right
      var scope = self.left.definition?.().scope
      var parent
      while ((parent = compressor.parent(level++)) !== scope) {
        if (parent?.isAst?.('AST_Try')) {
          if (parent.bfinally) return true
          if (may_throw && parent.bcatch) return true
        }
      }
    }
  }

  drop_side_effect_free (compressor: any) {
    var left = this.left
    if (left.has_side_effects(compressor) ||
          compressor.has_directive('use strict') &&
              left?.isAst?.('AST_PropAccess') &&
              left.expression.is_constant()) {
      return this
    }
    set_flag(this, WRITE_ONLY)
    while (left?.isAst?.('AST_PropAccess')) {
      left = left.expression
    }
    if (left.is_constant_expression(compressor.find_parent(AST_Scope))) {
      return this.right.drop_side_effect_free(compressor)
    }
    return this
  }

  may_throw (compressor: any) {
    if (this.right.may_throw(compressor)) return true
    if (!compressor.has_directive('use strict') &&
          this.operator == '=' &&
          this.left?.isAst?.('AST_SymbolRef')) {
      return false
    }
    return this.left.may_throw(compressor)
  }

  has_side_effects = return_true
  is_string (compressor: any) {
    return (this.operator == '=' || this.operator == '+=') && this.right.is_string(compressor)
  }

  is_number (compressor: any) {
    return binary.has(this.operator.slice(0, -1)) ||
          this.operator == '=' && this.right.is_number(compressor)
  }

  is_boolean () {
    return this.operator == '=' && this.right.is_boolean()
  }

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    var node = this
    if (node.left?.isAst?.('AST_Destructuring')) {
      suppress(node.left)
      return
    }
    var sym = node.left
    if (!(sym?.isAst?.('AST_SymbolRef'))) return
    var def = sym.definition?.()
    var safe = safe_to_assign(tw, def, sym.scope, node.right)
    def.assignments++
    if (!safe) return
    var fixed = def.fixed
    if (!fixed && node.operator != '=') return
    var eq = node.operator == '='
    var value = eq ? node.right : node
    if (is_modified(compressor, tw, node, value, 0)) return
    def.references.push(sym)
    if (!eq) def.chained = true
    def.fixed = eq ? function () {
      return node.right
    } : function () {
      return make_node('AST_Binary', node, {
        operator: node.operator.slice(0, -1),
        left: fixed?.isAst?.('AST_Node') ? fixed : fixed(),
        right: node.right
      })
    }
    mark(tw, def, false)
    node.right.walk(tw)
    mark(tw, def, true)
    mark_escaped(tw, def, sym.scope, node, value, 0, 1)
    return true
  }

  _dot_throw (compressor: any) {
    return this.operator == '=' &&
          this.right._dot_throw(compressor)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'AssignmentExpression',
      operator: this.operator,
      left: to_moz(this.left),
      right: to_moz(this.right)
    }
  }

  needs_parens = needsParens
  static documentation = 'An assignment expression — `a = b + 5`'

  static PROPS = AST_Binary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_DefaultAssign extends AST_Binary {
  _optimize (self, compressor) {
    if (!compressor.option('evaluate')) {
      return self
    }
    var evaluateRight = self.right.evaluate(compressor)

    // `[x = undefined] = foo` ---> `[x] = foo`
    if (evaluateRight === undefined) {
      self = self.left
    } else if (evaluateRight !== self.right) {
      evaluateRight = make_node_from_constant(evaluateRight, self.right)
      self.right = best_of_expression(evaluateRight, self.right)
    }

    return self
  }

  static documentation = 'A default assignment expression like in `(a = 3) => a`'

  static PROPS = AST_Binary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

/* -----[ LITERALS ]----- */

class AST_Class extends AST_Scope {
  extends: any
  properties: any
  name: any

  _optimize = function (self) {
    // HACK to avoid compress failure.
    // AST_Class is not really an AST_Scope/AST_Block as it lacks a body.
    return self
  }

  drop_side_effect_free = function (compressor: any) {
    const with_effects: any[] = []
    const trimmed_extends = this.extends && this.extends.drop_side_effect_free(compressor)
    if (trimmed_extends) with_effects.push(trimmed_extends)
    for (const prop of this.properties) {
      const trimmed_prop = prop.drop_side_effect_free(compressor)
      if (trimmed_prop) with_effects.push(trimmed_prop)
    }
    if (!with_effects.length) return null
    return make_sequence(this, with_effects)
  }

  may_throw = function (compressor: any) {
    if (this.extends && this.extends.may_throw(compressor)) return true
    return anyMayThrow(this.properties, compressor)
  }

  has_side_effects = function (compressor) {
    if (this.extends && this.extends.has_side_effects(compressor)) {
      return true
    }
    return anySideEffect(this.properties, compressor)
  }

  _eval = return_this
  is_constant_expression = function (scope) {
    if (this.extends && !this.extends.is_constant_expression(scope)) {
      return false
    }

    for (const prop of this.properties) {
      if (prop.computed_key() && !prop.key.is_constant_expression(scope)) {
        return false
      }
      if (prop.static && prop.value && !prop.value.is_constant_expression(scope)) {
        return false
      }
    }

    return all_refs_local.call(this, scope)
  }

  reduce_vars = function (tw, descend) {
    clear_flag(this, INLINED)
    push(tw)
    descend()
    pop(tw)
    return true
  }

  is_block_scope = return_false
  _walk = function (visitor: any) {
    return visitor._visit(this, function (this: any) {
      if (this.name) {
        this.name._walk(visitor)
      }
      if (this.extends) {
        this.extends._walk(visitor)
      }
      this.properties.forEach((prop) => prop._walk(visitor))
    })
  }

  _children_backwards (push: Function) {
    let i = this.properties.length
    while (i--) push(this.properties[i])
    if (this.extends) push(this.extends)
    if (this.name) push(this.name)
  }

  _size = function (): number {
    return (
      (this.name ? 8 : 7) +
            (this.extends ? 8 : 0)
    )
  }

  _transform (self, tw: any) {
    if (self.name) self.name = self.name.transform(tw)
    if (self.extends) self.extends = self.extends.transform(tw)
    self.properties = do_list(self.properties, tw)
  }

  shallow_cmp = mkshallow({
    name: 'exist',
    extends: 'exist'
  })

  _to_mozilla_ast (parent) {
    var type = this?.isAst?.('AST_ClassExpression') ? 'ClassExpression' : 'ClassDeclaration'
    return {
      type: type,
      superClass: to_moz(this.extends),
      id: this.name ? to_moz(this.name) : null,
      body: {
        type: 'ClassBody',
        body: this.properties.map(to_moz)
      }
    }
  }

  _codegen = function (self, output) {
    output.print('class')
    output.space()
    if (self.name) {
      self.name.print(output)
      output.space()
    }
    if (self.extends) {
      var parens = (
        !(self.extends?.isAst?.('AST_SymbolRef')) &&
                !(self.extends?.isAst?.('AST_PropAccess')) &&
                !(self.extends?.isAst?.('AST_ClassExpression')) &&
                !(self.extends?.isAst?.('AST_Function'))
      )
      output.print('extends')
      if (parens) {
        output.print('(')
      } else {
        output.space()
      }
      self.extends.print(output)
      if (parens) {
        output.print(')')
      } else {
        output.space()
      }
    }
    if (self.properties.length > 0) {
      output.with_block(function () {
        self.properties.forEach(function (prop, i) {
          if (i) {
            output.newline()
          }
          output.indent()
          prop.print(output)
        })
        output.newline()
      })
    } else output.print('{}')
  }

  add_source_map = function (output) { output.add_mapping(this.start) }
  static propdoc = {
    name: '[AST_SymbolClass|AST_SymbolDefClass?] optional class name.',
    extends: '[AST_Node]? optional parent class',
    properties: '[AST_ObjectProperty*] array of properties'
  }

  static documentation = 'An ES6 class'

  static PROPS = AST_Scope.PROPS.concat(['name', 'extends', 'properties'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.name = args.name
    this.extends = args.extends
    this.properties = args.properties
  }
}

class AST_DefClass extends AST_Class {
  name: any
  extends: any
  properties: any[]

  static documentation = 'A class definition'

  static PROPS = AST_Class.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_ClassExpression extends AST_Class {
  name: any

  needs_parens = first_in_statement
  static documentation: 'A class expression.'

  static PROPS = AST_Class.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_SymbolRef extends AST_Symbol {
  scope: any
  thedef: any

  _optimize (self, compressor) {
    if (!compressor.option('ie8') &&
          is_undeclared_ref(self) &&
          (!self.scope.uses_with || !compressor.find_parent(AST_With))) {
      switch (self.name) {
        case 'undefined':
          return make_node('AST_Undefined', self).optimize(compressor)
        case 'NaN':
          return make_node('AST_NaN', self).optimize(compressor)
        case 'Infinity':
          return make_node('AST_Infinity', self).optimize(compressor)
      }
    }
    var parent = compressor.parent()
    if (compressor.option('reduce_vars') && is_lhs(self, parent) !== self) {
      const def = self.definition?.()
      if (compressor.top_retain && def.global && compressor.top_retain(def)) {
        def.fixed = false
        def.should_replace = false
        def.single_use = false
        return self
      }
      var fixed = self.fixed_value()
      var single_use: any = def.single_use &&
              !(parent?.isAst?.('AST_Call') &&
                  (parent.is_expr_pure(compressor)) ||
                      has_annotation(parent, _NOINLINE))
      if (single_use && (fixed?.isAst?.('AST_Lambda') || fixed?.isAst?.('AST_Class'))) {
        if (retain_top_func(fixed, compressor)) {
          single_use = false
        } else if (def.scope !== self.scope &&
                  (def.escaped == 1 ||
                      has_flag(fixed, INLINED) ||
                      within_array_or_object_literal(compressor))) {
          single_use = false
        } else if (recursive_ref(compressor, def)) {
          single_use = false
        } else if (def.scope !== self.scope || def.orig[0]?.isAst?.('AST_SymbolFunarg')) {
          single_use = fixed.is_constant_expression(self.scope)
          if (single_use == 'f') {
            var scope = self.scope
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
                  def.scope === self.scope &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed) ||
                  parent?.isAst?.('AST_Call') &&
                      parent.expression === self &&
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
    return self

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

class AST_SymbolExport extends AST_SymbolRef {
  _optimize = function (self) {
    return self
  }

  static documentation = 'Symbol referring to a name to export'

  static PROPS = AST_SymbolRef.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Super extends AST_This {
  _size = () => 5
  shallow_cmp = pass_through
  _to_mozilla_ast (): any {
    return { type: 'Super' }
  }

  _codegen = function (_self, output) {
    output.print('super')
  }

  static documentation: 'The `super` symbol'

  static PROPS = AST_This.PROPS

  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_False extends AST_Boolean {
  is_boolean = return_true
  value = false
  _size = () => 5
  static documentation = 'The `false` atom'

  static PROPS = AST_Boolean.PROPS
}

class AST_True extends AST_Boolean {
  is_boolean = return_true
  value = true
  _size = () => 4
  static documentation = 'The `true` atom'

  static PROPS = AST_Boolean.PROPS
}

export {
  AST_Accessor,
  AST_Array,
  AST_Arrow,
  AST_Assign,
  AST_Atom,
  AST_Await,
  AST_BigInt,
  AST_Binary,
  AST_Block,
  AST_BlockStatement,
  AST_Boolean,
  AST_Break,
  AST_Call,
  AST_Case,
  AST_Catch,
  AST_Class,
  AST_ClassExpression,
  AST_ClassProperty,
  AST_ConciseMethod,
  AST_Conditional,
  AST_Const,
  AST_Constant,
  AST_Continue,
  AST_Debugger,
  AST_Default,
  AST_DefaultAssign,
  AST_DefClass,
  AST_Definitions,
  AST_Defun,
  AST_Destructuring,
  AST_Directive,
  AST_Do,
  AST_Dot,
  AST_DWLoop,
  AST_EmptyStatement,
  AST_Exit,
  AST_Expansion,
  AST_Export,
  AST_False,
  AST_Finally,
  AST_For,
  AST_ForIn,
  AST_ForOf,
  AST_Function,
  AST_Hole,
  AST_If,
  AST_Import,
  AST_Infinity,
  AST_IterationStatement,
  AST_Jump,
  AST_Label,
  AST_LabeledStatement,
  AST_LabelRef,
  AST_Lambda,
  AST_Let,
  AST_LoopControl,
  AST_NameMapping,
  AST_NaN,
  AST_New,
  AST_NewTarget,
  AST_Node,
  AST_Null,
  AST_Number,
  AST_Object,
  AST_ObjectGetter,
  AST_ObjectKeyVal,
  AST_ObjectProperty,
  AST_ObjectSetter,
  AST_PrefixedTemplateString,
  AST_PropAccess,
  AST_RegExp,
  AST_Return,
  AST_Scope,
  AST_Sequence,
  AST_SimpleStatement,
  AST_Statement,
  AST_StatementWithBody,
  AST_String,
  AST_Sub,
  AST_Super,
  AST_Switch,
  AST_SwitchBranch,
  AST_Symbol,
  AST_SymbolBlockDeclaration,
  AST_SymbolCatch,
  AST_SymbolClass,
  AST_SymbolClassProperty,
  AST_SymbolConst,
  AST_SymbolDeclaration,
  AST_SymbolDefClass,
  AST_SymbolDefun,
  AST_SymbolExport,
  AST_SymbolExportForeign,
  AST_SymbolFunarg,
  AST_SymbolImport,
  AST_SymbolImportForeign,
  AST_SymbolLambda,
  AST_SymbolLet,
  AST_SymbolMethod,
  AST_SymbolRef,
  AST_SymbolVar,
  AST_TemplateSegment,
  AST_TemplateString,
  AST_This,
  AST_Throw,
  AST_Token,
  AST_Toplevel,
  AST_True,
  AST_Try,
  AST_Unary,
  AST_UnaryPostfix,
  AST_UnaryPrefix,
  AST_Undefined,
  AST_Var,
  AST_VarDef,
  AST_While,
  AST_With,
  AST_Yield,
  TreeWalker,
  walk,
  walk_body,
  _INLINE,
  _NOINLINE,
  _PURE,
  OutputStream
}
