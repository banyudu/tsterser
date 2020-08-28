import AST_VarDef from './var-def'
import AST_Symbol from './symbol'
import AST_Node from './node'
import AST_Block from './block'
import Compressor from '../compressor'
import TreeTransformer from '../tree-transformer'
import TreeWalker from '../tree-walker'
import SymbolDef from '../symbol-def'
import AST_SymbolBlockDeclaration from './symbol-block-declaration'
import { js_error } from '../parse'

import {
  make_node,
  keep_name,
  walk,
  MAP,
  remove,
  can_be_evicted_from_block,
  make_sequence,
  push_uniq,
  get_value,
  init_scope_vars,
  next_mangled,
  maintain_this_binding,
  redefined_catch_def,
  is_ref_of,
  string_template,
  is_empty,
  defaults,
  map_add, is_ast_simple_statement, is_ast_toplevel, is_ast_symbol_declaration, is_ast_symbol_ref, is_ast_scope, is_ast_var, is_ast_symbol, is_ast_defun, is_ast_function, is_ast_catch, is_ast_symbol_block_declaration, is_ast_export, is_ast_loop_control, is_ast_symbol_catch, is_ast_return, is_ast_assign, is_ast_directive, is_ast_definitions, is_ast_for, is_ast_for_in, is_ast_symbol_lambda, is_ast_class, is_ast_switch, is_ast_destructuring, is_ast_symbol_let, is_ast_def_class, is_ast_call, is_ast_lambda, is_ast_unary, is_ast_var_def, is_ast_labeled_statement, is_ast_symbol_const, is_ast_name_mapping, is_ast_block, is_ast_object, is_ast_with, is_ast_symbol_export, is_ast_if, is_ast_prop_access, is_ast_label, is_ast_symbol_defun, is_ast_symbol_class, is_ast_symbol_import, is_ast_symbol_def_class, is_ast_symbol_var, is_ast_symbol_funarg, is_ast_label_ref, is_ast_import, is_ast_sequence, is_ast_empty_statement, is_ast_block_statement, is_ast_class_expression, is_ast_accessor, is_ast_expansion, is_ast_default_assign
} from '../utils'

import {
  has_flag,
  set_flag,
  UNUSED,
  MASK_EXPORT_WANT_MANGLE,
  MASK_EXPORT_DONT_MANGLE,
  WRITE_ONLY
} from '../constants'

export default class AST_Scope extends AST_Block {
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
  _block_scope: boolean

