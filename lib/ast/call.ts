import AST_VarDef from './var-def'
import AST_Node from './node'
import AST_Hole from './hole'
import AST_Array from './array'
import Compressor from '../compressor'
import TreeWalker from '../tree-walker'

import {
  blockStateMentCodeGen,
  is_reachable,
  retain_top_func,
  best_of,
  is_func_expr,
  recursive_ref,
  find_scope,
  scope_encloses_variables_in_this_scope,
  is_empty,
  is_iife_call,
  make_node,
  is_undeclared_ref,
  trim,
  anyMayThrow,
  anySideEffect,
  do_list,
  to_moz,
  list_overhead,
  callCodeGen,
  regexp_source_fix,
  make_node_from_constant,
  base54,
  make_sequence,
  walk,
  has_annotation,
  inline_array_like_spread, is_ast_expansion, is_ast_string, is_ast_return, is_ast_var, is_ast_default_assign, is_ast_scope, is_ast_catch, is_ast_lambda, is_ast_prop_access, is_ast_dot, is_ast_new, is_ast_symbol_ref, is_ast_simple_statement, is_ast_empty_statement, is_ast_destructuring, is_ast_iteration_statement, is_ast_node, is_ast_export, is_ast_function, is_ast_number, is_ast_toplevel, is_ast_assign, is_ast_array, is_ast_symbol_funarg, is_ast_call, is_ast_class, is_ast_block
} from '../utils'

import {
  has_flag,
  set_flag,
  SQUEEZED,
  identifier_atom,
  static_fns,
  native_fns,
  global_objs,
  global_pure_fns,
  UNUSED,
  walk_abort,
  _INLINE,
  _PURE,
  _NOINLINE
} from '../constants'

import GetOutputStream, { OutputStream } from '../output'

import { parse, JS_Parse_Error } from '../parse'

export default class AST_Call extends AST_Node {
  expression: AST_Node
  args: AST_Node[]
  _annotations: number

  _prepend_comments_check (node: AST_Node) {
    return this.TYPE == 'Call' && this.expression === node
  }

