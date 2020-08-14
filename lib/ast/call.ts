import AST_Node from './node'
import AST_Hole from './hole'
import AST_Array from './array'
import Compressor from '../compressor'

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
  pass_through,
  callCodeGen,
  regexp_source_fix,
  make_node_from_constant,
  base54,
  make_sequence,
  walk,
  has_annotation,
  inline_array_like_spread
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

import { OutputStream } from '../output'

import { parse, JS_Parse_Error } from '../parse'

export default class AST_Call extends AST_Node {
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