  process_expression (insert, compressor?: Compressor) {
    const self = this
    var tt = new TreeTransformer(function (node: AST_Node) {
      if (insert && is_ast_simple_statement(node)) {
        return make_node('AST_Return', node, {
          value: node.body
        })
      }
      if (!insert && is_ast_return(node)) {
        if (compressor) {
          const value = node.value?.drop_side_effect_free?.(compressor, true)
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
      if (is_ast_class(node) || is_ast_lambda(node) && (node as any) !== self) {
        return node
      }
      if (is_ast_block(node)) {
        const index = node.body.length - 1
        if (index >= 0) {
          node.body[index] = node.body[index].transform(tt)
        }
      } else if (is_ast_if(node)) {
        node.body = (node.body).transform(tt)
        if (node.alternative) {
          node.alternative = node.alternative.transform(tt)
        }
      } else if (is_ast_with(node)) {
        node.body = (node.body).transform(tt)
      }
      return node
    })
    self.transform(tt)
  }

  drop_unused (compressor: Compressor) {
    const optUnused = compressor.option('unused')
    if (!optUnused) return
    if (compressor.has_directive('use asm')) return
    const self = this
    if (self.pinned()) return
    const drop_funcs = !(is_ast_toplevel(self)) || compressor.toplevel.funcs
    const drop_vars = !(is_ast_toplevel(self)) || compressor.toplevel.vars
    const assign_as_unused = typeof optUnused === 'string' && optUnused.includes('keep_assign') ? () => false : function (node: AST_Node) {
      if (is_ast_assign(node) &&
              (has_flag(node, WRITE_ONLY) || node.operator == '=')
      ) {
        return node.left
      }
      if (is_ast_unary(node) && has_flag(node, WRITE_ONLY)) {
        return node.expression
      }
    }
    const in_use_ids = new Map()
    const fixed_ids = new Map()
    if (is_ast_toplevel(self) && compressor.top_retain) {
      self.variables.forEach(function (def: SymbolDef) {
        if (compressor.top_retain?.(def) && !in_use_ids.has(def.id)) {
          in_use_ids.set(def.id, def)
        }
      })
    }
    const var_defs_by_id = new Map()
    const initializations = new Map()
    // pass 1: find out which symbols are directly used in
    // this scope (not in nested scopes).
    let scope: any = this
    var tw = new TreeWalker(function (node: AST_Node, descend) {
      if (is_ast_lambda(node) && node.uses_arguments && !tw.has_directive('use strict')) {
        node.argnames.forEach(function (argname) {
          if (!(is_ast_symbol_declaration(argname))) return
          const def = argname.definition?.()
          if (!in_use_ids.has(def.id)) {
            in_use_ids.set(def.id, def)
          }
        })
      }
      if (node === self) return
      if (is_ast_defun(node) || is_ast_def_class(node)) {
        const node_def = node.name?.definition?.()
        const in_export = is_ast_export(tw.parent())
        if (in_export || !drop_funcs && scope === self) {
          if (node_def.global && !in_use_ids.has(node_def.id)) {
            in_use_ids.set(node_def.id, node_def)
          }
        }
        if (is_ast_def_class(node)) {
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
      if (is_ast_symbol_funarg(node) && scope === self) {
        map_add(var_defs_by_id, node.definition?.().id, node)
      }
      if (is_ast_definitions(node) && scope === self) {
        const in_export = is_ast_export(tw.parent())
        node.definitions.forEach(function (def: AST_VarDef) {
          if (is_ast_symbol_var(def.name)) {
            map_add(var_defs_by_id, def.name.definition?.().id, def)
          }
          if (in_export || !drop_vars) {
            walk(def.name, (node: AST_Node) => {
              if (is_ast_symbol_declaration(node)) {
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
            if (is_ast_destructuring(def.name)) {
              def.walk(tw)
            } else {
              const node_def = def.name.definition?.()
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
    in_use_ids.forEach(function (def: SymbolDef) {
      const init = initializations.get(def.id)
      if (init) {
        init.forEach(function (init) {
          init.walk(tw)
        })
      }
    })
    // pass 3: we should drop declarations not in_use
    var tt = new TreeTransformer(
      function before (this, node: AST_Node, descend: Function, in_list) {
        const parent = tt.parent()
        let def
        if (drop_vars) {
          const sym = assign_as_unused(node)
          if (is_ast_symbol_ref(sym)) {
            def = sym.definition?.()
            const in_use = in_use_ids.has(def.id)
            if (is_ast_assign(node)) {
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
        if (node.name &&
                  (is_ast_class_expression(node) &&
                      !keep_name(compressor.option('keep_classnames'), (def = node.name?.definition?.()).name) ||
                  is_ast_function(node) &&
                      !keep_name(compressor.option('keep_fnames'), (def = node.name?.definition?.()).name))) {
          // any declarations with same name will overshadow
          // name of this anonymous function and can therefore
          // never be used anywhere
          if (!in_use_ids.has(def.id) || def.orig.length > 1) node.name = null
        }
        if (is_ast_lambda(node) && !(is_ast_accessor(node))) {
          let trim = !compressor.option('keep_fargs')
          for (let a = node.argnames, i = a.length; --i >= 0;) {
            let sym = a[i]
            if (is_ast_expansion(sym)) {
              sym = sym.expression
            }
            if (is_ast_default_assign(sym)) {
              sym = sym.left
            }
            // Do not drop destructuring arguments.
            // They constitute a type assertion, so dropping
            // them would stop that TypeError which would happen
            // if someone called it with an incorrectly formatted
            // parameter.
            if (!(is_ast_destructuring(sym)) && !in_use_ids.has(sym.definition?.().id)) {
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
        if ((is_ast_defun(node) || is_ast_def_class(node)) && (node as any) !== self) {
          const def = node.name?.definition?.()
          const keep = def.global && !drop_funcs || in_use_ids.has(def.id)
          if (!keep) {
            compressor[node.name?.unreferenced() ? 'warn' : 'info']('Dropping unused function {name} [{file}:{line},{col}]', template(node.name))
            def.eliminated++
            if (is_ast_def_class(node)) {
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
        if (is_ast_definitions(node) && !(is_ast_for_in(parent) && parent.init === node)) {
          const drop_block = !(is_ast_toplevel(parent)) && !(is_ast_var(node))
          // place uninitialized names at the start
          const body: any[] = []; const head: any[] = []; const tail: any[] = []
          // for unused names whose initialization has
          // side effects, we can cascade the init. code
          // into the next one, or next statement.
          let side_effects: any[] = []
          node.definitions.forEach(function (def: AST_VarDef) {
            if (def.value) def.value = def.value.transform(tt)
            const is_destructure = is_ast_destructuring(def.name)
            const sym = is_destructure
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
              if (is_ast_symbol_var(def.name)) {
                const var_defs = var_defs_by_id.get(sym.id)
                if (var_defs.length > 1 && (!def.value || sym.orig.indexOf(def.name) > sym.eliminated)) {
                  compressor.warn('Dropping duplicated definition of variable {name} [{file}:{line},{col}]', template(def.name))
                  if (def.value) {
                    const ref = make_node('AST_SymbolRef', def.name, def.name)
                    sym.references.push(ref)
                    const assign = make_node('AST_Assign', def, {
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
            } else if (is_ast_symbol_catch(sym.orig[0])) {
              const value = def.value?.drop_side_effect_free(compressor)
              if (value) side_effects.push(value)
              def.value = null
              head.push(def)
            } else {
              const value = def.value?.drop_side_effect_free(compressor)
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
        if (is_ast_for(node)) {
          descend(node, this)
          let block
          if (is_ast_block_statement(node.init)) {
            block = node.init
            node.init = block.body.pop()
            block.body.push(node)
          }
          if (is_ast_simple_statement(node.init)) {
            // TODO: check type
            node.init = node.init.body
          } else if (is_empty(node.init)) {
            node.init = null
          }
          return !block ? node : in_list ? MAP.splice(block.body) : block
        }
        if (is_ast_labeled_statement(node) &&
                  is_ast_for(node.body)
        ) {
          descend(node, this)
          if (is_ast_block_statement(node.body)) {
            const block = node.body
            node.body = block.body.pop() // TODO: check type
            block.body.push(node)
            return in_list ? MAP.splice(block.body) : block
          }
          return node
        }
        if (is_ast_block_statement(node)) {
          descend(node, this)
          if (in_list && node.body.every(can_be_evicted_from_block)) {
            return MAP.splice(node.body)
          }
          return node
        }
        if (is_ast_scope(node)) {
          const save_scope = scope
          scope = node
          descend(node, this)
          scope = save_scope
          return node
        }

        function template (sym: AST_Symbol) {
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

    function scan_ref_scoped (node: AST_Node, descend: Function) {
      let node_def
      const sym = assign_as_unused(node)
      if (is_ast_symbol_ref(sym) &&
              !is_ref_of(node.left, AST_SymbolBlockDeclaration) &&
              self.variables.get(sym.name) === (node_def = sym.definition?.())
      ) {
        if (is_ast_assign(node)) {
          node.right.walk(tw)
          if (!node_def.chained && (node.left as any).fixed_value() === node.right) {
            fixed_ids.set(node_def.id, node)
          }
        }
        return true
      }
      if (is_ast_symbol_ref(node)) {
        node_def = node.definition?.()
        if (!in_use_ids.has(node_def.id)) {
          in_use_ids.set(node_def.id, node_def)
          if (is_ast_symbol_catch(node_def.orig[0])) {
            const redef = node_def.scope.is_block_scope() &&
                          node_def.scope.get_defun_scope().variables.get(node_def.name)
            if (redef) in_use_ids.set(redef.id, redef)
          }
        }
        return true
      }
      if (is_ast_scope(node)) {
        const save_scope = scope
        scope = node
        descend()
        scope = save_scope
        return true
      }
    }
  }

  hoist_declarations (compressor: Compressor) {
    let self = this
    if (compressor.has_directive('use asm')) return self
    // Hoisting makes no sense in an arrow func
    if (!Array.isArray(self.body)) return self

    const hoist_funs = compressor.option('hoist_funs')
    let hoist_vars = compressor.option('hoist_vars')

    if (hoist_funs || hoist_vars) {
      const dirs: any[] = []
      const hoisted: any[] = []
      const vars = new Map(); let vars_found = 0; let var_decl = 0
      // let's count var_decl first, we seem to waste a lot of
      // space if we hoist `var` when there's only one.
      walk(self, (node: AST_Node) => {
        if (is_ast_scope(node) && node !== self) { return true }
        if (is_ast_var(node)) {
          ++var_decl
          return true
        }
      })
      hoist_vars = hoist_vars && var_decl > 1
      var tt = new TreeTransformer(
        function before (node: AST_Node) {
          if (node !== self) {
            if (is_ast_directive(node)) {
              dirs.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_funs && is_ast_defun(node) &&
                          !(is_ast_export(tt.parent())) &&
                          tt.parent() === self) {
              hoisted.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_vars && is_ast_var(node)) {
              node.definitions.forEach(function (def: AST_VarDef) {
                if (is_ast_destructuring(def.name)) return
                vars.set(def.name.name, def)
                ++vars_found
              })
              const seq = node.to_assignments(compressor)
              const p = tt.parent()
              if (is_ast_for_in(p) && p.init === node) {
                if (seq == null) {
                  const def = node.definitions[0].name
                  return make_node('AST_SymbolRef', def, def)
                }
                return seq
              }
              if (is_ast_for(p) && p.init === node) {
                return seq
              }
              if (!seq) return make_node('AST_EmptyStatement', node)
              return make_node('AST_SimpleStatement', node, {
                body: seq
              })
            }
            if (is_ast_scope(node)) { return node } // to avoid descending in nested scopes
          }
        }
      )
      self = self.transform(tt)
      if (vars_found > 0) {
        // collect only vars which don't show up in self's arguments list
        let defs: any[] = []
        const is_lambda = is_ast_lambda(self)
        const args_as_names = is_lambda ? (self as any).args_as_names() : null
        vars.forEach((def: AST_VarDef, name) => {
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
          for (let i = 0; i < self.body.length;) {
            if (is_ast_simple_statement(self.body[i])) {
              const expr = self.body[i].body; var sym; var assign
              if (is_ast_assign(expr) &&
                              expr.operator == '=' &&
                              is_ast_symbol((sym = expr.left)) &&
                              vars.has(sym.name)
              ) {
                const def = vars.get(sym.name)
                if (def.value) break
                def.value = expr.right
                remove(defs, def)
                defs.push(def)
                self.body.splice(i, 1)
                continue
              }
              if (is_ast_sequence(expr) &&
                              is_ast_assign((assign = expr.expressions[0])) &&
                              assign.operator == '=' &&
                              is_ast_symbol((sym = assign.left)) &&
                              vars.has(sym.name)
              ) {
                const def = vars.get(sym.name)
                if (def.value) break
                def.value = assign.right
                remove(defs, def)
                defs.push(def)
                self.body[i].body = make_sequence(expr, expr.expressions.slice(1))
                continue
              }
            }
            if (is_ast_empty_statement(self.body[i])) {
              self.body.splice(i, 1)
              continue
            }
            if (is_ast_block_statement(self.body[i])) {
              const tmp = [i, 1].concat(self.body[i].body)
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
    const var_names = this.var_names()
    prefix = prefix.replace(/(?:^[^a-z_$]|[^a-z0-9_$])/ig, '_')
    let name = prefix
    for (let i = 0; var_names.has(name); i++) name = prefix + '$' + i
    this.add_var_name(name)
    return name
  }

  hoist_properties (compressor: Compressor) {
    const self = this
    if (!compressor.option('hoist_props') || compressor.has_directive('use asm')) return self
    const top_retain = is_ast_toplevel(self) && compressor.top_retain || (() => false)
    const defs_by_id = new Map()
    var hoister = new TreeTransformer(function (this, node: AST_Node, descend: Function) {
      if (is_ast_definitions(node) &&
              is_ast_export(hoister.parent())) return node
      if (is_ast_var_def(node)) {
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
                  is_ast_object(value) &&
                  value.properties.every((prop: any) => typeof prop.key === 'string')
        ) {
          descend(node, this)
          const defs = new Map()
          const assignments: any[] = []
          value.properties.forEach(function (prop: any) {
            assignments.push(make_node('AST_VarDef', node, {
              name: make_sym(sym, prop.key, defs),
              value: prop.value
            }))
          })
          defs_by_id.set(def.id, defs)
          return MAP.splice(assignments)
        }
      } else if (is_ast_prop_access(node) &&
              is_ast_symbol_ref(node.expression)
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

      function make_sym (sym: AST_Symbol, key: string, defs: Map<string, any>) {
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

  init_scope_vars (parent: AST_Node) {
    return init_scope_vars.call(this, parent)
  }

  var_names = function varNames (this: any): Set<string> | null {
    let var_names = this._var_name_cache
    if (!var_names) {
      this._var_name_cache = var_names = new Set(
        this.parent_scope ? varNames.call(this.parent_scope) : null
      )
      if (this._added_var_names) {
        this._added_var_names.forEach(name => { var_names?.add(name) })
      }
      this.enclosed.forEach(function (def: AST_VarDef) {
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
  add_child_scope (scope: AST_Scope) {
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

  is_block_scope () {
    return this._block_scope || false
  }

  find_variable (name: any | string) {
    if (is_ast_symbol(name)) name = name.name
    return this.variables.get(name) ||
          (this.parent_scope?.find_variable(name))
  }

  def_function (this: any, symbol: any, init: boolean) {
    const def = this.def_variable(symbol, init)
    if (!def.init || is_ast_defun(def.init)) def.init = init
    this.functions.set(symbol.name, def)
    return def
  }

  def_variable (symbol: any, init?: boolean) {
    let def = this.variables.get(symbol.name)
    if (def) {
      def.orig.push(symbol)
      if (def.init && (def.scope !== symbol.scope || is_ast_function(def.init))) {
        def.init = init
      }
    } else {
      def = new SymbolDef(this, symbol, init)
      this.variables.set(symbol.name, def)
      def.global = !this.parent_scope
    }
    return (symbol.thedef = def)
  }

  next_mangled (options: any, def: SymbolDef) {
    return next_mangled(this, options)
  }

  get_defun_scope () {
    let self = this
    while (self.is_block_scope()) {
      self = self.parent_scope
    }
    return self
  }

  clone (deep: boolean) {
    const node = this._clone(deep)
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

    if (!(is_ast_toplevel(toplevel))) {
      throw new Error('Invalid toplevel scope')
    }

    // pass 1: setup scope chaining and handle definitions
    let scope: any = this.parent_scope = parent_scope
    let labels = new Map()
    let defun: any = null
    let in_destructuring: any = null
    const for_scopes: any[] = []
    var tw = new TreeWalker((node: AST_Node, descend) => {
      if (node.is_block_scope()) {
        const save_scope = scope
        node.block_scope = scope = new AST_Scope(node)
        scope._block_scope = true
        // AST_Try in the AST sadly *is* (not has) a body itself,
        // and its catch and finally branches are children of the AST_Try itself
        const parent_scope = is_ast_catch(node)
          ? save_scope.parent_scope
          : save_scope
        scope.init_scope_vars(parent_scope)
        scope.uses_with = save_scope.uses_with
        scope.uses_eval = save_scope.uses_eval
        if (options.safari10) {
          if (is_ast_for(node) || is_ast_for_in(node)) {
            for_scopes.push(scope)
          }
        }

        if (is_ast_switch(node)) {
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
      if (is_ast_destructuring(node)) {
        const save_destructuring = in_destructuring
        in_destructuring = node
        descend()
        in_destructuring = save_destructuring
        return true
      }
      if (is_ast_scope(node)) {
                node.init_scope_vars?.(scope)
                const save_scope = scope
                const save_defun = defun
                const save_labels = labels
                defun = scope = node
                labels = new Map()
                descend()
                scope = save_scope
                defun = save_defun
                labels = save_labels
                return true // don't descend again in TreeWalker
      }
      if (is_ast_labeled_statement(node)) {
        const l = node.label
        if (labels.has(l.name)) {
          throw new Error(string_template('Label {name} defined twice', l))
        }
        labels.set(l.name, l)
        descend()
        labels.delete(l.name)
        return true // no descend again
      }
      if (is_ast_with(node)) {
        for (let s: any | null = scope; s; s = s.parent_scope) { s.uses_with = true }
        return
      }
      if (is_ast_symbol(node)) {
        node.scope = scope
      }
      if (is_ast_label(node)) {
        // TODO: check type
        node.thedef = node
        node.references = [] as any
      }
      if (is_ast_symbol_lambda(node)) {
        defun.def_function(node, node.name == 'arguments' ? undefined : defun)
      } else if (is_ast_symbol_defun(node)) {
        mark_export((node.scope = defun.parent_scope.get_defun_scope()).def_function(node, defun), 1)
      } else if (is_ast_symbol_class(node)) {
        mark_export(defun.def_variable(node, defun), 1)
      } else if (is_ast_symbol_import(node)) {
        scope.def_variable(node)
      } else if (is_ast_symbol_def_class(node)) {
        // This deals with the name of the class being available
        // inside the class.
        mark_export((node.scope = defun.parent_scope).def_function(node, defun), 1)
      } else if (
        is_ast_symbol_var(node) ||
                is_ast_symbol_let(node) ||
                is_ast_symbol_const(node) ||
                is_ast_symbol_catch(node)
      ) {
        let def: any
        if (is_ast_symbol_block_declaration(node)) {
          def = scope.def_variable(node, null)
        } else {
          def = defun.def_variable(node, (node as any).TYPE == 'SymbolVar' ? null : undefined)
        }
        if (!def.orig.every((sym: AST_Symbol) => {
          if (sym === node) return true
          if (is_ast_symbol_block_declaration(node)) {
            return is_ast_symbol_lambda(sym)
          }
          return !(is_ast_symbol_let(sym) || is_ast_symbol_const(sym))
        })) {
          js_error(
                        `"${node.name}" is redeclared`,
                        node.start.file,
                        node.start.line,
                        node.start.col,
                        node.start.pos
          )
        }
        if (!(is_ast_symbol_funarg(node))) mark_export(def, 2)
        if (defun !== scope) {
          node.mark_enclosed()
          const def = scope.find_variable(node)
          if (node.thedef !== def) {
            node.thedef = def
            node.reference()
          }
        }
      } else if (is_ast_label_ref(node)) {
        const sym = labels.get(node.name)
        if (!sym) {
          throw new Error(string_template('Undefined label {name} [{line},{col}]', {
            name: node.name,
            line: node.start.line,
            col: node.start.col
          }))
        }
        node.thedef = sym
      }
      if (!(is_ast_toplevel(scope)) && (is_ast_export(node) || is_ast_import(node))) {
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

    function mark_export (def: SymbolDef, level: number) {
      if (in_destructuring) {
        let i = 0
        do {
          level++
        } while (tw.parent(i++) !== in_destructuring)
      }
      const node = tw.parent(level)
      def.export = is_ast_export(node) ? MASK_EXPORT_DONT_MANGLE : 0
      if (def.export) {
        const exported = node.exported_definition
        if ((is_ast_defun(exported) || is_ast_def_class(exported)) && node.is_default) {
          def.export = MASK_EXPORT_WANT_MANGLE
        }
      }
    }

    // pass 2: find back references and eval
    const is_toplevel = is_ast_toplevel(this)
    if (is_toplevel) {
      this.globals = new Map()
    }

    tw = new TreeWalker((node: AST_Node) => {
      if (is_ast_loop_control(node) && node.label) {
        node.label.thedef.references.push(node) // TODO: check type
        return true
      }
      if (is_ast_symbol_ref(node)) {
        const name = node.name
        if (name == 'eval' && is_ast_call(tw.parent())) {
          for (let s: any = node.scope; s && !s.uses_eval; s = s.parent_scope) {
            s.uses_eval = true
          }
        }
        let sym
        if (is_ast_name_mapping(tw.parent()) && tw.parent(1).module_name ||
                    !(sym = node.scope.find_variable(name))) {
          sym = toplevel.def_global?.(node)
          if (is_ast_symbol_export(node)) sym.export = MASK_EXPORT_DONT_MANGLE
        } else if (is_ast_lambda(sym.scope) && name == 'arguments') {
          sym.scope.uses_arguments = true
        }
        node.thedef = sym
        node.reference()
        if (node.scope.is_block_scope() &&
                    !(is_ast_symbol_block_declaration(sym.orig[0]))) {
          node.scope = node.scope.get_defun_scope()
        }
        return true
      }
      // ensure mangling works if catch reuses a scope variable
      let def
      if (is_ast_symbol_catch(node) && (def = redefined_catch_def(node.definition()))) {
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
      walk(this, (node: AST_Node) => {
        if (is_ast_symbol_catch(node)) {
          const name = node.name
          const refs = node.thedef.references
          const scope = node.scope.get_defun_scope()
          const def = scope.find_variable(name) ||
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
                scope.parent_scope?.variables.forEach(function (def: AST_VarDef) {
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
