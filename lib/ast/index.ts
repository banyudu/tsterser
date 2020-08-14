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
  make_node,
  regexp_source_fix,
  return_true,
  return_this,
  has_annotation,
  push,
  pop,
  mark,
  pass_through,
  mkshallow,
  to_moz,
  to_moz_in_destructuring,
  best_of_expression,
  best_of,
  make_sequence,
  first_in_statement,
  is_undefined,
  anySideEffect,
  anyMayThrow,
  list_overhead,
  make_node_from_constant,
  walk,
  do_list,
  maintain_this_binding,
  walk_body,
  is_func_expr,
  is_modified,
  trim,
  inline_array_like_spread,
  is_undeclared_ref,
  is_empty,
  blockStateMentCodeGen,
  suppress,
  basic_negation,
  find_scope,
  is_iife_call,
  safe_to_assign,
  is_reachable,
  is_object,
  is_nullish,
  recursive_ref,
  best,
  mark_escaped,
  needsParens,
  retain_top_func,
  scope_encloses_variables_in_this_scope,
  callCodeGen
} from '../utils'

import { parse, PRECEDENCE, JS_Parse_Error } from '../parse'
import { OutputStream } from '../output'

import { base54 } from '../scope'

import {
  UNUSED,
  TRUTHY,
  FALSY,
  WRITE_ONLY,
  SQUEEZED,
  native_fns,
  has_flag,
  static_fns,
  global_pure_fns,
  set_flag,
  lazy_op,
  binary_bool,
  binary,
  non_converting_binary,
  ASSIGN_OPS,
  ASSIGN_OPS_COMMUTATIVE,
  commutativeOperators,
  identifier_atom,
  walk_abort,
  _PURE,
  _NOINLINE,
  _INLINE,
  global_objs
} from '../constants'

import Compressor from '../compressor'

import TreeWalker from '../tree-walker'

import AST_Accessor from './accessor'
import AST_Arrow from './arrow'
import AST_Defun from './defun'
import AST_Function from './function'
import AST_ClassExpression from './class-expression'
import AST_DefClass from './def-class'
import AST_Toplevel from './toplevel'
import AST_Lambda from './lambda'
import AST_Class from './class'
import AST_Scope from './scope'
import AST_Conditional from './conditional'
import AST_SymbolExport from './symbol-export'
import AST_SymbolRef from './symbol-ref'
import AST_False from './false'
import AST_True from './true'
import AST_Super from './super'
import AST_Finally from './finally'
import AST_Catch from './catch'
import AST_Switch from './switch'
import AST_Try from './try'
import AST_Unary from './unary'
import AST_UnaryPrefix from './unary-prefix'
import AST_UnaryPostfix from './unary-postfix'
import AST_VarDef from './var-def'
import AST_NameMapping from './name-mapping'
import AST_Import from './import'
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