  _optimize (compressor: Compressor) {
    const self: any = this
    const exp = self.expression
    let fn = exp
    inline_array_like_spread(self, compressor, self.args)
    const simple_args = self.args.every((arg) =>
      !(is_ast_expansion(arg))
    )
    if (compressor.option('reduce_vars') &&
          is_ast_symbol_ref(fn) &&
          !has_annotation(self, _NOINLINE)
    ) {
      const fixed = fn.fixed_value()
      if (!retain_top_func(fixed, compressor)) {
        fn = fixed
      }
    }
    const is_func = is_ast_lambda(fn)
    if (compressor.option('unused') &&
          simple_args &&
          is_func &&
          !fn.uses_arguments &&
          !fn.pinned()) {
      let pos = 0; let last = 0
      for (let i = 0, len = self.args.length; i < len; i++) {
        if (is_ast_expansion(fn.argnames[i])) {
          if (has_flag(fn.argnames[i].expression, UNUSED)) {
            while (i < len) {
              const node = self.args[i++].drop_side_effect_free(compressor)
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
        const trim = i >= fn.argnames.length
        if (trim || has_flag(fn.argnames[i], UNUSED)) {
          const node = self.args[i].drop_side_effect_free(compressor)
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
            } else if (is_ast_number(self.args[0]) && self.args[0].value <= 11) {
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
            if (self.args.length == 1 && is_ast_string(self.args[0]) && compressor.option('unsafe_symbols')) { self.args.length = 0 }
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
                    const value = arg.evaluate(compressor)
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
      } else if (is_ast_dot(exp)) {
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
            if (is_ast_array(exp.expression)) {
              let shouldBreak = false
              let separator
              if (self.args.length > 0) {
                separator = self.args[0].evaluate(compressor)
                if (separator === self.args[0]) { // not a constant
                  shouldBreak = true
                }
              }
              if (!shouldBreak) {
                const elements: any[] = []
                const consts: any[] = []
                for (let i = 0, len = exp.expression.elements.length; i < len; i++) {
                  const el = exp.expression.elements[i]
                  if (is_ast_expansion(el)) {
                    shouldBreak = true
                    break
                  }
                  const value = el.evaluate(compressor)
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
                if (!shouldBreak) {
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
                    let first
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
                  const node = self.clone()
                  node.expression = node.expression.clone()
                  node.expression.expression = node.expression.expression.clone()
                  node.expression.expression.elements = elements
                  return best_of(compressor, self, node)
                }
              }
            }
            break
          case 'charAt':
            if (exp.expression.is_string(compressor)) {
              const arg = self.args[0]
              const index = arg ? arg.evaluate(compressor) : 0
              if (index !== arg) {
                return make_node('AST_Sub', exp, {
                  expression: exp.expression,
                  property: make_node_from_constant(index | 0, arg || exp)
                }).optimize(compressor)
              }
            }
            break
          case 'apply':
            if (self.args.length == 2 && is_ast_array(self.args[1])) {
              const args = self.args[1].elements.slice()
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
            if (is_ast_symbol_ref(func)) {
              func = func.fixed_value()
            }
            if (is_ast_lambda(func) && !func.contains_this()) {
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
        is_ast_string(x)
      )) {
        // quite a corner-case, but we can handle it:
        //   https://github.com/mishoo/UglifyJS2/issues/203
        // if the code argument is a constant, then we can minify it.
        try {
          const code = 'n(function(' + self.args.slice(0, -1).map(function (arg) {
            return arg.value
          }).join(',') + '){' + self.args[self.args.length - 1].value + '})'
          let ast = parse(code)
          const mangle = { ie8: compressor.option('ie8') }
          ast.figure_out_scope(mangle)
          const comp = new Compressor(compressor.options)
          ast = ast.transform(comp)
          ast.figure_out_scope(mangle)
          base54.reset()
          ast.compute_char_frequency(mangle)
          ast.mangle_names(mangle)
          let fun
          walk(ast, (node: AST_Node) => {
            if (is_func_expr(node)) {
              fun = node
              return walk_abort
            }
          })
          const code2 = GetOutputStream()
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
            compressor.warn(ex.message)
          } else {
            throw ex
          }
        }
      }
    }
    const stat = is_func && fn.body[0]
    const is_regular_func = is_func && !fn.is_generator && !fn.async
    const can_inline = is_regular_func && compressor.option('inline') && !self.is_expr_pure(compressor)
    if (can_inline && is_ast_return(stat)) {
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
              (is_ast_symbol_funarg(fn.argnames[0])) &&
              self.args.length < 2 &&
              is_ast_symbol_ref(returned) &&
              returned.name === fn.argnames[0].name
      ) {
        let parent
        if (
          is_ast_prop_access(self.args[0]) &&
                  is_ast_call((parent = compressor.parent())) &&
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
              !(is_ast_class(compressor.parent())) &&
              !(fn.name && is_ast_function(fn)) &&
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
                  if (is_ast_default_assign(p)) return true
                  if (is_ast_block(p)) break
                }
                return false
              })() &&
              !(is_ast_class(scope))
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
          is_ast_simple_statement(compressor.parent()) &&
          is_iife_call(self)) {
      return self.negate(compressor, true)
    }
    let ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self

    function return_value (stat) {
      if (!stat) return make_node('AST_Undefined', self)
      if (is_ast_return(stat)) {
        if (!stat.value) return make_node('AST_Undefined', self)
        return stat.value.clone(true)
      }
      if (is_ast_simple_statement(stat)) {
        return make_node('AST_UnaryPrefix', stat, {
          operator: 'void',
          expression: (stat.body).clone(true)
        })
      }
    }

    function can_flatten_body (stat) {
      const body = fn.body
      const len = body.length
      if (compressor.option('inline') < 3) {
        return len == 1 && return_value(stat)
      }
      stat = null
      for (let i = 0; i < len; i++) {
        const line = body[i]
        if (is_ast_var(line)) {
          if (stat && !line.definitions.every((var_def) =>
            !var_def.value
          )) {
            return false
          }
        } else if (stat) {
          return false
        } else if (!(is_ast_empty_statement(line))) {
          stat = line
        }
      }
      return return_value(stat)
    }

    function can_inject_args (block_scoped, safe_to_inject) {
      for (let i = 0, len = fn.argnames.length; i < len; i++) {
        const arg = fn.argnames[i]
        if (is_ast_default_assign(arg)) {
          if (has_flag(arg.left, UNUSED)) continue
          return false
        }
        if (is_ast_destructuring(arg)) return false
        if (is_ast_expansion(arg)) {
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
      const arg_vals_outer_refs = new Set()
      const value_walker = (node: AST_Node) => {
        if (is_ast_scope(node)) {
          const scope_outer_refs = new Set()
          node.enclosed.forEach(function (def: AST_VarDef) {
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
        const arg = fn.argnames[i]
        if (is_ast_default_assign(arg) && has_flag(arg.left, UNUSED)) continue
        if (is_ast_expansion(arg) && has_flag(arg.expression, UNUSED)) continue
        if (has_flag(arg, UNUSED)) continue
        if (arg_vals_outer_refs.has(arg.name)) return false
      }
      for (let i = 0, len = fn.body.length; i < len; i++) {
        const stat = fn.body[i]
        if (!(is_ast_var(stat))) continue
        for (let j = stat.definitions.length; --j >= 0;) {
          const name = stat.definitions[j].name
          if (is_ast_destructuring(name) ||
                      arg_vals_outer_refs.has(name.name)) {
            return false
          }
        }
      }
      return true
    }

    function can_inject_vars (block_scoped, safe_to_inject) {
      const len = fn.body.length
      for (let i = 0; i < len; i++) {
        const stat = fn.body[i]
        if (!(is_ast_var(stat))) continue
        if (!safe_to_inject) return false
        for (let j = stat.definitions.length; --j >= 0;) {
          const name = stat.definitions[j].name
          if (is_ast_destructuring(name) ||
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
      const block_scoped = new Set()
      do {
        scope = compressor.parent(++level)
        if (scope.is_block_scope() && scope.block_scope) {
          // TODO this is sometimes undefined during compression.
          // But it should always have a value!
          scope.block_scope.variables.forEach(function (variable) {
            block_scoped.add(variable.name)
          })
        }
        if (is_ast_catch(scope)) {
          // TODO can we delete? AST_Catch is a block scope.
          if (scope.argname) {
            block_scoped.add(scope.argname.name)
          }
        } else if (is_ast_iteration_statement(scope)) {
          in_loop = []
        } else if (is_ast_symbol_ref(scope)) {
          if (is_ast_scope(scope.fixed_value())) return false
        }
      } while (!(is_ast_scope(scope)))

      const safe_to_inject = !(is_ast_toplevel(scope)) || compressor.toplevel.vars
      const inline = compressor.option('inline')
      if (!can_inject_vars(block_scoped, inline >= 3 && safe_to_inject)) return false
      if (!can_inject_args(block_scoped, inline >= 2 && safe_to_inject)) return false
      if (!can_inject_args_values()) return false
      return !in_loop || in_loop.length == 0 || !is_reachable(fn, in_loop)
    }

    function append_var (decls, expressions: AST_Node[], name, value) {
      const def = name.definition?.()
      scope.variables.set(name.name, def)
      scope.enclosed.push(def)
      if (!scope.var_names().has(name.name)) {
        scope.add_var_name(name.name)
        decls.push(make_node('AST_VarDef', name, {
          name: name,
          value: null
        }))
      }
      const sym = make_node('AST_SymbolRef', name, name)
      def.references.push(sym)
      if (value) {
        expressions.push(make_node('AST_Assign', self, {
          operator: '=',
          left: sym,
          right: value.clone()
        }))
      }
    }

    function flatten_args (decls, expressions: AST_Node[]) {
      const len = fn.argnames.length
      for (var i = self.args.length; --i >= len;) {
        expressions.push(self.args[i])
      }
      for (i = len; --i >= 0;) {
        const name = fn.argnames[i]
        let value = self.args[i]
        if (has_flag(name, UNUSED) || !name.name || scope.var_names().has(name.name)) {
          if (value) expressions.push(value)
        } else {
          const symbol = make_node('AST_SymbolVar', name, name)
                  name.definition?.().orig.push(symbol)
                  if (!value && in_loop) value = make_node('AST_Undefined', self)
                  append_var(decls, expressions, symbol, value)
        }
      }
      decls.reverse()
      expressions.reverse()
    }

    function flatten_vars (decls, expressions: AST_Node[]) {
      let pos = expressions.length
      for (let i = 0, lines = fn.body.length; i < lines; i++) {
        const stat = fn.body[i]
        if (!(is_ast_var(stat))) continue
        for (let j = 0, defs = stat.definitions.length; j < defs; j++) {
          const var_def = stat.definitions[j]
          var name = var_def.name
          append_var(decls, expressions, name, var_def.value)
          if (in_loop && fn.argnames.every((argname) =>
            argname.name != name.name
          )) {
            const def = fn.variables.get(name.name)
            const sym = make_node('AST_SymbolRef', name, name)
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
      const decls: any[] = []
      const expressions: any[] = []
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

  drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean) {
    if (!this.is_expr_pure(compressor)) {
      if (this.expression.is_call_pure(compressor)) {
        let exprs = this.args.slice()
        exprs.unshift(this.expression.expression)
        exprs = trim(exprs, compressor, first_in_statement)
        return exprs && make_sequence(this, exprs)
      }
      if (is_func_expr(this.expression) &&
              (!this.expression.name || !this.expression.name.definition?.().references.length)) {
        const node = this.clone()
        node.expression.process_expression(false, compressor)
        return node
      }
      return this
    }
    if (has_annotation(this, _PURE)) {
      compressor.warn('Dropping __PURE__ call [{file}:{line},{col}]', this.start)
    }
    const args = trim(this.args, compressor, first_in_statement)
    return args && make_sequence(this, args)
  }

  may_throw (compressor: Compressor) {
    if (anyMayThrow(this.args, compressor)) return true
    if (this.is_expr_pure(compressor)) return false
    if (this.expression.may_throw(compressor)) return true
    return !(is_ast_lambda(this.expression)) ||
          anyMayThrow(this.expression.body, compressor)
  }

  has_side_effects (compressor: Compressor) {
    if (!this.is_expr_pure(compressor) &&
          (!this.expression.is_call_pure(compressor) ||
              this.expression.has_side_effects(compressor))) {
      return true
    }
    return anySideEffect(this.args, compressor)
  }

  _eval (compressor: Compressor, depth: number) {
    const exp = this.expression
    if (compressor.option('unsafe') && is_ast_prop_access(exp)) {
      let key = exp.property
      if (key instanceof AST_Node && is_ast_node(key)) {
        key = key._eval?.(compressor, depth)
        if (key === exp.property) return this
      }
      let val
      const e = exp.expression
      if (is_undeclared_ref(e)) {
        let first_arg =
                  e.name === 'hasOwnProperty' &&
                  key === 'call' &&
                  (this.args[0]?.evaluate(compressor))

        first_arg = is_ast_dot(first_arg) ? first_arg.expression : first_arg

        if ((first_arg == null || first_arg.thedef?.undeclared)) {
          return this.clone()
        }
        const static_fn = static_fns.get(e.name)
        if (!static_fn || !static_fn.has(key)) return this
        val = global_objs[e.name]
      } else {
        val = e._eval(compressor, depth + 1)
        if (val === e || !val) return this
        const native_fn = native_fns.get(val.constructor.name)
        if (!native_fn || !native_fn.has(key)) return this
      }
      const args: any[] = []
      for (let i = 0, len = this.args.length; i < len; i++) {
        const arg = this.args[i]
        const value = arg._eval(compressor, depth)
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

  is_expr_pure (compressor: Compressor) {
    if (compressor.option('unsafe')) {
      const expr = this.expression
      const first_arg = (this.args?.[0]?.evaluate(compressor))
      if (
        expr.expression && (expr.expression as any).name === 'hasOwnProperty' &&
              (first_arg == null || first_arg.thedef?.undeclared)
      ) {
        return false
      }
      if (is_undeclared_ref(expr) && global_pure_fns.has(expr.name)) return true
      let static_fn
      if (is_ast_dot(expr) &&
              is_undeclared_ref(expr.expression) &&
              (static_fn = static_fns.get(expr.expression.name)) &&
              static_fn.has(expr.property)) {
        return true
      }
    }
    return !!has_annotation(this, _PURE) || !compressor.pure_funcs(this)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      const args = this.args
      for (let i = 0, len = args.length; i < len; i++) {
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

  shallow_cmp_props: any = {}
  _transform (this: AST_Call, tw: TreeWalker) {
    this.expression = this.expression.transform(tw)
    this.args = do_list(this.args, tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'CallExpression',
      callee: to_moz(this.expression),
      arguments: this.args.map(to_moz)
    }
  }

  needs_parens (output: OutputStream) {
    const p = output.parent(); let p1
    if (is_ast_new(p) && p.expression === this ||
            is_ast_export(p) && p.is_default && is_ast_function(this.expression)) { return true }

    // workaround for Safari bug.
    // https://bugs.webkit.org/show_bug.cgi?id=123506
    return is_ast_function(this.expression) &&
            is_ast_prop_access(p) &&
            p.expression === this &&
            is_ast_assign((p1 = output.parent(1))) &&
            p1.left === p
  }

  _codegen (self: AST_Call, output: OutputStream) {
    return callCodeGen(self, output)
  }

  static documentation = 'A function call expression'
  static propdoc = {
    expression: '[AST_Node] expression to invoke as function',
    args: '[AST_Node*] array of arguments',
    _annotations: '[number] bitfield containing information about the call'
  }

  static PROPS = AST_Node.PROPS.concat(['expression', 'args', '_annotations'])
  constructor (args) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.args = args.args
    this._annotations = args._annotations || 0
  }
}
