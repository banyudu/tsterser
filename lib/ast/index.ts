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
  member,
  return_null,
  walk_parent,
  pass_through,
  mkshallow,
  to_moz,
  to_moz_in_destructuring,
  To_Moz_Literal,
  best_of_expression,
  best_of,
  make_sequence,
  merge_sequence,
  first_in_statement,
  is_undefined,
  force_statement,
  make_block,
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
  read_property,
  as_statement_array,
  has_break_or_continue,
  block_aborts,
  trim,
  inline_array_like_spread,
  print_braced_empty,
  lift_key,
  print_property_name,
  keep_name
} from '../utils'

import { parse, js_error, is_basic_identifier_string, is_identifier_string, PRECEDENCE, RESERVED_WORDS, JS_Parse_Error } from '../parse'
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
  static_values,
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
  clear_flag
} from '../constants'

import Compressor from '../compressor'

import TreeWalker from '../tree-walker'

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

let unmangleable_names: Set<any> | null = null

let printMangleOptions

// Returns whether the leftmost item in the expression is an object
export function left_is_object (node: any): boolean {
  if (node instanceof AST_Object) return true
  if (node instanceof AST_Sequence) return left_is_object(node.expressions[0])
  if (node.TYPE === 'Call') return left_is_object(node.expression)
  if (node instanceof AST_PrefixedTemplateString) return left_is_object(node.prefix)
  if (node instanceof AST_Dot || node instanceof AST_Sub) return left_is_object(node.expression)
  if (node instanceof AST_Conditional) return left_is_object(node.condition)
  if (node instanceof AST_Binary) return left_is_object(node.left)
  if (node instanceof AST_UnaryPostfix) return left_is_object(node.expression)
  return false
}

function init_scope_vars (parent_scope: any) {
  this.variables = new Map() // map name to AST_SymbolVar (variables defined in this scope; includes functions)
  this.functions = new Map() // map name to AST_SymbolDefun (functions defined in this scope)
  this.uses_with = false // will be set to true if this or some nested scope uses the `with` statement
  this.uses_eval = false // will be set to true if this or nested scope uses the global `eval`
  this.parent_scope = parent_scope // the parent scope
  this.enclosed = [] // a list of variables from this or outer scope(s) that are referenced from this or inner scopes
  this.cname = -1 // the current index for mangling functions/variables
  this._var_name_cache = null
}

function blockStateMentCodeGen (self, output) {
  print_braced(self, output)
}

function callCodeGen (self, output) {
  self.expression.print(output)
  if (self instanceof AST_New && self.args.length === 0) { return }
  if (self.expression instanceof AST_Call || self.expression instanceof AST_Lambda) {
    output.add_mapping(self.start)
  }
  output.with_parens(function () {
    self.args.forEach(function (expr, i) {
      if (i) output.comma()
      expr.print(output)
    })
  })
}

/* #__INLINE__ */
const key_size = key =>
  typeof key === 'string' ? key.length : 0

/* #__INLINE__ */
const lambda_modifiers = func =>
  (func.is_generator ? 1 : 0) + (func.async ? 6 : 0)

/* #__INLINE__ */
const static_size = is_static => is_static ? 7 : 0

/* #__INLINE__ */
const def_size = (size, def) => size + list_overhead(def.definitions)

function to_moz_block (node: any) {
  return {
    type: 'BlockStatement',
    body: node.body.map(to_moz)
  }
}

function to_moz_scope (type: string, node: any) {
  var body = node.body.map(to_moz)
  if (node.body[0] instanceof AST_SimpleStatement && (node.body[0]).body instanceof AST_String) {
    body.unshift(to_moz(new AST_EmptyStatement(node.body[0])))
  }
  return {
    type: type,
    body: body
  }
}

/* -----[ statements ]----- */

class AST_BlockStatement extends AST_Block {
  _optimize (self, compressor) {
    tighten_body(self.body, compressor)
    switch (self.body.length) {
      case 1:
        if (!compressor.has_directive('use strict') &&
              compressor.parent() instanceof AST_If &&
              can_be_extracted_from_if_block(self.body[0]) ||
              can_be_evicted_from_block(self.body[0])) {
          return self.body[0]
        }
        break
      case 0: return make_node('AST_EmptyStatement', self)
    }
    return self
  }

  aborts = block_aborts
  _to_mozilla_ast (parent): any {
    return {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
  }

  _codegen = blockStateMentCodeGen
  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A block statement'

  TYPE = 'BlockStatement'
  static PROPS = AST_Block.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_For extends AST_IterationStatement {
  _optimize (self, compressor) {
    if (!compressor.option('loops')) return self
    if (compressor.option('side_effects') && self.init) {
      self.init = self.init.drop_side_effect_free(compressor)
    }
    if (self.condition) {
      var cond = self.condition.evaluate(compressor)
      if (!(cond instanceof AST_Node)) {
        if (cond) self.condition = null
        else if (!compressor.option('dead_code')) {
          var orig = self.condition
          self.condition = make_node_from_constant(cond, self.condition)
          self.condition = best_of_expression(self.condition.transform(compressor), orig)
        }
      }
      if (compressor.option('dead_code')) {
        if (cond instanceof AST_Node) cond = self.condition.tail_node().evaluate(compressor)
        if (!cond) {
          var body: any[] = []
          extract_declarations_from_unreachable_code(compressor, self.body, body)
          if (self.init instanceof AST_Statement) {
            body.push(self.init)
          } else if (self.init) {
            body.push(make_node('AST_SimpleStatement', self.init, {
              body: self.init
            }))
          }
          body.push(make_node('AST_SimpleStatement', self.condition, {
            body: self.condition
          }))
          return make_node('AST_BlockStatement', self, { body: body }).optimize(compressor)
        }
      }
    }
    return if_break_in_loop(self, compressor)
  }

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    reset_block_variables(compressor, this)
    if (this.init) this.init.walk(tw)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    if (this.condition) this.condition.walk(tw)
    this.body.walk(tw)
    if (this.step) {
      if (has_break_or_continue(this)) {
        pop(tw)
        push(tw)
      }
      this.step.walk(tw)
    }
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      if (this.init) this.init._walk(visitor)
      if (this.condition) this.condition._walk(visitor)
      if (this.step) this.step._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    if (this.step) push(this.step)
    if (this.condition) push(this.condition)
    if (this.init) push(this.init)
  }

  _size = () => 8
  shallow_cmp = mkshallow({
    init: 'exist',
    condition: 'exist',
    step: 'exist'
  })

  _transform (self, tw: any) {
    if (self.init) self.init = self.init.transform(tw)
    if (self.condition) self.condition = self.condition.transform(tw)
    if (self.step) self.step = self.step.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ForStatement',
      init: to_moz(this.init),
      test: to_moz(this.condition),
      update: to_moz(this.step),
      body: to_moz(this.body)
    }
  }

  _codegen (self, output) {
    output.print('for')
    output.space()
    output.with_parens(function () {
      if (self.init) {
        if (self.init instanceof AST_Definitions) {
          self.init.print(output)
        } else {
          parenthesize_for_noin(self.init, output, true)
        }
        output.print(';')
        output.space()
      } else {
        output.print(';')
      }
      if (self.condition) {
        self.condition.print(output)
        output.print(';')
        output.space()
      } else {
        output.print(';')
      }
      if (self.step) {
        self.step.print(output)
      }
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `for` statement'
  static propdoc = {
    init: '[AST_Node?] the `for` initialization code, or null if empty',
    condition: '[AST_Node?] the `for` termination clause, or null if empty',
    step: '[AST_Node?] the `for` update clause, or null if empty'
  } as any

  TYPE = 'For'
  static PROPS = AST_IterationStatement.PROPS.concat(['init', 'condition', 'step'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.init = args.init
    this.condition = args.condition
    this.step = args.step
  }
}

class AST_ForIn extends AST_IterationStatement {
  object: any
  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    reset_block_variables(compressor, this)
    suppress(this.init)
    this.object.walk(tw)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    this.body.walk(tw)
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.init._walk(visitor)
      this.object._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    if (this.object) push(this.object)
    if (this.init) push(this.init)
  }

  _size = () => 8
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.init = self.init?.transform(tw) || null
    self.object = self.object.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ForInStatement',
      left: to_moz(this.init),
      right: to_moz(this.object),
      body: to_moz(this.body)
    }
  }

  _codegen (self, output) {
    output.print('for')
    if (self.await) {
      output.space()
      output.print('await')
    }
    output.space()
    output.with_parens(function () {
            self.init?.print(output)
            output.space()
            output.print(self instanceof AST_ForOf ? 'of' : 'in')
            output.space()
            self.object.print(output)
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `for ... in` statement'
  static propdoc = {
    init: '[AST_Node] the `for/in` initialization code',
    object: "[AST_Node] the object that we're looping through"
  } as any

  TYPE = 'ForIn'
  static PROPS = AST_IterationStatement.PROPS.concat(['init', 'object'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.init = args.init
    this.object = args.object
  }
}

class AST_ForOf extends AST_ForIn {
  await: any
  shallow_cmp = pass_through
  _to_mozilla_ast (parent): any {
    return {
      type: 'ForOfStatement',
      left: to_moz(this.init),
      right: to_moz(this.object),
      body: to_moz(this.body),
      await: this.await
    }
  }

  static documentation = 'A `for ... of` statement'

  TYPE = 'ForOf'
  static PROPS = AST_ForIn.PROPS.concat(['await'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.await = args.await
  }
}

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
      if (insert && node instanceof AST_SimpleStatement) {
        return make_node('AST_Return', node, {
          value: node.body
        })
      }
      if (!insert && node instanceof AST_Return) {
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
      if (node instanceof AST_Class || node instanceof AST_Lambda && (node as any) !== self) {
        return node
      }
      if (node instanceof AST_Block) {
        var index = node.body.length - 1
        if (index >= 0) {
          node.body[index] = node.body[index].transform(tt)
        }
      } else if (node instanceof AST_If) {
        node.body = (node.body).transform(tt)
        if (node.alternative) {
          node.alternative = node.alternative.transform(tt)
        }
      } else if (node instanceof AST_With) {
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
    var drop_funcs = !(self instanceof AST_Toplevel) || compressor.toplevel.funcs
    var drop_vars = !(self instanceof AST_Toplevel) || compressor.toplevel.vars
    const assign_as_unused = typeof optUnused === 'string' && optUnused.includes('keep_assign') ? return_false : function (node: any) {
      if (node instanceof AST_Assign &&
              (has_flag(node, WRITE_ONLY) || node.operator == '=')
      ) {
        return node.left
      }
      if (node instanceof AST_Unary && has_flag(node, WRITE_ONLY)) {
        return node.expression
      }
    }
    var in_use_ids = new Map()
    var fixed_ids = new Map()
    if (self instanceof AST_Toplevel && compressor.top_retain) {
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
      if (node instanceof AST_Lambda && node.uses_arguments && !tw.has_directive('use strict')) {
        node.argnames.forEach(function (argname) {
          if (!(argname instanceof AST_SymbolDeclaration)) return
          var def = argname.definition?.()
          if (!in_use_ids.has(def.id)) {
            in_use_ids.set(def.id, def)
          }
        })
      }
      if (node === self) return
      if (node instanceof AST_Defun || node instanceof AST_DefClass) {
        var node_def = node.name?.definition?.()
        const in_export = tw.parent() instanceof AST_Export
        if (in_export || !drop_funcs && scope === self) {
          if (node_def.global && !in_use_ids.has(node_def.id)) {
            in_use_ids.set(node_def.id, node_def)
          }
        }
        if (node instanceof AST_DefClass) {
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
      if (node instanceof AST_SymbolFunarg && scope === self) {
        map_add(var_defs_by_id, node.definition?.().id, node)
      }
      if (node instanceof AST_Definitions && scope === self) {
        const in_export = tw.parent() instanceof AST_Export
        node.definitions.forEach(function (def) {
          if (def.name instanceof AST_SymbolVar) {
            map_add(var_defs_by_id, def.name.definition?.().id, def)
          }
          if (in_export || !drop_vars) {
            walk(def.name, (node: any) => {
              if (node instanceof AST_SymbolDeclaration) {
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
            if (def.name instanceof AST_Destructuring) {
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
          if (sym instanceof AST_SymbolRef) {
            var def = sym.definition?.()
            var in_use = in_use_ids.has(def.id)
            if (node instanceof AST_Assign) {
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
                  (node instanceof AST_ClassExpression &&
                      !keep_name(compressor.option('keep_classnames'), (def = node.name?.definition?.()).name) ||
                  node instanceof AST_Function &&
                      !keep_name(compressor.option('keep_fnames'), (def = node.name?.definition?.()).name))) {
          // any declarations with same name will overshadow
          // name of this anonymous function and can therefore
          // never be used anywhere
          if (!in_use_ids.has(def.id) || def.orig.length > 1) node.name = null
        }
        if (node instanceof AST_Lambda && !(node instanceof AST_Accessor)) {
          var trim = !compressor.option('keep_fargs')
          for (var a = node.argnames, i = a.length; --i >= 0;) {
            var sym = a[i]
            if (sym instanceof AST_Expansion) {
              sym = sym.expression
            }
            if (sym instanceof AST_DefaultAssign) {
              sym = sym.left
            }
            // Do not drop destructuring arguments.
            // They constitute a type assertion, so dropping
            // them would stop that TypeError which would happen
            // if someone called it with an incorrectly formatted
            // parameter.
            if (!(sym instanceof AST_Destructuring) && !in_use_ids.has(sym.definition?.().id)) {
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
        if ((node instanceof AST_Defun || node instanceof AST_DefClass) && (node as any) !== self) {
          const def = node.name?.definition?.()
          const keep = def.global && !drop_funcs || in_use_ids.has(def.id)
          if (!keep) {
            compressor[node.name?.unreferenced() ? 'warn' : 'info']('Dropping unused function {name} [{file}:{line},{col}]', template(node.name))
            def.eliminated++
            if (node instanceof AST_DefClass) {
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
        if (node instanceof AST_Definitions && !(parent instanceof AST_ForIn && parent.init === node)) {
          var drop_block = !(parent instanceof AST_Toplevel) && !(node instanceof AST_Var)
          // place uninitialized names at the start
          var body: any[] = []; var head: any[] = []; var tail: any[] = []
          // for unused names whose initialization has
          // side effects, we can cascade the init. code
          // into the next one, or next statement.
          var side_effects: any[] = []
          node.definitions.forEach(function (def) {
            if (def.value) def.value = def.value.transform(tt)
            var is_destructure = def.name instanceof AST_Destructuring
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
              if (def.name instanceof AST_SymbolVar) {
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
            } else if (sym.orig[0] instanceof AST_SymbolCatch) {
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
        if (node instanceof AST_For) {
          descend(node, this)
          var block
          if (node.init instanceof AST_BlockStatement) {
            block = node.init
            node.init = block.body.pop()
            block.body.push(node)
          }
          if (node.init instanceof AST_SimpleStatement) {
            // TODO: check type
            node.init = node.init.body
          } else if (is_empty(node.init)) {
            node.init = null
          }
          return !block ? node : in_list ? MAP.splice(block.body) : block
        }
        if (node instanceof AST_LabeledStatement &&
                  node.body instanceof AST_For
        ) {
          descend(node, this)
          if (node.body instanceof AST_BlockStatement) {
            const block = node.body
            node.body = block.body.pop() // TODO: check type
            block.body.push(node)
            return in_list ? MAP.splice(block.body) : block
          }
          return node
        }
        if (node instanceof AST_BlockStatement) {
          descend(node, this)
          if (in_list && node.body.every(can_be_evicted_from_block)) {
            return MAP.splice(node.body)
          }
          return node
        }
        if (node instanceof AST_Scope) {
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
      if (sym instanceof AST_SymbolRef &&
              !is_ref_of(node.left, AST_SymbolBlockDeclaration) &&
              self.variables.get(sym.name) === (node_def = sym.definition?.())
      ) {
        if (node instanceof AST_Assign) {
          node.right.walk(tw)
          if (!node_def.chained && node.left.fixed_value() === node.right) {
            fixed_ids.set(node_def.id, node)
          }
        }
        return true
      }
      if (node instanceof AST_SymbolRef) {
        node_def = node.definition?.()
        if (!in_use_ids.has(node_def.id)) {
          in_use_ids.set(node_def.id, node_def)
          if (node_def.orig[0] instanceof AST_SymbolCatch) {
            const redef = node_def.scope.is_block_scope() &&
                          node_def.scope.get_defun_scope().variables.get(node_def.name)
            if (redef) in_use_ids.set(redef.id, redef)
          }
        }
        return true
      }
      if (node instanceof AST_Scope) {
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
        if (node instanceof AST_Scope && node !== self) { return true }
        if (node instanceof AST_Var) {
          ++var_decl
          return true
        }
      })
      hoist_vars = hoist_vars && var_decl > 1
      var tt = new TreeTransformer(
        function before (node: any) {
          if (node !== self) {
            if (node instanceof AST_Directive) {
              dirs.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_funs && node instanceof AST_Defun &&
                          !(tt.parent() instanceof AST_Export) &&
                          tt.parent() === self) {
              hoisted.push(node)
              return make_node('AST_EmptyStatement', node)
            }
            if (hoist_vars && node instanceof AST_Var) {
              node.definitions.forEach(function (def) {
                if (def.name instanceof AST_Destructuring) return
                vars.set(def.name.name, def)
                ++vars_found
              })
              var seq = node.to_assignments(compressor)
              var p = tt.parent()
              if (p instanceof AST_ForIn && p.init === node) {
                if (seq == null) {
                  var def = node.definitions[0].name
                  return make_node('AST_SymbolRef', def, def)
                }
                return seq
              }
              if (p instanceof AST_For && p.init === node) {
                return seq
              }
              if (!seq) return make_node('AST_EmptyStatement', node)
              return make_node('AST_SimpleStatement', node, {
                body: seq
              })
            }
            if (node instanceof AST_Scope) { return node } // to avoid descending in nested scopes
          }
        }
      )
      self = self.transform(tt)
      if (vars_found > 0) {
        // collect only vars which don't show up in self's arguments list
        var defs: any[] = []
        const is_lambda = self instanceof AST_Lambda
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
            if (self.body[i] instanceof AST_SimpleStatement) {
              var expr = self.body[i].body; var sym; var assign
              if (expr instanceof AST_Assign &&
                              expr.operator == '=' &&
                              (sym = expr.left) instanceof AST_Symbol &&
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
              if (expr instanceof AST_Sequence &&
                              (assign = expr.expressions[0]) instanceof AST_Assign &&
                              assign.operator == '=' &&
                              (sym = assign.left) instanceof AST_Symbol &&
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
            if (self.body[i] instanceof AST_EmptyStatement) {
              self.body.splice(i, 1)
              continue
            }
            if (self.body[i] instanceof AST_BlockStatement) {
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
    var top_retain = self instanceof AST_Toplevel && compressor.top_retain || return_false
    var defs_by_id = new Map()
    var hoister = new TreeTransformer(function (node: any, descend) {
      if (node instanceof AST_Definitions &&
              hoister.parent() instanceof AST_Export) return node
      if (node instanceof AST_VarDef) {
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
                  value instanceof AST_Object &&
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
      } else if (node instanceof AST_PropAccess &&
              node.expression instanceof AST_SymbolRef
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
    if (name instanceof AST_Symbol) name = name.name
    return this.variables.get(name) ||
          (this.parent_scope && this.parent_scope.find_variable(name))
  }

  def_function (this: any, symbol: any, init: boolean) {
    var def = this.def_variable(symbol, init)
    if (!def.init || def.init instanceof AST_Defun) def.init = init
    this.functions.set(symbol.name, def)
    return def
  }

  def_variable (symbol: any, init?: boolean) {
    var def = this.variables.get(symbol.name)
    if (def) {
      def.orig.push(symbol)
      if (def.init && (def.scope !== symbol.scope || def.init instanceof AST_Function)) {
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

    if (!(toplevel instanceof AST_Toplevel)) {
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
        const parent_scope = node instanceof AST_Catch
          ? save_scope.parent_scope
          : save_scope
        scope.init_scope_vars(parent_scope)
        scope.uses_with = save_scope.uses_with
        scope.uses_eval = save_scope.uses_eval
        if (options.safari10) {
          if (node instanceof AST_For || node instanceof AST_ForIn) {
            for_scopes.push(scope)
          }
        }

        if (node instanceof AST_Switch) {
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
      if (node instanceof AST_Destructuring) {
        const save_destructuring = in_destructuring
        in_destructuring = node
        descend()
        in_destructuring = save_destructuring
        return true
      }
      if (node instanceof AST_Scope) {
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
      if (node instanceof AST_LabeledStatement) {
        var l = node.label
        if (labels.has(l.name)) {
          throw new Error(string_template('Label {name} defined twice', l))
        }
        labels.set(l.name, l)
        descend()
        labels.delete(l.name)
        return true // no descend again
      }
      if (node instanceof AST_With) {
        for (var s: any | null = scope; s; s = s.parent_scope) { s.uses_with = true }
        return
      }
      if (node instanceof AST_Symbol) {
        node.scope = scope
      }
      if (node instanceof AST_Label) {
        // TODO: check type
        node.thedef = node
        node.references = [] as any
      }
      if (node instanceof AST_SymbolLambda) {
        defun.def_function(node, node.name == 'arguments' ? undefined : defun)
      } else if (node instanceof AST_SymbolDefun) {
        // Careful here, the scope where this should be defined is
        // the parent scope.  The reason is that we enter a new
        // scope when we encounter the AST_Defun node (which is
        // instanceof AST_Scope) but we get to the symbol a bit
        // later.
        mark_export((node.scope = defun.parent_scope.get_defun_scope()).def_function(node, defun), 1)
      } else if (node instanceof AST_SymbolClass) {
        mark_export(defun.def_variable(node, defun), 1)
      } else if (node instanceof AST_SymbolImport) {
        scope.def_variable(node)
      } else if (node instanceof AST_SymbolDefClass) {
        // This deals with the name of the class being available
        // inside the class.
        mark_export((node.scope = defun.parent_scope).def_function(node, defun), 1)
      } else if (
        node instanceof AST_SymbolVar ||
                node instanceof AST_SymbolLet ||
                node instanceof AST_SymbolConst ||
                node instanceof AST_SymbolCatch
      ) {
        var def: any
        if (node instanceof AST_SymbolBlockDeclaration) {
          def = scope.def_variable(node, null)
        } else {
          def = defun.def_variable(node, node.TYPE == 'SymbolVar' ? null : undefined)
        }
        if (!def.orig.every((sym) => {
          if (sym === node) return true
          if (node instanceof AST_SymbolBlockDeclaration) {
            return sym instanceof AST_SymbolLambda
          }
          return !(sym instanceof AST_SymbolLet || sym instanceof AST_SymbolConst)
        })) {
          js_error(
                        `"${node.name}" is redeclared`,
                        node.start.file,
                        node.start.line,
                        node.start.col,
                        node.start.pos
          )
        }
        if (!(node instanceof AST_SymbolFunarg)) mark_export(def, 2)
        if (defun !== scope) {
          node.mark_enclosed()
          const def = scope.find_variable(node)
          if (node.thedef !== def) {
            node.thedef = def
            node.reference()
          }
        }
      } else if (node instanceof AST_LabelRef) {
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
      if (!(scope instanceof AST_Toplevel) && (node instanceof AST_Export || node instanceof AST_Import)) {
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
      if (def.export = node instanceof AST_Export ? MASK_EXPORT_DONT_MANGLE : 0) {
        var exported = node.exported_definition
        if ((exported instanceof AST_Defun || exported instanceof AST_DefClass) && node.is_default) {
          def.export = MASK_EXPORT_WANT_MANGLE
        }
      }
    }

    // pass 2: find back references and eval
    const is_toplevel = this instanceof AST_Toplevel
    if (is_toplevel) {
      this.globals = new Map()
    }

    var tw = new TreeWalker((node: any) => {
      if (node instanceof AST_LoopControl && node.label) {
        node.label.thedef.references.push(node) // TODO: check type
        return true
      }
      if (node instanceof AST_SymbolRef) {
        var name = node.name
        if (name == 'eval' && tw.parent() instanceof AST_Call) {
          for (var s: any = node.scope; s && !s.uses_eval; s = s.parent_scope) {
            s.uses_eval = true
          }
        }
        var sym
        if (tw.parent() instanceof AST_NameMapping && tw.parent(1).module_name ||
                    !(sym = node.scope.find_variable(name))) {
          sym = toplevel.def_global?.(node)
          if (node instanceof AST_SymbolExport) sym.export = MASK_EXPORT_DONT_MANGLE
        } else if (sym.scope instanceof AST_Lambda && name == 'arguments') {
          sym.scope.uses_arguments = true
        }
        node.thedef = sym
        node.reference()
        if (node.scope.is_block_scope() &&
                    !(sym.orig[0] instanceof AST_SymbolBlockDeclaration)) {
          node.scope = node.scope.get_defun_scope()
        }
        return true
      }
      // ensure mangling works if catch reuses a scope variable
      var def
      if (node instanceof AST_SymbolCatch && (def = redefined_catch_def(node.definition()))) {
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
        if (node instanceof AST_SymbolCatch) {
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

  TYPE = 'Scope'
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
        if (!(parent instanceof AST_PropAccess)) break
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
                  node instanceof AST_Defun && // Only functions are retained
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
        if (exp instanceof AST_PropAccess) {
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
      if (node instanceof AST_Directive && node.value == '$ORIG') {
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
      if (node instanceof AST_Directive && node.value == '$ORIG') {
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
      if (node instanceof AST_Scope) node.variables.forEach(rename)
      if (node instanceof AST_SymbolCatch) rename(node.definition())
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
        if (node instanceof AST_Scope) node.variables.forEach(add_def)
        if (node instanceof AST_SymbolCatch) add_def(node.definition())
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
      if (node instanceof AST_LabeledStatement) {
        // lname is incremented when we get to the AST_Label
        var save_nesting = lname
        descend()
        lname = save_nesting
        return true // don't descend again in TreeWalker
      }
      if (node instanceof AST_Scope) {
        node.variables.forEach(collect)
        return
      }
      if (node.is_block_scope()) {
              node.block_scope?.variables.forEach(collect)
              return
      }
      if (
        function_defs &&
              node instanceof AST_VarDef &&
              node.value instanceof AST_Lambda &&
              !node.value.name &&
              keep_name(options.keep_fnames, node.name.name)
      ) {
        function_defs.add(node.name.definition?.().id)
        return
      }
      if (node instanceof AST_Label) {
        let name
        do {
          name = base54(++lname)
        } while (RESERVED_WORDS.has(name))
        node.mangled_name = name
        return true
      }
      if (!(options.ie8 || options.safari10) && node instanceof AST_SymbolCatch) {
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

  TYPE = 'Toplevel'
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
      if (node instanceof AST_This) return walk_abort
      if (
        node !== this &&
              node instanceof AST_Scope &&
              !(node instanceof AST_Arrow)
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
      if (this.argnames[i] instanceof AST_Destructuring) {
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
    if (self.body instanceof AST_Node) {
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
    if (self.name instanceof AST_Symbol) {
      self.name.print(output)
    } else if (nokeyword && self.name instanceof AST_Node) {
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

  TYPE = 'Lambda'
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

  TYPE = 'Accessor'
  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

function To_Moz_FunctionExpression (M, parent) {
  var is_generator = parent.is_generator !== undefined
    ? parent.is_generator : M.is_generator
  return {
    type: 'FunctionExpression',
    id: to_moz(M.name),
    params: M.argnames.map(to_moz),
    generator: is_generator,
    async: M.async,
    body: to_moz_scope('BlockStatement', M)
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
        if (node instanceof AST_This) return walk_abort
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

    var tricky_def = def.orig[0] instanceof AST_SymbolFunarg && this.name && this.name.definition()

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
      if (p instanceof AST_Call && p.expression === this) {
        return true
      }
    }

    if (output.option('wrap_func_args')) {
      var p = output.parent()
      if (p instanceof AST_Call && p.args.includes(this)) {
        return true
      }
    }

    return false
  }

  static documentation = 'A function expression'

  TYPE = 'Function'
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
                this.argnames[0] instanceof AST_Symbol
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
    return p instanceof AST_PropAccess && p.expression === this
  }

  _do_print (this: any, output: any) {
    var self = this
    var parent = output.parent()
    var needs_parens = (parent instanceof AST_Binary && !(parent instanceof AST_Assign)) ||
            parent instanceof AST_Unary ||
            (parent instanceof AST_Call && self === parent.expression)
    if (needs_parens) { output.print('(') }
    if (self.async) {
      output.print('async')
      output.space()
    }
    if (self.argnames.length === 1 && self.argnames[0] instanceof AST_Symbol) {
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
            first_statement instanceof AST_Return
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

  TYPE = 'Arrow'
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

  TYPE = 'Defun'
  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

/* -----[ DESTRUCTURING ]----- */
class AST_Destructuring extends AST_Node {
  is_array: any
  names: any[]

  _optimize (self, compressor) {
    if (compressor.option('pure_getters') == true &&
          compressor.option('unused') &&
          !self.is_array &&
          Array.isArray(self.names) &&
          !is_destructuring_export_decl(compressor)) {
      var keep: any[] = []
      for (var i = 0; i < self.names.length; i++) {
        var elem = self.names[i]
        if (!(elem instanceof AST_ObjectKeyVal &&
                  typeof elem.key === 'string' &&
                  elem.value instanceof AST_SymbolDeclaration &&
                  !should_retain(compressor, elem.value.definition?.()))) {
          keep.push(elem)
        }
      }
      if (keep.length != self.names.length) {
        self.names = keep
      }
    }
    return self

    function is_destructuring_export_decl (compressor) {
      var ancestors = [/^VarDef$/, /^(Const|Let|Var)$/, /^Export$/]
      for (var a = 0, p = 0, len = ancestors.length; a < len; p++) {
        var parent = compressor.parent(p)
        if (!parent) return false
        if (a === 0 && parent.TYPE == 'Destructuring') continue
        if (!ancestors[a].test(parent.TYPE)) {
          return false
        }
        a++
      }
      return true
    }

    function should_retain (compressor, def) {
      if (def.references.length) return true
      if (!def.global) return false
      if (compressor.toplevel.vars) {
        if (compressor.top_retain) {
          return compressor.top_retain(def)
        }
        return false
      }
      return true
    }
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.names.forEach(function (name: any) {
        name._walk(visitor)
      })
    })
  }

  _children_backwards (push: Function) {
    let i = this.names.length
    while (i--) push(this.names[i])
  }

  all_symbols () {
    var out: any[] = []
    this.walk(new TreeWalker(function (node: any) {
      if (node instanceof AST_Symbol) {
        out.push(node)
      }
    }))
    return out
  }

  _size = () => 2
  shallow_cmp = mkshallow({ is_array: 'eq' })
  _transform (self, tw: any) {
    self.names = do_list(self.names, tw)
  }

  _to_mozilla_ast (parent) {
    if (this.is_array) {
      return {
        type: 'ArrayPattern',
        elements: this.names.map(to_moz)
      }
    }
    return {
      type: 'ObjectPattern',
      properties: this.names.map(to_moz)
    }
  }

  _codegen (self, output) {
    output.print(self.is_array ? '[' : '{')
    var len = self.names.length
    self.names.forEach(function (name, i) {
      if (i > 0) output.comma()
      name.print(output)
      // If the final element is a hole, we need to make sure it
      // doesn't look like a trailing comma, by inserting an actual
      // trailing comma.
      if (i == len - 1 && name instanceof AST_Hole) output.comma()
    })
    output.print(self.is_array ? ']' : '}')
  }

  static documentation = 'A destructuring of several names. Used in destructuring assignment and with destructuring function argument names'
  static propdoc = {
    names: '[AST_Node*] Array of properties or elements',
    is_array: '[Boolean] Whether the destructuring represents an object or array'
  }

  TYPE = 'Destructuring'
  static PROPS = AST_Node.PROPS.concat(['names', 'is_array'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.names = args.names
    this.is_array = args.is_array
  }
}

class AST_PrefixedTemplateString extends AST_Node {
  template_string: any
  prefix: any

  _optimize (self) {
    return self
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.prefix._walk(visitor)
      this.template_string._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.template_string)
    push(this.prefix)
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.prefix = self.prefix.transform(tw)
    self.template_string = self.template_string.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'TaggedTemplateExpression',
      tag: to_moz(this.prefix),
      quasi: to_moz(this.template_string)
    }
  }

  _codegen (self, output) {
    var tag = self.prefix
    var parenthesize_tag = tag instanceof AST_Lambda ||
            tag instanceof AST_Binary ||
            tag instanceof AST_Conditional ||
            tag instanceof AST_Sequence ||
            tag instanceof AST_Unary ||
            tag instanceof AST_Dot && tag.expression instanceof AST_Object
    if (parenthesize_tag) output.print('(')
    self.prefix.print(output)
    if (parenthesize_tag) output.print(')')
    self.template_string.print(output)
  }

  static documentation = 'A templatestring with a prefix, such as String.raw`foobarbaz`'
  static propdoc = {
    template_string: '[AST_TemplateString] The template string',
    prefix: '[AST_SymbolRef|AST_PropAccess] The prefix, which can be a symbol such as `foo` or a dotted expression such as `String.raw`.'
  }

  TYPE = 'PrefixedTemplateString'
  static PROPS = AST_Node.PROPS.concat(['template_string', 'prefix'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.template_string = args.template_string
    this.prefix = args.prefix
  }
}

class AST_TemplateString extends AST_Node {
  segments: any

  _optimize (self, compressor) {
    if (!compressor.option('evaluate') ||
      compressor.parent() instanceof AST_PrefixedTemplateString) { return self }

    var segments: any[] = []
    for (var i = 0; i < self.segments.length; i++) {
      var segment = self.segments[i]
      if (segment instanceof AST_Node) {
        var result = segment.evaluate?.(compressor)
        // Evaluate to constant value
        // Constant value shorter than ${segment}
        if (result !== segment && (result + '').length <= segment.size?.(undefined, undefined) + '${}'.length) {
          // There should always be a previous and next segment if segment is a node
          segments[segments.length - 1].value = segments[segments.length - 1].value + result + self.segments[++i].value
          continue
        }
        // `before ${`innerBefore ${any} innerAfter`} after` => `before innerBefore ${any} innerAfter after`
        // TODO:
        // `before ${'test' + foo} after` => `before innerBefore ${any} innerAfter after`
        // `before ${foo + 'test} after` => `before innerBefore ${any} innerAfter after`
        if (segment instanceof AST_TemplateString) {
          var inners = segment.segments
          segments[segments.length - 1].value += inners[0].value
          for (var j = 1; j < inners.length; j++) {
            segment = inners[j]
            segments.push(segment)
          }
          continue
        }
      }
      segments.push(segment)
    }
    self.segments = segments

    // `foo` => "foo"
    if (segments.length == 1) {
      return make_node('AST_String', self, segments[0])
    }
    if (segments.length === 3 && segments[1] instanceof AST_Node) {
      // `foo${bar}` => "foo" + bar
      if (segments[2].value === '') {
        return make_node('AST_Binary', self, {
          operator: '+',
          left: make_node('AST_String', self, {
            value: segments[0].value
          }),
          right: segments[1]
        })
      }
      // `{bar}baz` => bar + "baz"
      if (segments[0].value === '') {
        return make_node('AST_Binary', self, {
          operator: '+',
          left: segments[1],
          right: make_node('AST_String', self, {
            value: segments[2].value
          })
        })
      }
    }
    return self
  }

  drop_side_effect_free (compressor: any) {
    var values = trim(this.segments, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.segments, compressor)
  }

  _eval () {
    if (this.segments.length !== 1) return this
    return this.segments[0].value
  }

  is_string = return_true
  _walk (visitor: any) {
    return visitor._visit(this, function (this: any) {
      this.segments.forEach(function (seg) {
        seg._walk(visitor)
      })
    })
  }

  _children_backwards (push: Function) {
    let i = this.segments.length
    while (i--) push(this.segments[i])
  }

  _size (): number {
    return 2 + (Math.floor(this.segments.length / 2) * 3) /* "${}" */
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.segments = do_list(self.segments, tw)
  }

  _to_mozilla_ast (parent) {
    var quasis: any[] = []
    var expressions: any[] = []
    for (var i = 0; i < this.segments.length; i++) {
      if (i % 2 !== 0) {
        expressions.push(to_moz(this.segments[i]))
      } else {
        quasis.push({
          type: 'TemplateElement',
          value: {
            raw: this.segments[i].raw,
            cooked: this.segments[i].value
          },
          tail: i === this.segments.length - 1
        })
      }
    }
    return {
      type: 'TemplateLiteral',
      quasis: quasis,
      expressions: expressions
    }
  }

  _codegen (self, output) {
    var is_tagged = output.parent() instanceof AST_PrefixedTemplateString

    output.print('`')
    for (var i = 0; i < self.segments.length; i++) {
      if (!(self.segments[i] instanceof AST_TemplateSegment)) {
        output.print('${')
        self.segments[i].print(output)
        output.print('}')
      } else if (is_tagged) {
        output.print(self.segments[i].raw)
      } else {
        output.print_template_string_chars(self.segments[i].value)
      }
    }
    output.print('`')
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A template string literal'
  static propdoc = {
    segments: '[AST_Node*] One or more segments, starting with AST_TemplateSegment. AST_Node may follow AST_TemplateSegment, but each AST_Node must be followed by AST_TemplateSegment.'
  }

  TYPE = 'TemplateString'
  static PROPS = AST_Node.PROPS.concat(['segments'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.segments = args.segments
  }
}

/* -----[ JUMPS ]----- */

class AST_Await extends AST_Node {
  expression: any

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size = () => 6
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'AwaitExpression',
      argument: to_moz(this.expression)
    }
  }

  needs_parens = function (output: any) {
    var p = output.parent()
    return p instanceof AST_PropAccess && p.expression === this ||
            p instanceof AST_Call && p.expression === this ||
            output.option('safari10') && p instanceof AST_UnaryPrefix
  }

  _codegen = function (self, output) {
    output.print('await')
    output.space()
    var e = self.expression
    var parens = !(
      e instanceof AST_Call ||
            e instanceof AST_SymbolRef ||
            e instanceof AST_PropAccess ||
            e instanceof AST_Unary ||
            e instanceof AST_Constant
    )
    if (parens) output.print('(')
    self.expression.print(output)
    if (parens) output.print(')')
  }

  static documentation = 'An `await` statement'
  static propdoc = {
    expression: '[AST_Node] the mandatory expression being awaited'
  }

  TYPE = 'Await'
  static PROPS = AST_Node.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}

class AST_Yield extends AST_Node {
  value: any
  is_star: boolean
  expression: any

  _optimize = function (self, compressor) {
    if (self.expression && !self.is_star && is_undefined(self.expression, compressor)) {
      self.expression = null
    }
    return self
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, this.expression && function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.expression) push(this.expression)
  }

  _size = () => 6
  shallow_cmp = mkshallow({
    is_star: 'eq'
  })

  _transform (self, tw: any) {
    if (self.expression) self.expression = self.expression.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'YieldExpression',
      argument: to_moz(this.expression),
      delegate: this.is_star
    }
  }

  needs_parens = function (output: any) {
    var p = output.parent()
    // (yield 1) + (yield 2)
    // a = yield 3
    if (p instanceof AST_Binary && p.operator !== '=') { return true }
    // (yield 1)()
    // new (yield 1)()
    if (p instanceof AST_Call && p.expression === this) { return true }
    // (yield 1) ? yield 2 : yield 3
    if (p instanceof AST_Conditional && p.condition === this) { return true }
    // -(yield 4)
    if (p instanceof AST_Unary) { return true }
    // (yield x).foo
    // (yield x)['foo']
    if (p?._needs_parens(this)) { return true }
    return undefined
  }

  _codegen = function (self, output) {
    var star = self.is_star ? '*' : ''
    output.print('yield' + star)
    if (self.expression) {
      output.space()
      self.expression.print(output)
    }
  }

  static documentation = 'A `yield` statement'
  static propdoc = {
    expression: '[AST_Node?] the value returned or thrown by this statement; could be null (representing undefined) but only when is_star is set to false',
    is_star: '[Boolean] Whether this is a yield or yield* statement'
  }

  TYPE = 'Yield'
  static PROPS = AST_Node.PROPS.concat(['expression', 'is_star'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.is_star = args.is_star
  }
}

/* -----[ IF ]----- */

class AST_If extends AST_StatementWithBody {
  condition: any
  alternative: any

  _optimize (self, compressor) {
    if (is_empty(self.alternative)) self.alternative = null

    if (!compressor.option('conditionals')) return self
    // if condition can be statically determined, warn and drop
    // one of the blocks.  note, statically determined implies
    // “has no side effects”; also it doesn't work for cases like
    // `x && true`, though it probably should.
    var cond = self.condition.evaluate(compressor)
    if (!compressor.option('dead_code') && !(cond instanceof AST_Node)) {
      var orig = self.condition
      self.condition = make_node_from_constant(cond, orig)
      self.condition = best_of_expression(self.condition.transform(compressor), orig)
    }
    if (compressor.option('dead_code')) {
      if (cond instanceof AST_Node) cond = self.condition.tail_node().evaluate(compressor)
      if (!cond) {
        compressor.warn('Condition always false [{file}:{line},{col}]', self.condition.start)
        var body: any[] = []
        extract_declarations_from_unreachable_code(compressor, self.body, body)
        body.push(make_node('AST_SimpleStatement', self.condition, {
          body: self.condition
        }))
        if (self.alternative) body.push(self.alternative)
        return make_node('AST_BlockStatement', self, { body: body }).optimize(compressor)
      } else if (!(cond instanceof AST_Node)) {
        compressor.warn('Condition always true [{file}:{line},{col}]', self.condition.start)
        var body: any[] = []
        body.push(make_node('AST_SimpleStatement', self.condition, {
          body: self.condition
        }))
        body.push(self.body)
        if (self.alternative) {
          extract_declarations_from_unreachable_code(compressor, self.alternative, body)
        }
        return make_node('AST_BlockStatement', self, { body: body }).optimize(compressor)
      }
    }
    var negated = self.condition.negate(compressor)
    var self_condition_length = self.condition.size()
    var negated_length = negated.size()
    var negated_is_best = negated_length < self_condition_length
    if (self.alternative && negated_is_best) {
      negated_is_best = false // because we already do the switch here.
      // no need to swap values of self_condition_length and negated_length
      // here because they are only used in an equality comparison later on.
      self.condition = negated
      var tmp = self.body
      self.body = self.alternative || make_node('AST_EmptyStatement', self)
      self.alternative = tmp
    }
    if (is_empty(self.body) && is_empty(self.alternative)) {
      return make_node('AST_SimpleStatement', self.condition, {
        body: self.condition.clone()
      }).optimize(compressor)
    }
    if (self.body instanceof AST_SimpleStatement &&
          self.alternative instanceof AST_SimpleStatement) {
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: self.body.body,
          alternative: self.alternative.body
        })
      }).optimize(compressor)
    }
    if (is_empty(self.alternative) && self.body instanceof AST_SimpleStatement) {
      if (self_condition_length === negated_length && !negated_is_best &&
              self.condition instanceof AST_Binary && self.condition.operator == '||') {
        // although the code length of self.condition and negated are the same,
        // negated does not require additional surrounding parentheses.
        // see https://github.com/mishoo/UglifyJS2/issues/979
        negated_is_best = true
      }
      if (negated_is_best) {
        return make_node('AST_SimpleStatement', self, {
          body: make_node('AST_Binary', self, {
            operator: '||',
            left: negated,
            right: self.body.body
          })
        }).optimize(compressor)
      }
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Binary', self, {
          operator: '&&',
          left: self.condition,
          right: self.body.body
        })
      }).optimize(compressor)
    }
    if (self.body instanceof AST_EmptyStatement &&
          self.alternative instanceof AST_SimpleStatement) {
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Binary', self, {
          operator: '||',
          left: self.condition,
          right: self.alternative.body
        })
      }).optimize(compressor)
    }
    if (self.body instanceof AST_Exit &&
          self.alternative instanceof AST_Exit &&
          self.body.TYPE == self.alternative.TYPE) {
      return make_node(self.body.constructor?.name, self, {
        value: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: self.body.value || make_node('AST_Undefined', self.body),
          alternative: self.alternative.value || make_node('AST_Undefined', self.alternative)
        }).transform(compressor)
      }).optimize(compressor)
    }
    if (self.body instanceof AST_If &&
          !self.body.alternative &&
          !self.alternative) {
      self = make_node('AST_If', self, {
        condition: make_node('AST_Binary', self.condition, {
          operator: '&&',
          left: self.condition,
          right: self.body.condition
        }),
        body: self.body.body,
        alternative: null
      })
    }
    if (aborts(self.body)) {
      if (self.alternative) {
        var alt = self.alternative
        self.alternative = null
        return make_node('AST_BlockStatement', self, {
          body: [self, alt]
        }).optimize(compressor)
      }
    }
    if (aborts(self.alternative)) {
      const body = self.body
      self.body = self.alternative
      self.condition = negated_is_best ? negated : self.condition.negate(compressor)
      self.alternative = null
      return make_node('AST_BlockStatement', self, {
        body: [self, body]
      }).optimize(compressor)
    }
    return self
  }

  may_throw (compressor: any) {
    return this.condition.may_throw(compressor) ||
          this.body && this.body.may_throw(compressor) ||
          this.alternative && this.alternative.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.condition.has_side_effects(compressor) ||
          this.body && this.body.has_side_effects(compressor) ||
          this.alternative && this.alternative.has_side_effects(compressor)
  }

  aborts = function () {
    return this.alternative && aborts(this.body) && aborts(this.alternative) && this
  }

  reduce_vars (tw) {
    this.condition.walk(tw)
    push(tw)
    this.body.walk(tw)
    pop(tw)
    if (this.alternative) {
      push(tw)
      this.alternative.walk(tw)
      pop(tw)
    }
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.body._walk(visitor)
      if (this.alternative) this.alternative._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.alternative) {
      push(this.alternative)
    }
    push(this.body)
    push(this.condition)
  }

  _size = () => 4
  shallow_cmp = mkshallow({
    alternative: 'exist'
  })

  _transform (self, tw: any) {
    self.condition = self.condition.transform(tw)
    self.body = (self.body).transform(tw)
    if (self.alternative) self.alternative = self.alternative.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'IfStatement',
      test: to_moz(this.condition),
      consequent: to_moz(this.body),
      alternate: to_moz(this.alternative)
    }
  }

  _codegen (self, output) {
    output.print('if')
    output.space()
    output.with_parens(function () {
      self.condition.print(output)
    })
    output.space()
    if (self.alternative) {
      make_then(self, output)
      output.space()
      output.print('else')
      output.space()
      if (self.alternative instanceof AST_If) { self.alternative.print(output) } else { force_statement(self.alternative, output) }
    } else {
      self._do_print_body(output)
    }
  }

  static documentation = 'A `if` statement'
  static propdoc = {
    condition: '[AST_Node] the `if` condition',
    alternative: '[AST_Statement?] the `else` part, or null if not present'
  }

  TYPE = 'If'
  static PROPS = AST_StatementWithBody.PROPS.concat(['condition', 'alternative'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.condition = args.condition
    this.alternative = args.alternative
  }
}

/* -----[ SWITCH ]----- */

class AST_Switch extends AST_Block {
  _optimize (self, compressor) {
    if (!compressor.option('switches')) return self
    var branch
    var value = self.expression.evaluate(compressor)
    if (!(value instanceof AST_Node)) {
      var orig = self.expression
      self.expression = make_node_from_constant(value, orig)
      self.expression = best_of_expression(self.expression.transform(compressor), orig)
    }
    if (!compressor.option('dead_code')) return self
    if (value instanceof AST_Node) {
      value = self.expression.tail_node().evaluate(compressor)
    }
    var decl: any[] = []
    var body: any[] = []
    var default_branch
    var exact_match
    for (var i = 0, len = self.body.length; i < len && !exact_match; i++) {
      branch = self.body[i]
      if (branch instanceof AST_Default) {
        if (!default_branch) {
          default_branch = branch
        } else {
          eliminate_branch(branch, body[body.length - 1])
        }
      } else if (!(value instanceof AST_Node)) {
        var exp = branch.expression.evaluate(compressor)
        if (!(exp instanceof AST_Node) && exp !== value) {
          eliminate_branch(branch, body[body.length - 1])
          continue
        }
        if (exp instanceof AST_Node) exp = branch.expression.tail_node().evaluate(compressor)
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
      if (stat instanceof AST_Break && compressor.loopcontrol_target(stat) === self) { branch.body.pop() }
      if (branch.body.length || branch instanceof AST_Case &&
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
                  node instanceof AST_Lambda ||
                  node instanceof AST_SimpleStatement) return true
        if (node instanceof AST_Break && tw.loopcontrol_target(node) === self) { has_break = true }
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

  TYPE = 'Switch'
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

  TYPE = 'Try'
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

  TYPE = 'Catch'
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

  TYPE = 'Finally'
  static PROPS = AST_Block.PROPS.concat(['argname'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.argname = args.argname
  }
}

/* -----[ VAR/CONST ]----- */

class AST_Definitions extends AST_Statement {
  definitions: any[]

  _optimize (self) {
    if (self.definitions.length == 0) { return make_node('AST_EmptyStatement', self) }
    return self
  }

  may_throw (compressor: any) {
    return anyMayThrow(this.definitions, compressor)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.definitions, compressor)
  }

  to_assignments (compressor: any) {
    var reduce_vars = compressor.option('reduce_vars')
    var assignments = this.definitions.reduce(function (a, def) {
      if (def.value && !(def.name instanceof AST_Destructuring)) {
        var name = make_node('AST_SymbolRef', def.name, def.name)
        a.push(make_node('AST_Assign', def, {
          operator: '=',
          left: name,
          right: def.value
        }))
        if (reduce_vars) name.definition().fixed = false
      } else if (def.value) {
        // Because it's a destructuring, do not turn into an assignment.
        var varDef = make_node('AST_VarDef', def, {
          name: def.name,
          value: def.value
        })
        var var_ = make_node('AST_Var', def, {
          definitions: [varDef]
        })
        a.push(var_)
      }
      def = def.name.definition?.()
      def.eliminated++
      def.replaced--
      return a
    }, [])
    if (assignments.length == 0) return null
    return make_sequence(this, assignments)
  }

  remove_initializers () {
    var decls: any[] = []
    this.definitions.forEach(function (def) {
      if (def.name instanceof AST_SymbolDeclaration) {
        def.value = null
        decls.push(def)
      } else {
        walk(def.name, (node: any) => {
          if (node instanceof AST_SymbolDeclaration) {
            decls.push(make_node('AST_VarDef', def, {
              name: node,
              value: null
            }))
          }
        })
      }
    })
    this.definitions = decls
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      var definitions = this.definitions
      for (var i = 0, len = definitions.length; i < len; i++) {
        definitions[i]._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    let i = this.definitions.length
    while (i--) push(this.definitions[i])
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.definitions = do_list(self.definitions, tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'VariableDeclaration',
      kind:
                this instanceof AST_Const ? 'const'
                  : this instanceof AST_Let ? 'let' : 'var',
      declarations: this.definitions.map(to_moz)
    }
  }

  _do_print (this: any, output: any, kind: string) {
    output.print(kind)
    output.space()
    this.definitions.forEach(function (def, i) {
      if (i) output.comma()
      def.print(output)
    })
    var p = output.parent()
    var in_for = p instanceof AST_For || p instanceof AST_ForIn
    var output_semicolon = !in_for || p && p.init !== this
    if (output_semicolon) { output.semicolon() }
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for `var` or `const` nodes (variable declarations/initializations)'
  static propdoc = {
    definitions: '[AST_VarDef*] array of variable definitions'
  }

  TYPE = 'Definitions'
  static PROPS = AST_Statement.PROPS.concat(['definitions'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.definitions = args.definitions
  }
}

class AST_Var extends AST_Definitions {
  _size = function (): number {
    return def_size(4, this)
  }

  _codegen = function (self, output) {
    self._do_print(output, 'var')
  }

  static documentation = 'A `var` statement'

  TYPE = 'Var'
  static PROPS = AST_Definitions.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Let extends AST_Definitions {
  _size = function (): number {
    return def_size(4, this)
  }

  _codegen = function (self, output) {
    self._do_print(output, 'let')
  }

  static documentation = 'A `let` statement'

  TYPE = 'Let'
  static PROPS = AST_Definitions.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Const extends AST_Definitions {
  _size = function (): number {
    return def_size(6, this)
  }

  _codegen = function (self, output) {
    self._do_print(output, 'const')
  }

  static documentation = 'A `const` statement'

  TYPE = 'Const'
  static PROPS = AST_Definitions.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

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
    if (node.name instanceof AST_Destructuring) {
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
      var noin = p instanceof AST_For || p instanceof AST_ForIn
      parenthesize_for_noin(self.value, output, noin)
    }
  }

  static documentation = 'A variable declaration; only appears in a AST_Definitions node'
  static propdoc = {
    name: '[AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar] name of the variable',
    value: "[AST_Node?] initializer, or null of there's no initializer"
  }

  TYPE = 'VarDef'
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
    var is_import = output.parent() instanceof AST_Import
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

  TYPE = 'NameMapping'
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

  TYPE = 'Import'
  static PROPS = AST_Node.PROPS.concat(['imported_name', 'imported_names', 'module_name'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.imported_name = args.imported_name
    this.imported_names = args.imported_names
    this.module_name = args.module_name
  }
}

class AST_Export extends AST_Statement {
  is_default: any
  module_name: any
  exported_value: any
  exported_definition: any
  exported_names: any

  _walk (visitor: any) {
    return visitor._visit(this, function (this: any) {
      if (this.exported_definition) {
        this.exported_definition._walk(visitor)
      }
      if (this.exported_value) {
        this.exported_value._walk(visitor)
      }
      if (this.exported_names) {
        this.exported_names.forEach(function (name_export) {
          name_export._walk(visitor)
        })
      }
      if (this.module_name) {
        this.module_name._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    if (this.module_name) push(this.module_name)
    if (this.exported_names) {
      let i = this.exported_names.length
      while (i--) push(this.exported_names[i])
    }
    if (this.exported_value) push(this.exported_value)
    if (this.exported_definition) push(this.exported_definition)
  }

  _size (): number {
    let size = 7 + (this.is_default ? 8 : 0)

    if (this.exported_value) {
      size += this.exported_value._size()
    }

    if (this.exported_names) {
      // Braces and commas
      size += 2 + list_overhead(this.exported_names)
    }

    if (this.module_name) {
      // "from "
      size += 5
    }

    return size
  }

  shallow_cmp = mkshallow({
    exported_definition: 'exist',
    exported_value: 'exist',
    exported_names: 'exist',
    module_name: 'eq',
    is_default: 'eq'
  })

  _transform (self, tw: any) {
    if (self.exported_definition) self.exported_definition = self.exported_definition.transform(tw)
    if (self.exported_value) self.exported_value = self.exported_value.transform(tw)
    if (self.exported_names) do_list(self.exported_names, tw)
    if (self.module_name) self.module_name = self.module_name.transform(tw)
  }

  _to_mozilla_ast (parent) {
    if (this.exported_names) {
      if (this.exported_names[0].name.name === '*') {
        return {
          type: 'ExportAllDeclaration',
          source: to_moz(this.module_name)
        }
      }
      return {
        type: 'ExportNamedDeclaration',
        specifiers: this.exported_names.map(function (name_mapping) {
          return {
            type: 'ExportSpecifier',
            exported: to_moz(name_mapping.foreign_name),
            local: to_moz(name_mapping.name)
          }
        }),
        declaration: to_moz(this.exported_definition),
        source: to_moz(this.module_name)
      }
    }
    return {
      type: this.is_default ? 'ExportDefaultDeclaration' : 'ExportNamedDeclaration',
      declaration: to_moz(this.exported_value || this.exported_definition)
    }
  }

  _codegen (self, output) {
    output.print('export')
    output.space()
    if (self.is_default) {
      output.print('default')
      output.space()
    }
    if (self.exported_names) {
      if (self.exported_names.length === 1 && self.exported_names[0].name.name === '*') {
        self.exported_names[0].print(output)
      } else {
        output.print('{')
        self.exported_names.forEach(function (name_export, i) {
          output.space()
          name_export.print(output)
          if (i < self.exported_names.length - 1) {
            output.print(',')
          }
        })
        output.space()
        output.print('}')
      }
    } else if (self.exported_value) {
      self.exported_value.print(output)
    } else if (self.exported_definition) {
      self.exported_definition.print(output)
      if (self.exported_definition instanceof AST_Definitions) return
    }
    if (self.module_name) {
      output.space()
      output.print('from')
      output.space()
      self.module_name.print(output)
    }
    if (self.exported_value &&
                !(self.exported_value instanceof AST_Defun ||
                    self.exported_value instanceof AST_Function ||
                    self.exported_value instanceof AST_Class) ||
            self.module_name ||
            self.exported_names
    ) {
      output.semicolon()
    }
  }

  static documentation = 'An `export` statement'
  static propdoc = {
    exported_definition: '[AST_Defun|AST_Definitions|AST_DefClass?] An exported definition',
    exported_value: '[AST_Node?] An exported value',
    exported_names: '[AST_NameMapping*?] List of exported names',
    module_name: '[AST_String?] Name of the file to load exports from',
    is_default: '[Boolean] Whether this is the default exported value of this module'
  }

  TYPE = 'Export'
  static PROPS = AST_Statement.PROPS.concat(['exported_definition', 'exported_value', 'is_default', 'exported_names', 'module_name'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.exported_definition = args.exported_definition
    this.exported_value = args.exported_value
    this.is_default = args.is_default
    this.exported_names = args.exported_names
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
      !(arg instanceof AST_Expansion)
    )
    if (compressor.option('reduce_vars') &&
          fn instanceof AST_SymbolRef &&
          !has_annotation(self, _NOINLINE)
    ) {
      const fixed = fn.fixed_value()
      if (!retain_top_func(fixed, compressor)) {
        fn = fixed
      }
    }
    var is_func = fn instanceof AST_Lambda
    if (compressor.option('unused') &&
          simple_args &&
          is_func &&
          !fn.uses_arguments &&
          !fn.pinned()) {
      var pos = 0; var last = 0
      for (var i = 0, len = self.args.length; i < len; i++) {
        if (fn.argnames[i] instanceof AST_Expansion) {
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
            } else if (self.args[0] instanceof AST_Number && self.args[0].value <= 11) {
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
            if (self.args.length == 1 && self.args[0] instanceof AST_String && compressor.option('unsafe_symbols')) { self.args.length = 0 }
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
      } else if (exp instanceof AST_Dot) {
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
            if (exp.expression instanceof AST_Array) {
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
                  if (el instanceof AST_Expansion) break EXIT
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
            if (self.args.length == 2 && self.args[1] instanceof AST_Array) {
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
            if (func instanceof AST_SymbolRef) {
              func = func.fixed_value()
            }
            if (func instanceof AST_Lambda && !func.contains_this()) {
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
        x instanceof AST_String
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
    if (can_inline && stat instanceof AST_Return) {
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
              (fn.argnames[0] instanceof AST_SymbolFunarg) &&
              self.args.length < 2 &&
              returned instanceof AST_SymbolRef &&
              returned.name === fn.argnames[0].name
      ) {
        let parent
        if (
          self.args[0] instanceof AST_PropAccess &&
                  (parent = compressor.parent()) instanceof AST_Call &&
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
              !(compressor.parent() instanceof AST_Class) &&
              !(fn.name && fn instanceof AST_Function) &&
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
                  if (p instanceof AST_DefaultAssign) return true
                  if (p instanceof AST_Block) break
                }
                return false
              })() &&
              !(scope instanceof AST_Class)
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
          compressor.parent() instanceof AST_SimpleStatement &&
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
      if (stat instanceof AST_Return) {
        if (!stat.value) return make_node('AST_Undefined', self)
        return stat.value.clone(true)
      }
      if (stat instanceof AST_SimpleStatement) {
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
        if (line instanceof AST_Var) {
          if (stat && !line.definitions.every((var_def) =>
            !var_def.value
          )) {
            return false
          }
        } else if (stat) {
          return false
        } else if (!(line instanceof AST_EmptyStatement)) {
          stat = line
        }
      }
      return return_value(stat)
    }

    function can_inject_args (block_scoped, safe_to_inject) {
      for (var i = 0, len = fn.argnames.length; i < len; i++) {
        var arg = fn.argnames[i]
        if (arg instanceof AST_DefaultAssign) {
          if (has_flag(arg.left, UNUSED)) continue
          return false
        }
        if (arg instanceof AST_Destructuring) return false
        if (arg instanceof AST_Expansion) {
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
        if (node instanceof AST_Scope) {
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
        if (arg instanceof AST_DefaultAssign && has_flag(arg.left, UNUSED)) continue
        if (arg instanceof AST_Expansion && has_flag(arg.expression, UNUSED)) continue
        if (has_flag(arg, UNUSED)) continue
        if (arg_vals_outer_refs.has(arg.name)) return false
      }
      for (let i = 0, len = fn.body.length; i < len; i++) {
        var stat = fn.body[i]
        if (!(stat instanceof AST_Var)) continue
        for (var j = stat.definitions.length; --j >= 0;) {
          var name = stat.definitions[j].name
          if (name instanceof AST_Destructuring ||
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
        if (!(stat instanceof AST_Var)) continue
        if (!safe_to_inject) return false
        for (var j = stat.definitions.length; --j >= 0;) {
          var name = stat.definitions[j].name
          if (name instanceof AST_Destructuring ||
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
        if (scope instanceof AST_Catch) {
          // TODO can we delete? AST_Catch is a block scope.
          if (scope.argname) {
            block_scoped.add(scope.argname.name)
          }
        } else if (scope instanceof AST_IterationStatement) {
          in_loop = []
        } else if (scope instanceof AST_SymbolRef) {
          if (scope.fixed_value() instanceof AST_Scope) return false
        }
      } while (!(scope instanceof AST_Scope))

      var safe_to_inject = !(scope instanceof AST_Toplevel) || compressor.toplevel.vars
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
        if (!(stat instanceof AST_Var)) continue
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
    return !(this.expression instanceof AST_Lambda) ||
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
    if (compressor.option('unsafe') && exp instanceof AST_PropAccess) {
      var key = exp.property
      if (key instanceof AST_Node) {
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

        first_arg = first_arg instanceof AST_Dot ? first_arg.expression : first_arg

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
      if (expr instanceof AST_Dot &&
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
    if (p instanceof AST_New && p.expression === this ||
            p instanceof AST_Export && p.is_default && this.expression instanceof AST_Function) { return true }

    // workaround for Safari bug.
    // https://bugs.webkit.org/show_bug.cgi?id=123506
    return this.expression instanceof AST_Function &&
            p instanceof AST_PropAccess &&
            p.expression === this &&
            (p1 = output.parent(1)) instanceof AST_Assign &&
            p1.left === p
  }

  _codegen = callCodeGen
  static documentation = 'A function call expression'
  static propdoc = {
    expression: '[AST_Node] expression to invoke as function',
    args: '[AST_Node*] array of arguments',
    _annotations: '[number] bitfield containing information about the call'
  }

  TYPE = 'Call'
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
            (p instanceof AST_PropAccess || // (new Date).getTime(), (new Date)["getTime"]()
                p instanceof AST_Call && p.expression === this)) // (new foo)(bar)
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

  TYPE = 'New'
  static PROPS = AST_Call.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_Sequence extends AST_Node {
  expressions: any
  _optimize (self, compressor) {
    if (!compressor.option('side_effects')) return self
    var expressions: any[] = []
    filter_for_side_effects()
    var end = expressions.length - 1
    trim_right_for_undefined()
    if (end == 0) {
      self = maintain_this_binding(compressor.parent(), compressor.self(), expressions[0])
      if (!(self instanceof AST_Sequence)) self = self.optimize(compressor)
      return self
    }
    self.expressions = expressions
    return self

    function filter_for_side_effects () {
      var first = first_in_statement(compressor)
      var last = self.expressions.length - 1
      self.expressions.forEach(function (expr, index) {
        if (index < last) expr = expr.drop_side_effect_free(compressor, first)
        if (expr) {
          merge_sequence(expressions, expr)
          first = false
        }
      })
    }

    function trim_right_for_undefined () {
      while (end > 0 && is_undefined(expressions[end], compressor)) end--
      if (end < expressions.length - 1) {
        expressions[end] = make_node('AST_UnaryPrefix', self, {
          operator: 'void',
          expression: expressions[end]
        })
        expressions.length = end + 1
      }
    }
  }

  drop_side_effect_free (compressor: any) {
    var last = this.tail_node()
    var expr = last.drop_side_effect_free(compressor)
    if (expr === last) return this
    var expressions = this.expressions.slice(0, -1)
    if (expr) expressions.push(expr)
    if (!expressions.length) {
      return make_node('AST_Number', this, { value: 0 })
    }
    return make_sequence(this, expressions)
  }

  may_throw (compressor: any) {
    return anyMayThrow(this.expressions, compressor)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.expressions, compressor)
  }

  negate (compressor: any) {
    var expressions = this.expressions.slice()
    expressions.push(expressions.pop().negate(compressor))
    return make_sequence(this, expressions)
  }

  is_string (compressor: any) {
    return this.tail_node().is_string(compressor)
  }

  is_number (compressor: any) {
    return this.tail_node().is_number(compressor)
  }

  is_boolean () {
    return this.tail_node().is_boolean()
  }

  _dot_throw (compressor: any) {
    return this.tail_node()._dot_throw(compressor)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expressions.forEach(function (node: any) {
        node._walk(visitor)
      })
    })
  }

  _children_backwards (push: Function) {
    let i = this.expressions.length
    while (i--) push(this.expressions[i])
  }

  _size (): number {
    return list_overhead(this.expressions)
  }

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    const result = do_list(self.expressions, tw)
    self.expressions = result.length
      ? result
      : [new AST_Number({ value: 0 })]
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'SequenceExpression',
      expressions: this.expressions.map(to_moz)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p instanceof AST_Call || // (foo, bar)() or foo(1, (2, 3), 4)
            p instanceof AST_Unary || // !(foo, bar, baz)
            p instanceof AST_Binary || // 1 + (2, 3) + 4 ==> 8
            p instanceof AST_VarDef || // var a = (1, 2), b = a + a; ==> b == 4
            p instanceof AST_PropAccess || // (1, {foo:2}).foo or (1, {foo:2})["foo"] ==> 2
            p instanceof AST_Array || // [ 1, (2, 3), 4 ] ==> [ 1, 3, 4 ]
            p instanceof AST_ObjectProperty || // { foo: (1, 2) }.foo ==> 2
            p instanceof AST_Conditional || /* (false, true) ? (a = 10, b = 20) : (c = 30)
                                                                * ==> 20 (side effect, set a := 10 and b := 20) */
            p instanceof AST_Arrow || // x => (x, x)
            p instanceof AST_DefaultAssign || // x => (x = (0, function(){}))
            p instanceof AST_Expansion || // [...(a, b)]
            p instanceof AST_ForOf && this === p.object || // for (e of (foo, bar)) {}
            p instanceof AST_Yield || // yield (foo, bar)
            p instanceof AST_Export // export default (foo, bar)
  }

  _do_print (this: any, output: any) {
    this.expressions.forEach(function (node, index) {
      if (index > 0) {
        output.comma()
        if (output.should_break()) {
          output.newline()
          output.indent()
        }
      }
      node.print(output)
    })
  }

  _codegen (self, output) {
    self._do_print(output)
  }

  tail_node () {
    return this.expressions[this.expressions.length - 1]
  }

  static documentation = 'A sequence expression (comma-separated expressions)'
  static propdoc = {
    expressions: '[AST_Node*] array of expressions (at least two)'
  }

  TYPE = 'Sequence'
  static PROPS = AST_Node.PROPS.concat(['expressions'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expressions = args.expressions
  }
}

class AST_PropAccess extends AST_Node {
  expression: any
  property: any

  _needs_parens (child: AST_Node) {
    return this.expression === child
  }

  _eval (compressor: any, depth) {
    if (compressor.option('unsafe')) {
      var key = this.property
      if (key instanceof AST_Node) {
        key = key._eval?.(compressor, depth)
        if (key === this.property) return this
      }
      var exp = this.expression
      var val
      if (is_undeclared_ref(exp)) {
        var aa
        var first_arg = exp.name === 'hasOwnProperty' &&
                  key === 'call' &&
                  (aa = compressor.parent() && compressor.parent().args) &&
                  (aa && aa[0] &&
                  aa[0].evaluate(compressor))

        first_arg = first_arg instanceof AST_Dot ? first_arg.expression : first_arg

        if (first_arg == null || first_arg.thedef && first_arg.thedef.undeclared) {
          return this.clone()
        }
        var static_value = static_values.get(exp.name)
        if (!static_value || !static_value.has(key)) return this
        val = global_objs[exp.name]
      } else {
        val = exp._eval(compressor, depth + 1)
        if (!val || val === exp || !HOP(val, key)) return this
        if (typeof val === 'function') {
          switch (key) {
            case 'name':
              return val.node.name ? val.node.name.name : ''
            case 'length':
              return val.node.argnames.length
            default:
              return this
          }
        }
      }
      return val[key]
    }
    return this
  }

  flatten_object (key, compressor) {
    if (!compressor.option('properties')) return
    var arrows = compressor.option('unsafe_arrows') && compressor.option('ecma') >= 2015
    var expr = this.expression
    if (expr instanceof AST_Object) {
      var props = expr.properties
      for (var i = props.length; --i >= 0;) {
        var prop = props[i]
        if ('' + (prop instanceof AST_ConciseMethod ? prop.key.name : prop.key) == key) {
          if (!props.every((prop) => {
            return prop instanceof AST_ObjectKeyVal ||
                          arrows && prop instanceof AST_ConciseMethod && !prop.is_generator
          })) break
          if (!safe_to_flatten(prop.value, compressor)) break
          return make_node('AST_Sub', this, {
            expression: make_node('AST_Array', expr, {
              elements: props.map(function (prop) {
                var v = prop.value
                if (v instanceof AST_Accessor) v = make_node('AST_Function', v, v)
                var k = prop.key
                if (k instanceof AST_Node && !(k instanceof AST_SymbolMethod)) {
                  return make_sequence(prop, [k, v])
                }
                return v
              })
            }),
            property: make_node('AST_Number', this, {
              value: i
            })
          })
        }
      }
    }
  }

  shallow_cmp = pass_through as any
  _to_mozilla_ast (parent) {
    var isComputed = this instanceof AST_Sub
    return {
      type: 'MemberExpression',
      object: to_moz(this.expression),
      computed: isComputed,
      property: isComputed ? to_moz(this.property) : { type: 'Identifier', name: this.property }
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    if (p instanceof AST_New && p.expression === this) {
      // i.e. new (foo.bar().baz)
      //
      // if there's one call into this subtree, then we need
      // parens around it too, otherwise the call will be
      // interpreted as passing the arguments to the upper New
      // expression.
      return walk(this, (node: any) => {
        if (node instanceof AST_Scope) return true
        if (node instanceof AST_Call) {
          return walk_abort // makes walk() return true.
        }
        return undefined
      })
    }
    return undefined
  }

  static documentation = 'Base class for property access expressions, i.e. `a.foo` or `a["foo"]`'
  static propdoc = {
    expression: '[AST_Node] the “container” expression',
    property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
  } as any

  TYPE = 'PropAccess'
  static PROPS = AST_Node.PROPS.concat(['expression', 'property'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.property = args.property
  }
}

class AST_Dot extends AST_PropAccess {
  quote: any

  _optimize (self, compressor) {
    if (self.property == 'arguments' || self.property == 'caller') {
      compressor.warn('Function.prototype.{prop} not supported [{file}:{line},{col}]', {
        prop: self.property,
        file: self.start.file,
        line: self.start.line,
        col: self.start.col
      })
    }
    const parent = compressor.parent()
    if (is_lhs(self, parent)) return self
    if (compressor.option('unsafe_proto') &&
          self.expression instanceof AST_Dot &&
          self.expression.property == 'prototype') {
      var exp = self.expression.expression
      if (is_undeclared_ref(exp)) {
        switch (exp.name) {
          case 'Array':
            self.expression = make_node('AST_Array', self.expression, {
              elements: []
            })
            break
          case 'Function':
            self.expression = make_node('AST_Function', self.expression, {
              argnames: [],
              body: []
            })
            break
          case 'Number':
            self.expression = make_node('AST_Number', self.expression, {
              value: 0
            })
            break
          case 'Object':
            self.expression = make_node('AST_Object', self.expression, {
              properties: []
            })
            break
          case 'RegExp':
            self.expression = make_node('AST_RegExp', self.expression, {
              value: { source: 't', flags: '' }
            })
            break
          case 'String':
            self.expression = make_node('AST_String', self.expression, {
              value: ''
            })
            break
        }
      }
    }
    if (!(parent instanceof AST_Call) || !has_annotation(parent, _NOINLINE)) {
      const sub = self.flatten_object(self.property, compressor)
      if (sub) return sub.optimize(compressor)
    }
    let ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    if (this.expression.may_throw_on_access(compressor)) return this
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  may_throw (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.has_side_effects(compressor)
  }

  _find_defs (compressor: any, suffix) {
    return this.expression._find_defs(compressor, '.' + this.property + suffix)
  }

  _dot_throw (compressor: any) {
    if (!is_strict(compressor)) return false
    if (this.expression instanceof AST_Function && this.property == 'prototype') return false
    return true
  }

  is_call_pure (compressor: any) {
    if (!compressor.option('unsafe')) return
    const expr = this.expression
    let map
    if (expr instanceof AST_Array) {
      map = native_fns.get('Array')
    } else if (expr.is_boolean()) {
      map = native_fns.get('Boolean')
    } else if (expr.is_number(compressor)) {
      map = native_fns.get('Number')
    } else if (expr instanceof AST_RegExp) {
      map = native_fns.get('RegExp')
    } else if (expr.is_string(compressor)) {
      map = native_fns.get('String')
    } else if (!this.may_throw_on_access(compressor)) {
      map = native_fns.get('Object')
    }
    return map && map.has(this.property)
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
    return this.property.length + 1
  }

  shallow_cmp = mkshallow({ property: 'eq' })
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _codegen (self, output) {
    var expr = self.expression
    expr.print(output)
    var prop: string = self.property as string
    var print_computed = RESERVED_WORDS.has(prop)
      ? output.option('ie8')
      : !is_identifier_string(prop, (output.option('ecma') as unknown as number) >= 2015)
    if (print_computed) {
      output.print('[')
      output.add_mapping(self.end)
      output.print_string(prop)
      output.print(']')
    } else {
      if (expr instanceof AST_Number && expr.getValue() >= 0) {
        if (!/[xa-f.)]/i.test(output.last())) {
          output.print('.')
        }
      }
      output.print('.')
      // the name after dot would be mapped about here.
      output.add_mapping(self.end)
      output.print_name(prop)
    }
  }

  static documentation = 'A dotted property access expression'
  static propdoc = {
    quote: '[string] the original quote character when transformed from AST_Sub'
  }

  TYPE = 'Dot'
  static PROPS = AST_PropAccess.PROPS.concat(['quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
  }
}

class AST_Sub extends AST_PropAccess {
  _optimize (self, compressor) {
    var expr = self.expression
    var prop = self.property
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
        prop = self.property = best_of_expression(prop, make_node_from_constant(key, prop).transform(compressor))
        property = '' + key
        if (is_basic_identifier_string(property) &&
                  property.length <= prop.size() + 1) {
          return make_node('AST_Dot', self, {
            expression: expr,
            property: property,
            quote: prop.quote
          }).optimize(compressor)
        }
      }
    }
    var fn
    OPT_ARGUMENTS: if (compressor.option('arguments') &&
          expr instanceof AST_SymbolRef &&
          expr.name == 'arguments' &&
          expr.definition?.().orig.length == 1 &&
          (fn = expr.scope) instanceof AST_Lambda &&
          fn.uses_arguments &&
          !(fn instanceof AST_Arrow) &&
          prop instanceof AST_Number) {
      var index = prop.getValue()
      var params = new Set()
      var argnames = fn.argnames
      for (var n = 0; n < argnames.length; n++) {
        if (!(argnames[n] instanceof AST_SymbolFunarg)) {
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
        var sym = make_node('AST_SymbolRef', self, argname)
        sym.reference({})
        clear_flag(argname, UNUSED)
        return sym
      }
    }
    if (is_lhs(self, compressor.parent())) return self
    if (key !== prop) {
      var sub = self.flatten_object(property, compressor)
      if (sub) {
        expr = self.expression = sub.expression
        prop = self.property = sub.property
      }
    }
    if (compressor.option('properties') && compressor.option('side_effects') &&
          prop instanceof AST_Number && expr instanceof AST_Array) {
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
        if (retValue instanceof AST_Expansion) break FLATTEN
        retValue = retValue instanceof AST_Hole ? make_node('AST_Undefined', retValue) : retValue
        if (!flatten) values.unshift(retValue)
        while (--i >= 0) {
          let value = elements[i]
          if (value instanceof AST_Expansion) break FLATTEN
          value = value.drop_side_effect_free(compressor)
          if (value) values.unshift(value)
          else index--
        }
        if (flatten) {
          values.push(retValue)
          return make_sequence(self, values).optimize(compressor)
        } else {
          return make_node('AST_Sub', self, {
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
    var ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self
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

  TYPE = 'Sub'
  static PROPS = AST_PropAccess.PROPS
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
    if (this.operator == 'typeof' && this.expression instanceof AST_SymbolRef) return null
    var expression = this.expression.drop_side_effect_free(compressor, first_in_statement)
    if (first_in_statement && expression && is_iife_call(expression)) {
      if (expression === this.expression && this.operator == '!') return this
      return expression.negate(compressor, first_in_statement)
    }
    return expression
  }

  may_throw (compressor: any) {
    if (this.operator == 'typeof' && this.expression instanceof AST_SymbolRef) { return false }
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
    if (!(exp instanceof AST_SymbolRef)) return
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
          expression: fixed instanceof AST_Node ? fixed : fixed()
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
      if (this.expression instanceof AST_Sequence) {
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
      prefix: this instanceof AST_UnaryPrefix,
      argument: to_moz(this.expression)
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    return p instanceof AST_PropAccess && p.expression === this ||
            p instanceof AST_Call && p.expression === this ||
            p instanceof AST_Binary &&
                p.operator === '**' &&
                this instanceof AST_UnaryPrefix &&
                p.left === this &&
                this.operator !== '++' &&
                this.operator !== '--'
  }

  static documentation = 'Base class for unary expressions'
  static propdoc = {
    operator: '[string] the operator',
    expression: '[AST_Node] expression that this unary operator applies to'
  }

  TYPE = 'Unary'
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
          !(e instanceof AST_SymbolRef ||
              e instanceof AST_PropAccess ||
              is_identifier_atom(e))) {
      if (e instanceof AST_Sequence) {
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
          if (e instanceof AST_UnaryPrefix && e.operator == '!') {
            // !!foo ==> foo, if we're in boolean context
            return e.expression
          }
          if (e instanceof AST_Binary) {
            self = best_of(compressor, self, e.negate(compressor, first_in_statement(compressor)))
          }
          break
        case 'typeof':
          // typeof always returns a non-empty string, thus it's
          // always true in booleans
          compressor.warn('Boolean expression always true [{file}:{line},{col}]', self.start)
          return (e instanceof AST_SymbolRef ? make_node('AST_True', self) : make_sequence(self, [
            e,
            make_node('AST_True', self)
          ])).optimize(compressor)
      }
    }
    if (self.operator == '-' && e instanceof AST_Infinity) {
      e = e.transform(compressor)
    }
    if (e instanceof AST_Binary &&
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
          !(e instanceof AST_Number || e instanceof AST_Infinity || e instanceof AST_BigInt)) {
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
          (e instanceof AST_Lambda ||
              e instanceof AST_SymbolRef &&
                  e.fixed_value() instanceof AST_Lambda)) {
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
                self.expression instanceof AST_UnaryPrefix &&
                /^[+-]/.test(self.expression.operator))) {
      output.space()
    }
    self.expression.print(output)
  }

  static documentation = 'Unary prefix expression, i.e. `typeof i` or `++i`'

  TYPE = 'UnaryPrefix'
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

  TYPE = 'UnaryPostfix '
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

        if (!(self.left instanceof AST_Binary &&
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
              self.left instanceof AST_String &&
              self.left.value == 'undefined' &&
              self.right instanceof AST_UnaryPrefix &&
              self.right.operator == 'typeof') {
            var expr = self.right.expression
            if (expr instanceof AST_SymbolRef ? expr.is_declared(compressor)
              : !(expr instanceof AST_PropAccess && compressor.option('ie8'))) {
              self.right = expr
              self.left = make_node('AST_Undefined', self.left).optimize(compressor)
              if (self.operator.length == 2) self.operator += '='
            }
          } else if (self.left instanceof AST_SymbolRef &&
              // obj !== obj => false
              self.right instanceof AST_SymbolRef &&
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
          if (lhs instanceof AST_Binary &&
              lhs.operator == (self.operator == '&&' ? '!==' : '===') &&
              self.right instanceof AST_Binary &&
              lhs.operator == self.right.operator &&
              (is_undefined(lhs.left, compressor) && self.right.left instanceof AST_Null ||
                  lhs.left instanceof AST_Null && is_undefined(self.right.left, compressor)) &&
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
      if (!(compressor.parent() instanceof AST_Binary) ||
              compressor.parent() instanceof AST_Assign) {
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
      if (self.right instanceof AST_String &&
              self.right.getValue() == '' &&
              self.left.is_string(compressor)) {
        return self.left
      }
      if (self.left instanceof AST_String &&
              self.left.getValue() == '' &&
              self.right.is_string(compressor)) {
        return self.right
      }
      if (self.left instanceof AST_Binary &&
              self.left.operator == '+' &&
              self.left.left instanceof AST_String &&
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
          } else if (!(ll instanceof AST_Node)) {
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
          } else if (!(rr instanceof AST_Node)) {
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
          } else if (!(ll instanceof AST_Node)) {
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
          } else if (!(rr instanceof AST_Node)) {
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
            if (lr && !(lr instanceof AST_Node)) {
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
          if (!(ll instanceof AST_Node)) {
            // if we know the value for sure we can simply compute right away.
            return ll == null ? self.right : self.left
          }

          if (compressor.in_boolean_context()) {
            const rr = self.right.evaluate(compressor)
            if (!(rr instanceof AST_Node) && !rr) {
              return self.left
            }
          }
      }
      var associative = true
      switch (self.operator) {
        case '+':
          // "foo" + ("bar" + x) => "foobar" + x
          if (self.left instanceof AST_Constant &&
                  self.right instanceof AST_Binary &&
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
          if (self.right instanceof AST_Constant &&
                  self.left instanceof AST_Binary &&
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
          if (self.left instanceof AST_Binary &&
                  self.left.operator == '+' &&
                  self.left.is_string(compressor) &&
                  self.right instanceof AST_Binary &&
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
          if (self.right instanceof AST_UnaryPrefix &&
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
          if (self.left instanceof AST_UnaryPrefix &&
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
          if (self.left instanceof AST_TemplateString) {
            var l = self.left
            var r = self.right.evaluate(compressor)
            if (r != self.right) {
              l.segments[l.segments.length - 1].value += r.toString()
              return l
            }
          }
          // 1 + `foo${bar}baz` => `1foo${bar}baz`
          if (self.right instanceof AST_TemplateString) {
            var r = self.right
            var l = self.left.evaluate(compressor)
            if (l != self.left) {
              r.segments[0].value = l.toString() + r.segments[0].value
              return r
            }
          }
          // `1${bar}2` + `foo${bar}baz` => `1${bar}2foo${bar}baz`
          if (self.left instanceof AST_TemplateString &&
                  self.right instanceof AST_TemplateString) {
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
                  !(self.left instanceof AST_Binary &&
                      self.left.operator != self.operator &&
                      PRECEDENCE[self.left.operator] >= PRECEDENCE[self.operator])) {
            var reversed = make_node('AST_Binary', self, {
              operator: self.operator,
              left: self.right,
              right: self.left
            })
            if (self.right instanceof AST_Constant &&
                      !(self.left instanceof AST_Constant)) {
              self = best_of(compressor, reversed, self)
            } else {
              self = best_of(compressor, self, reversed)
            }
          }
          if (associative && self.is_number(compressor)) {
            // a + (b + c) => (a + b) + c
            if (self.right instanceof AST_Binary &&
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
            if (self.right instanceof AST_Constant &&
                      self.left instanceof AST_Binary &&
                      self.left.operator == self.operator) {
              if (self.left.left instanceof AST_Constant) {
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
              } else if (self.left.right instanceof AST_Constant) {
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
            if (self.left instanceof AST_Binary &&
                      self.left.operator == self.operator &&
                      self.left.right instanceof AST_Constant &&
                      self.right instanceof AST_Binary &&
                      self.right.operator == self.operator &&
                      self.right.left instanceof AST_Constant) {
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
    if (self.right instanceof AST_Binary &&
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
      if (this.left instanceof AST_Sequence) {
        var x = this.left.expressions.slice()
        var e = this.clone()
        e.left = x.pop()
        x.push(e)
        return make_sequence(this, x).optimize(compressor)
      }
      if (this.right instanceof AST_Sequence && !this.left.has_side_effects(compressor)) {
        var assign = this.operator == '=' && this.left instanceof AST_SymbolRef
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
            this.right instanceof AST_Unary && this.right.operator === this.operator
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
    if (p instanceof AST_Call && p.expression === this) { return true }
    // typeof (foo && bar)
    if (p instanceof AST_Unary) { return true }
    // (foo && bar)["prop"], (foo && bar).prop
    if (p?._needs_parens(this)) { return true }
    // this deals with precedence: 3 * (2 + 1)
    if (p instanceof AST_Binary) {
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
            self.left instanceof AST_UnaryPostfix &&
            self.left.operator == '--') {
      // space is mandatory to avoid outputting -->
      output.print(' ')
    } else {
      // the space is optional depending on "beautify"
      output.space()
    }
    output.print(op)
    if ((op == '<' || op == '<<') &&
            self.right instanceof AST_UnaryPrefix &&
            self.right.operator == '!' &&
            self.right.expression instanceof AST_UnaryPrefix &&
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

  TYPE = 'Binary'
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
    if (self.condition instanceof AST_Sequence) {
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
    if (condition instanceof AST_SymbolRef &&
          consequent instanceof AST_SymbolRef &&
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
    if (consequent instanceof AST_Assign &&
          alternative instanceof AST_Assign &&
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
    if (consequent instanceof AST_Call &&
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
    if (alternative instanceof AST_Conditional &&
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
    if (alternative instanceof AST_Sequence &&
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
    if (alternative instanceof AST_Binary &&
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
    if (consequent instanceof AST_Conditional &&
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
    if (consequent instanceof AST_Binary &&
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
      return node instanceof AST_True ||
              in_bool &&
                  node instanceof AST_Constant &&
                  node.getValue() ||
              (node instanceof AST_UnaryPrefix &&
                  node.operator == '!' &&
                  node.expression instanceof AST_Constant &&
                  !node.expression.getValue())
    }
    // AST_False or !1
    function is_false (node: any) {
      return node instanceof AST_False ||
              in_bool &&
                  node instanceof AST_Constant &&
                  !node.getValue() ||
              (node instanceof AST_UnaryPrefix &&
                  node.operator == '!' &&
                  node.expression instanceof AST_Constant &&
                  node.expression.getValue())
    }

    function single_arg_diff () {
      var a = consequent.args
      var b = alternative.args
      for (var i = 0, len = a.length; i < len; i++) {
        if (a[i] instanceof AST_Expansion) return
        if (!a[i].equivalent_to(b[i])) {
          if (b[i] instanceof AST_Expansion) return
          for (var j = i + 1; j < len; j++) {
            if (a[j] instanceof AST_Expansion) return
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

  TYPE = 'Conditional'
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
          self.left instanceof AST_SymbolRef &&
          (def = self.left.definition?.()).scope === compressor.find_parent(AST_Lambda)) {
      var level = 0; var node; var parent = self
      do {
        node = parent
        parent = compressor.parent(level++)
        if (parent instanceof AST_Exit) {
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
      } while (parent instanceof AST_Binary && parent.right === node ||
              parent instanceof AST_Sequence && parent.tail_node() === node)
    }
    self = self.lift_sequences(compressor)
    if (self.operator == '=' && self.left instanceof AST_SymbolRef && self.right instanceof AST_Binary) {
      // x = expr1 OP expr2
      if (self.right.left instanceof AST_SymbolRef &&
              self.right.left.name == self.left.name &&
              ASSIGN_OPS.has(self.right.operator)) {
        // x = x - 2  --->  x -= 2
        self.operator = self.right.operator + '='
        self.right = self.right.right
      } else if (self.right.right instanceof AST_SymbolRef &&
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
        if (parent instanceof AST_Try) {
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
              left instanceof AST_PropAccess &&
              left.expression.is_constant()) {
      return this
    }
    set_flag(this, WRITE_ONLY)
    while (left instanceof AST_PropAccess) {
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
          this.left instanceof AST_SymbolRef) {
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
    if (node.left instanceof AST_Destructuring) {
      suppress(node.left)
      return
    }
    var sym = node.left
    if (!(sym instanceof AST_SymbolRef)) return
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
        left: fixed instanceof AST_Node ? fixed : fixed(),
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

  TYPE = 'Assign'
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

  TYPE = 'DefaultAssign'
  static PROPS = AST_Binary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

/* -----[ LITERALS ]----- */

class AST_ObjectKeyVal extends AST_ObjectProperty {
  quote: any
  key: any
  value: any

  _to_mozilla_ast (parent) {
    var key = this.key instanceof AST_Node ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
    var kind
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key?.isAst?.('AST_Symbol')) || this.key?.isAst?.('AST_SymbolRef')
    if (this.isAst('AST_ObjectKeyVal')) {
      kind = 'init'
      computed = !string_or_num
    }
    if (parent?.isAst?.('AST_Class')) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: (this as any).static,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(this.value)
    }
  }

  _optimize = function (self, compressor) {
    lift_key(self, compressor)
    // p:function(){} ---> p(){}
    // p:function*(){} ---> *p(){}
    // p:async function(){} ---> async p(){}
    // p:()=>{} ---> p(){}
    // p:async()=>{} ---> async p(){}
    var unsafe_methods = compressor.option('unsafe_methods')
    if (unsafe_methods &&
          compressor.option('ecma') >= 2015 &&
          (!(unsafe_methods instanceof RegExp) || unsafe_methods.test(self.key + ''))) {
      var key = self.key
      var value = self.value
      var is_arrow_with_block = value instanceof AST_Arrow &&
              Array.isArray(value.body) &&
              !value.contains_this()
      if ((is_arrow_with_block || value instanceof AST_Function) && !value.name) {
        return make_node('AST_ConciseMethod', self, {
          async: value.async,
          is_generator: value.is_generator,
          key: key instanceof AST_Node ? key : make_node('AST_SymbolMethod', self, {
            name: key
          }),
          value: make_node('AST_Accessor', value, value),
          quote: self.quote
        })
      }
    }
    return self
  }

  computed_key () {
    return this.key instanceof AST_Node
  }

  shallow_cmp = mkshallow({ key: 'eq' })
  _size = function (): number {
    return key_size(this.key) + 1
  }

  _codegen = function (self, output) {
    function get_name (self: any) {
      var def = self.definition()
      return def ? def.mangled_name || def.name : self.name
    }

    var allowShortHand = output.option('shorthand')
    if (allowShortHand &&
            self.value instanceof AST_Symbol &&
            is_identifier_string(self.key, (output.option('ecma') as unknown as number) >= 2015) &&
            get_name(self.value) === self.key &&
            !RESERVED_WORDS.has(self.key)
    ) {
      print_property_name(self.key, self.quote, output)
    } else if (allowShortHand &&
            self.value instanceof AST_DefaultAssign &&
            self.value.left instanceof AST_Symbol &&
            is_identifier_string(self.key, (output.option('ecma') as unknown as number) >= 2015) &&
            get_name(self.value.left) === self.key
    ) {
      print_property_name(self.key, self.quote, output)
      output.space()
      output.print('=')
      output.space()
      self.value.right.print(output)
    } else {
      if (!(self.key instanceof AST_Node)) {
        print_property_name(self.key, self.quote, output)
      } else {
        output.with_square(function () {
          self.key.print(output)
        })
      }
      output.colon()
      self.value.print(output)
    }
  }

  static documentation = 'A key: value object property'
  static propdoc = {
    quote: '[string] the original quote character'
  }

  TYPE = 'ObjectKeyVal'
  static PROPS = AST_ObjectProperty.PROPS.concat(['quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
  }
}

class AST_ObjectSetter extends AST_ObjectProperty {
  quote: any
  static: any

  _to_mozilla_ast (parent) {
    var key = this.key instanceof AST_Node ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
    var kind
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key instanceof AST_Symbol) || this.key instanceof AST_SymbolRef
    if (this instanceof AST_ObjectKeyVal) {
      kind = 'init'
      computed = !string_or_num
    } else
    if (this instanceof AST_ObjectGetter) {
      kind = 'get'
    } else
    if (this instanceof AST_ObjectSetter) {
      kind = 'set'
    }
    if (this instanceof AST_ClassProperty) {
      return {
        type: 'FieldDefinition',
        computed,
        key,
        value: to_moz(this.value),
        static: this.static
      }
    }
    if (parent instanceof AST_Class) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: (this as any).static,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(this.value)
    }
  }

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: any) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  }

  _size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  }

  shallow_cmp = mkshallow({
    static: 'eq'
  })

  _codegen = function (self, output) {
    self._print_getter_setter('set', output)
  }

  add_source_map = function (output) { output.add_mapping(this.start, this.key.name) }
  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static setter (classes only)'
  }

  static documentation = 'An object setter property'

  TYPE = 'ObjectSetter'
  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
  }
}

class AST_ObjectGetter extends AST_ObjectProperty {
  static: any
  quote: any

  _to_mozilla_ast (parent) {
    var key = this.key instanceof AST_Node ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
    var kind
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key instanceof AST_Symbol) || this.key instanceof AST_SymbolRef
    if (this instanceof AST_ObjectGetter) {
      kind = 'get'
    }
    if (parent instanceof AST_Class) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: (this as any).static,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(this.value)
    }
  }

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: any) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  _dot_throw = return_true
  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  }

  _size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  }

  shallow_cmp = mkshallow({
    static: 'eq'
  })

  _codegen = function (self, output) {
    self._print_getter_setter('get', output)
  }

  add_source_map = function (output) { output.add_mapping(this.start, this.key.name) }
  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static getter (classes only)'
  }

  static documentation = 'An object getter property'

  TYPE = 'ObjectGetter'
  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
  }
}

class AST_ConciseMethod extends AST_ObjectProperty {
  async: any
  is_generator: any
  static: any
  quote: any

  _optimize = function (self, compressor) {
    lift_key(self, compressor)
    // p(){return x;} ---> p:()=>x
    if (compressor.option('arrows') &&
          compressor.parent() instanceof AST_Object &&
          !self.is_generator &&
          !self.value.uses_arguments &&
          !self.value.pinned() &&
          self.value.body.length == 1 &&
          self.value.body[0] instanceof AST_Return &&
          self.value.body[0].value &&
          !self.value.contains_this()) {
      var arrow = make_node('AST_Arrow', self.value, self.value)
      arrow.async = self.async
      arrow.is_generator = self.is_generator
      return make_node('AST_ObjectKeyVal', self, {
        key: self.key instanceof AST_SymbolMethod ? self.key.name : self.key,
        value: arrow,
        quote: self.quote
      })
    }
    return self
  }

  drop_side_effect_free = function () {
    return this.computed_key() ? this.key : null
  }

  may_throw = function (compressor: any) {
    return this.computed_key() && this.key.may_throw(compressor)
  }

  has_side_effects = function (compressor: any) {
    return this.computed_key() && this.key.has_side_effects(compressor)
  }

  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  }

  _size = function (): number {
    return static_size(this.static) + key_size(this.key) + lambda_modifiers(this)
  }

  shallow_cmp = mkshallow({
    static: 'eq',
    is_generator: 'eq',
    async: 'eq'
  })

  _to_mozilla_ast (parent) {
    if (parent instanceof AST_Object) {
      return {
        type: 'Property',
        computed: !(this.key instanceof AST_Symbol) || this.key instanceof AST_SymbolRef,
        kind: 'init',
        method: true,
        shorthand: false,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'MethodDefinition',
      computed: !(this.key instanceof AST_Symbol) || this.key instanceof AST_SymbolRef,
      kind: this.key === 'constructor' ? 'constructor' : 'method',
      static: this.static,
      key: to_moz(this.key),
      value: to_moz(this.value)
    }
  }

  _codegen = function (self, output) {
    var type
    if (self.is_generator && self.async) {
      type = 'async*'
    } else if (self.is_generator) {
      type = '*'
    } else if (self.async) {
      type = 'async'
    }
    self._print_getter_setter(type, output)
  }

  static propdoc = {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] is this method static (classes only)',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }

  static documentation = 'An ES6 concise method inside an object or class'

  TYPE = 'ConciseMethod'
  static PROPS = AST_ObjectProperty.PROPS.concat(['quote', 'static', 'is_generator', 'async'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
    this.static = args.static
    this.is_generator = args.is_generator
    this.async = args.async
  }
}

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
    var type = this instanceof AST_ClassExpression ? 'ClassExpression' : 'ClassDeclaration'
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
        !(self.extends instanceof AST_SymbolRef) &&
                !(self.extends instanceof AST_PropAccess) &&
                !(self.extends instanceof AST_ClassExpression) &&
                !(self.extends instanceof AST_Function)
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

  TYPE = 'Class'
  static PROPS = AST_Scope.PROPS.concat(['name', 'extends', 'properties'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.name = args.name
    this.extends = args.extends
    this.properties = args.properties
  }
}

class AST_ClassProperty extends AST_ObjectProperty {
  quote: any
  static: any

  _to_mozilla_ast (parent) {
    var key = this.key instanceof AST_Node ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key instanceof AST_Symbol) || this.key instanceof AST_SymbolRef
    return {
      type: 'FieldDefinition',
      computed,
      key,
      value: to_moz(this.value),
      static: this.static
    }
  }

  drop_side_effect_free = function (compressor: any) {
    const key = this.computed_key() && this.key.drop_side_effect_free(compressor)

    const value = this.static && this.value &&
          this.value.drop_side_effect_free(compressor)

    if (key && value) return make_sequence(this, [key, value])
    return key || value || null
  }

  may_throw = function (compressor: any) {
    return (
      this.computed_key() && this.key.may_throw(compressor) ||
          this.static && this.value && this.value.may_throw(compressor)
    )
  }

  has_side_effects = function (compressor: any) {
    return (
      this.computed_key() && this.key.has_side_effects(compressor) ||
          this.static && this.value && this.value.has_side_effects(compressor)
    )
  }

  _walk = function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.key instanceof AST_Node) { this.key._walk(visitor) }
      if (this.value instanceof AST_Node) { this.value._walk(visitor) }
    })
  }

  _children_backwards (push: Function) {
    if (this.value instanceof AST_Node) push(this.value)
    if (this.key instanceof AST_Node) push(this.key)
  }

  computed_key () {
    return !(this.key instanceof AST_SymbolClassProperty)
  }

  _size = function (): number {
    return (
      static_size(this.static) +
            (typeof this.key === 'string' ? this.key.length + 2 : 0) +
            (this.value ? 1 : 0)
    )
  }

  shallow_cmp = mkshallow({
    static: 'eq'
  })

  _codegen = (self, output) => {
    if (self.static) {
      output.print('static')
      output.space()
    }

    if (self.key instanceof AST_SymbolClassProperty) {
      print_property_name(self.key.name, self.quote, output)
    } else {
      output.print('[')
      self.key.print(output)
      output.print(']')
    }

    if (self.value) {
      output.print('=')
      self.value.print(output)
    }

    output.semicolon()
  }

  static documentation = 'A class property'
  static propdoc = {
    static: '[boolean] whether this is a static key',
    quote: '[string] which quote is being used'
  }

  TYPE = 'ClassProperty'
  static PROPS = AST_ObjectProperty.PROPS.concat(['static', 'quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.static = args.static
    this.quote = args.quote
  }
}

class AST_DefClass extends AST_Class {
  name: any
  extends: any
  properties: any[]

  static documentation = 'A class definition'

  TYPE = 'DefClass'
  static PROPS = AST_Class.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_ClassExpression extends AST_Class {
  name: any

  needs_parens = first_in_statement
  static documentation: 'A class expression.'

  TYPE = 'ClassExpression'
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
              !(parent instanceof AST_Call &&
                  (parent.is_expr_pure(compressor)) ||
                      has_annotation(parent, _NOINLINE))
      if (single_use && (fixed instanceof AST_Lambda || fixed instanceof AST_Class)) {
        if (retain_top_func(fixed, compressor)) {
          single_use = false
        } else if (def.scope !== self.scope &&
                  (def.escaped == 1 ||
                      has_flag(fixed, INLINED) ||
                      within_array_or_object_literal(compressor))) {
          single_use = false
        } else if (recursive_ref(compressor, def)) {
          single_use = false
        } else if (def.scope !== self.scope || def.orig[0] instanceof AST_SymbolFunarg) {
          single_use = fixed.is_constant_expression(self.scope)
          if (single_use == 'f') {
            var scope = self.scope
            do {
              if (scope instanceof AST_Defun || is_func_expr(scope)) {
                set_flag(scope, INLINED)
              }
            } while (scope = scope.parent_scope)
          }
        }
      }
      if (single_use && fixed instanceof AST_Lambda) {
        const block_scope = find_scope(compressor)
        single_use =
                  def.scope === self.scope &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed) ||
                  parent instanceof AST_Call &&
                      parent.expression === self &&
                      !scope_encloses_variables_in_this_scope(block_scope, fixed)
      }
      if (single_use && fixed instanceof AST_Class) {
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
        if (fixed instanceof AST_DefClass) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_ClassExpression', fixed, fixed)
        }
        if (fixed instanceof AST_Defun) {
          set_flag(fixed, SQUEEZED)
          fixed = make_node('AST_Function', fixed, fixed)
        }
        if (def.recursive_refs > 0 && fixed.name instanceof AST_SymbolDefun) {
          const defun_def = fixed.name.definition?.()
          let lambda_def = fixed.variables.get(fixed.name.name)
          let name = lambda_def && lambda_def.orig[0]
          if (!(name instanceof AST_SymbolLambda)) {
            name = make_node('AST_SymbolLambda', fixed.name, fixed.name)
            name.scope = fixed
            fixed.name = name
            lambda_def = fixed.def_function(name)
          }
          walk(fixed, (node: any) => {
            if (node instanceof AST_SymbolRef && node.definition?.() === defun_def) {
              node.thedef = lambda_def
              lambda_def.references.push(node)
            }
          })
        }
        if (fixed instanceof AST_Lambda || fixed instanceof AST_Class) {
          find_scope(compressor).add_child_scope(fixed)
        }
        return fixed.optimize(compressor)
      }
      if (fixed && def.should_replace === undefined) {
        let init
        if (fixed instanceof AST_This) {
          if (!(def.orig[0] instanceof AST_SymbolFunarg) &&
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
        if (node instanceof AST_SymbolRef) return walk_abort
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
          d.orig[0] instanceof AST_SymbolDefun) {
          tw.loop_ids?.set(d.id, tw.in_loop)
    }
    var fixed_value
    if (d.fixed === undefined || !safe_to_read(tw, d)) {
      d.fixed = false
    } else if (d.fixed) {
      fixed_value = this.fixed_value()
      if (
        fixed_value instanceof AST_Lambda &&
              recursive_ref(tw, d)
      ) {
        d.recursive_refs++
      } else if (fixed_value &&
              !compressor.exposed(d) &&
              ref_once(tw, compressor, d)
      ) {
        d.single_use =
                  fixed_value instanceof AST_Lambda && !fixed_value.pinned?.() ||
                  fixed_value instanceof AST_Class ||
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
    return orig.length == 1 && orig[0] instanceof AST_SymbolLambda
  }

  _size (): number {
    const { name, thedef } = this

    if (thedef && thedef.global) return name.length

    if (name === 'arguments') return 9

    return 2
  }

  static documentation = 'Reference to some symbol (not definition/declaration)'

  TYPE = 'SymbolRef'
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

  TYPE = 'SymbolExport'
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

  TYPE = 'Super'
  static PROPS = AST_This.PROPS

  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

class AST_NaN extends AST_Atom {
  _optimize = function (self, compressor) {
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && !is_atomic(lhs, self) ||
          find_variable(compressor, 'NaN')) {
      return make_node('AST_Binary', self, {
        operator: '/',
        left: make_node('AST_Number', self, {
          value: 0
        }),
        right: make_node('AST_Number', self, {
          value: 0
        })
      })
    }
    return self
  }

  value = 0 / 0
  _size = () => 3
  static documentation: 'The impossible value'

  TYPE = 'NaN'
  static PROPS = AST_Atom.PROPS
}

class AST_Undefined extends AST_Atom {
  _optimize = function (self, compressor) {
    if (compressor.option('unsafe_undefined')) {
      var undef = find_variable(compressor, 'undefined')
      if (undef) {
        var ref = make_node('AST_SymbolRef', self, {
          name: 'undefined',
          scope: undef.scope,
          thedef: undef
        })
        set_flag(ref, UNDEFINED)
        return ref
      }
    }
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && is_atomic(lhs, self)) return self
    return make_node('AST_UnaryPrefix', self, {
      operator: 'void',
      expression: make_node('AST_Number', self, {
        value: 0
      })
    })
  }

  _dot_throw = return_true
  value = (function () {}())
  _size = () => 6 // "void 0"
  static documentation: 'The `undefined` value'

  TYPE = 'Undefined'
  static PROPS = AST_Atom.PROPS
}

class AST_Infinity extends AST_Atom {
  _optimize = function (self, compressor) {
    var lhs = is_lhs(compressor.self(), compressor.parent())
    if (lhs && is_atomic(lhs, self)) return self
    if (
      compressor.option('keep_infinity') &&
          !(lhs && !is_atomic(lhs, self)) &&
          !find_variable(compressor, 'Infinity')
    ) {
      return self
    }
    return make_node('AST_Binary', self, {
      operator: '/',
      left: make_node('AST_Number', self, {
        value: 1
      }),
      right: make_node('AST_Number', self, {
        value: 0
      })
    })
  }

  value = 1 / 0
  _size = () => 8
  static documentation: 'The `Infinity` value'

  TYPE = 'Infinity'

  static PROPS = AST_Atom.PROPS
}

class AST_Boolean extends AST_Atom {
  _optimize = function (self, compressor) {
    if (compressor.in_boolean_context()) {
      return make_node('AST_Number', self, {
        value: +self.value
      })
    }
    var p = compressor.parent()
    if (compressor.option('booleans_as_integers')) {
      if (p instanceof AST_Binary && (p.operator == '===' || p.operator == '!==')) {
        p.operator = p.operator.replace(/=$/, '')
      }
      return make_node('AST_Number', self, {
        value: +self.value
      })
    }
    if (compressor.option('booleans')) {
      if (p instanceof AST_Binary && (p.operator == '==' ||
                                          p.operator == '!=')) {
        compressor.warn('Non-strict equality against boolean: {operator} {value} [{file}:{line},{col}]', {
          operator: p.operator,
          value: self.value,
          file: p.start.file,
          line: p.start.line,
          col: p.start.col
        })
        return make_node('AST_Number', self, {
          value: +self.value
        })
      }
      return make_node('AST_UnaryPrefix', self, {
        operator: '!',
        expression: make_node('AST_Number', self, {
          value: 1 - self.value
        })
      })
    }
    return self
  }

  _to_mozilla_ast (parent): any {
    return To_Moz_Literal(this)
  }

  static documentation = 'Base class for booleans'

  TYPE = 'Boolean'

  static PROPS = AST_Atom.PROPS
}

class AST_False extends AST_Boolean {
  is_boolean = return_true
  value = false
  _size = () => 5
  static documentation = 'The `false` atom'

  TYPE = 'False'

  static PROPS = AST_Boolean.PROPS
}

class AST_True extends AST_Boolean {
  is_boolean = return_true
  value = true
  _size = () => 4
  static documentation = 'The `true` atom'

  TYPE = 'True'

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
  _PURE
}

/* -----[ tools ]----- */

function redefined_catch_def (def: any) {
  if (def.orig[0] instanceof AST_SymbolCatch &&
        def.scope.is_block_scope()
  ) {
    return def.scope.get_defun_scope().variables.get(def.name)
  }
}

const MASK_EXPORT_DONT_MANGLE = 1 << 0
const MASK_EXPORT_WANT_MANGLE = 1 << 1

/* -----[ code generators ]----- */

/* -----[ utils ]----- */

function skip_string (node: any) {
  if (node instanceof AST_String) {
    base54.consider(node.value, -1)
  } else if (node instanceof AST_Conditional) {
    skip_string(node.consequent)
    skip_string(node.alternative)
  } else if (node instanceof AST_Sequence) {
    skip_string(node.tail_node?.())
  }
}

function needsParens (output: any) {
  var p = output.parent()
  // !(a = false) → true
  if (p instanceof AST_Unary) { return true }
  // 1 + (a = 2) + 3 → 6, side effect setting a = 2
  if (p instanceof AST_Binary && !(p instanceof AST_Assign)) { return true }
  // (a = func)() —or— new (a = Object)()
  if (p instanceof AST_Call && p.expression === this) { return true }
  // (a = foo) ? bar : baz
  if (p instanceof AST_Conditional && p.condition === this) { return true }
  // (a = foo)["prop"] —or— (a = foo).prop
  if (p?._needs_parens(this)) { return true }
  // ({a, b} = {a: 1, b: 2}), a destructuring assignment
  if (this instanceof AST_Assign && this.left instanceof AST_Destructuring && this.left.is_array === false) { return true }
  return undefined
}

/* -----[ PRINTERS ]----- */

/* -----[ statements ]----- */

function display_body (body: any[], is_toplevel: boolean, output: any, allow_directives: boolean) {
  var last = body.length - 1
  output.in_directive = allow_directives
  body.forEach(function (stmt, i) {
    if (output.in_directive === true && !(stmt instanceof AST_Directive ||
            stmt instanceof AST_EmptyStatement ||
            (stmt instanceof AST_SimpleStatement && stmt.body instanceof AST_String)
    )) {
      output.in_directive = false
    }
    if (!(stmt instanceof AST_EmptyStatement)) {
      output.indent()
      stmt.print(output)
      if (!(i == last && is_toplevel)) {
        output.newline()
        if (is_toplevel) output.newline()
      }
    }
    if (output.in_directive === true &&
            stmt instanceof AST_SimpleStatement &&
            stmt.body instanceof AST_String
    ) {
      output.in_directive = false
    }
  })
  output.in_directive = false
}

function print_braced (self: any, output: any, allow_directives?: boolean) {
  if ((self.body as any[]).length > 0) {
    output.with_block(function () {
      display_body((self.body as any[]), false, output, !!allow_directives)
    })
  } else print_braced_empty(self, output)
}

/* -----[ exits ]----- */

/* -----[ if ]----- */
function make_then (self: any, output: any) {
  var b: any = self.body
  if (output.option('braces') ||
        output.option('ie8') && b instanceof AST_Do) { return make_block(b, output) }
  // The squeezer replaces "block"-s that contain only a single
  // statement with the statement itself; technically, the AST
  // is correct, but this can create problems when we output an
  // IF having an ELSE clause where the THEN clause ends in an
  // IF *without* an ELSE block (then the outer ELSE would refer
  // to the inner IF).  This function checks for this case and
  // adds the block braces if needed.
  if (!b) return output.force_semicolon()
  while (true) {
    if (b instanceof AST_If) {
      if (!b.alternative) {
        make_block(self.body, output)
        return
      }
      b = b.alternative
    } else if (b instanceof AST_StatementWithBody) {
      b = b.body
    } else break
  }
  force_statement(self.body, output)
}

/* -----[ switch ]----- */
/* -----[ var/const ]----- */

function parenthesize_for_noin (node: any, output: any, noin: boolean) {
  var parens = false
  // need to take some precautions here:
  //    https://github.com/mishoo/UglifyJS2/issues/60
  if (noin) {
    parens = walk(node, (node: any) => {
      if (node instanceof AST_Scope) return true
      if (node instanceof AST_Binary && node.operator == 'in') {
        return walk_abort // makes walk() return true
      }
      return undefined
    })
  }
  node.print(output, parens)
}

/* -----[ other expressions ]----- */

/* -----[ literals ]----- */

export {
  OutputStream
}

function next_mangled (scope: any, options: any) {
  var ext = scope.enclosed
  out: while (true) {
    var m = base54(++scope.cname)
    if (RESERVED_WORDS.has(m)) continue // skip over "do"

    // https://github.com/mishoo/UglifyJS2/issues/242 -- do not
    // shadow a name reserved from mangling.
    if (options.reserved?.has(m)) continue

    // Functions with short names might collide with base54 output
    // and therefore cause collisions when keep_fnames is true.
    if (unmangleable_names && unmangleable_names.has(m)) continue out

    // we must ensure that the mangled name does not shadow a name
    // from some parent scope that is referenced in this or in
    // inner scopes.
    for (let i = ext.length; --i >= 0;) {
      const def = ext[i]
      const name = def.mangled_name || (def.unmangleable(options) && def.name)
      if (m == name) continue out
    }
    return m
  }
}

export function safe_to_flatten (value, compressor) {
  if (value instanceof AST_SymbolRef) {
    value = value.fixed_value()
  }
  if (!value) return false
  if (!(value instanceof AST_Lambda || value instanceof AST_Class)) return true
  if (!(value instanceof AST_Lambda && value.contains_this())) return true
  return compressor.parent() instanceof AST_New
}

export function is_empty (thing) {
  if (thing === null) return true
  if (thing instanceof AST_EmptyStatement) return true
  if (thing instanceof AST_BlockStatement) return thing.body.length == 0
  return false
}

export function is_undeclared_ref (node: any) {
  return node instanceof AST_SymbolRef && node.definition?.().undeclared
}

export function reset_variables (tw, compressor, node) {
  node.variables.forEach(function (def) {
    reset_def(compressor, def)
    if (def.fixed === null) {
      tw.defs_to_safe_ids.set(def.id, tw.safe_ids)
      mark(tw, def, true)
    } else if (def.fixed) {
      tw.loop_ids.set(def.id, tw.in_loop)
      mark(tw, def, true)
    }
  })
}

const suppress = node => walk(node, (node: any) => {
  if (!(node instanceof AST_Symbol)) return
  var d = node.definition?.()
  if (!d) return
  if (node instanceof AST_SymbolRef) d.references.push(node)
  d.fixed = false
})

function safe_to_assign (tw, def, scope, value) {
  if (def.fixed === undefined) return true
  let def_safe_ids
  if (def.fixed === null &&
        (def_safe_ids = tw.defs_to_safe_ids.get(def.id))
  ) {
    def_safe_ids[def.id] = false
    tw.defs_to_safe_ids.delete(def.id)
    return true
  }
  if (!HOP(tw.safe_ids, def.id)) return false
  if (!safe_to_read(tw, def)) return false
  if (def.fixed === false) return false
  if (def.fixed != null && (!value || def.references.length > def.assignments)) return false
  if (def.fixed instanceof AST_Defun) {
    return value instanceof AST_Node && def.fixed.parent_scope === scope
  }
  return def.orig.every((sym) => {
    return !(sym instanceof AST_SymbolConst ||
            sym instanceof AST_SymbolDefun ||
            sym instanceof AST_SymbolLambda)
  })
}

function safe_to_read (tw, def) {
  if (def.single_use == 'm') return false
  if (tw.safe_ids[def.id]) {
    if (def.fixed == null) {
      var orig = def.orig[0]
      if (orig instanceof AST_SymbolFunarg || orig.name == 'arguments') return false
      def.fixed = make_node('AST_Undefined', orig)
    }
    return true
  }
  return def.fixed instanceof AST_Defun
}

function ref_once (tw, compressor, def) {
  return compressor.option('unused') &&
        !def.scope.pinned() &&
        def.references.length - def.recursive_refs == 1 &&
        tw.loop_ids.get(def.id) === tw.in_loop
}

function is_immutable (value) {
  if (!value) return false
  return value.is_constant() ||
        value instanceof AST_Lambda ||
        value instanceof AST_This
}

function mark_escaped (tw, d, scope, node, value, level, depth) {
  var parent = tw.parent(level)
  if (value) {
    if (value.is_constant()) return
    if (value instanceof AST_ClassExpression) return
  }
  if (parent instanceof AST_Assign && parent.operator == '=' && node === parent.right ||
        parent instanceof AST_Call && (node !== parent.expression || parent instanceof AST_New) ||
        parent instanceof AST_Exit && node === parent.value && node.scope !== d.scope ||
        parent instanceof AST_VarDef && node === parent.value ||
        parent instanceof AST_Yield && node === parent.value && node.scope !== d.scope) {
    if (depth > 1 && !(value && value.is_constant_expression(scope))) depth = 1
    if (!d.escaped || d.escaped > depth) d.escaped = depth
    return
  } else if (parent instanceof AST_Array ||
        parent instanceof AST_Await ||
        parent instanceof AST_Binary && lazy_op.has(parent.operator) ||
        parent instanceof AST_Conditional && node !== parent.condition ||
        parent instanceof AST_Expansion ||
        parent instanceof AST_Sequence && node === parent.tail_node?.()) {
    mark_escaped(tw, d, scope, parent, parent, level + 1, depth)
  } else if (parent instanceof AST_ObjectKeyVal && node === parent.value) {
    var obj = tw.parent(level + 1)
    mark_escaped(tw, d, scope, obj, obj, level + 2, depth)
  } else if (parent instanceof AST_PropAccess && node === parent.expression) {
    value = read_property(value, parent.property)
    mark_escaped(tw, d, scope, parent, value, level + 1, depth + 1)
    if (value) return
  }
  if (level > 0) return
  if (parent instanceof AST_Sequence && node !== parent.tail_node?.()) return
  if (parent instanceof AST_SimpleStatement) return
  d.direct_access = true
}

function mark_lambda (tw, descend, compressor) {
  clear_flag(this, INLINED)
  push(tw)
  reset_variables(tw, compressor, this)
  if (this.uses_arguments) {
    descend()
    pop(tw)
    return
  }
  var iife
  if (!this.name &&
        (iife = tw.parent()) instanceof AST_Call &&
        iife.expression === this &&
        !iife.args.some(arg => arg instanceof AST_Expansion) &&
        this.argnames.every(arg_name => arg_name instanceof AST_Symbol)
  ) {
    // Virtually turn IIFE parameters into variable definitions:
    //   (function(a,b) {...})(c,d) => (function() {var a=c,b=d; ...})()
    // So existing transformation rules can work on them.
    this.argnames.forEach((arg, i) => {
      if (!arg.definition) return
      var d = arg.definition?.()
      // Avoid setting fixed when there's more than one origin for a variable value
      if (d.orig.length > 1) return
      if (d.fixed === undefined && (!this.uses_arguments || tw.has_directive('use strict'))) {
        d.fixed = function () {
          return iife.args[i] || make_node('AST_Undefined', iife)
        }
        tw.loop_ids.set(d.id, tw.in_loop)
        mark(tw, d, true)
      } else {
        d.fixed = false
      }
    })
  }
  descend()
  pop(tw)
  return true
}

export function recursive_ref (compressor, def) {
  var node
  for (var i = 0; node = compressor.parent(i); i++) {
    if (
      node instanceof AST_Lambda ||
            node instanceof AST_Class
    ) {
      var name = node.name
      if (name && name.definition?.() === def) break
    }
  }
  return node
}

function to_node (value, orig) {
  if (value instanceof AST_Node) return make_node(value.constructor.name, orig, value)
  if (Array.isArray(value)) {
    return make_node('AST_Array', orig, {
      elements: value.map(function (value) {
        return to_node(value, orig)
      })
    })
  }
  if (value && typeof value === 'object') {
    var props: any[] = []
    for (var key in value) {
      if (HOP(value, key)) {
        props.push(make_node('AST_ObjectKeyVal', orig, {
          key: key,
          value: to_node(value[key], orig)
        }))
      }
    }
    return make_node('AST_Object', orig, {
      properties: props
    })
  }
  return make_node_from_constant(value, orig)
}

// method to negate an expression
export function basic_negation (exp) {
  return make_node('AST_UnaryPrefix', exp, {
    operator: '!',
    expression: exp
  })
}
function best (orig, alt, first_in_statement) {
  var negated = basic_negation(orig)
  if (first_in_statement) {
    var stat = make_node('AST_SimpleStatement', alt, {
      body: alt
    })
    return best_of_expression(negated, stat) === stat ? alt : negated
  }
  return best_of_expression(negated, alt)
}

/* -----[ boolean/negation helpers ]----- */
// determine if expression is constant
function all_refs_local (scope) {
  let result: any = true
  walk(this, (node: any) => {
    if (node instanceof AST_SymbolRef) {
      if (has_flag(this, INLINED)) {
        result = false
        return walk_abort
      }
      var def = node.definition?.()
      if (
        member(def, this.enclosed) &&
                !this.variables.has(def.name)
      ) {
        if (scope) {
          var scope_def = scope.find_variable(node)
          if (def.undeclared ? !scope_def : scope_def === def) {
            result = 'f'
            return true
          }
        }
        result = false
        return walk_abort
      }
      return true
    }
    if (node instanceof AST_This && this instanceof AST_Arrow) {
      result = false
      return walk_abort
    }
  })
  return result
}

var global_objs = {
  Array: Array,
  Math: Math,
  Number: Number,
  Object: Object,
  String: String
}

export function is_iife_call (node: any) {
  // Used to determine whether the node can benefit from negation.
  // Not the case with arrow functions (you need an extra set of parens).
  if (node.TYPE != 'Call') return false
  return node.expression instanceof AST_Function || is_iife_call(node.expression)
}

function can_be_extracted_from_if_block (node: any) {
  return !(
    node instanceof AST_Const ||
        node instanceof AST_Let ||
        node instanceof AST_Class
  )
}

function opt_AST_Lambda (self, compressor) {
  tighten_body(self.body, compressor)
  if (compressor.option('side_effects') &&
        self.body.length == 1 &&
        self.body[0] === compressor.has_directive('use strict')) {
    self.body.length = 0
  }
  return self
}

function if_break_in_loop (self, compressor) {
  var first = self.body instanceof AST_BlockStatement ? self.body.body[0] : self.body
  if (compressor.option('dead_code') && is_break(first)) {
    var body: any[] = []
    if (self.init instanceof AST_Statement) {
      body.push(self.init)
    } else if (self.init) {
      body.push(make_node('AST_SimpleStatement', self.init, {
        body: self.init
      }))
    }
    if (self.condition) {
      body.push(make_node('AST_SimpleStatement', self.condition, {
        body: self.condition
      }))
    }
    extract_declarations_from_unreachable_code(compressor, self.body, body)
    return make_node('AST_BlockStatement', self, {
      body: body
    })
  }
  if (first instanceof AST_If) {
    if (is_break(first.body)) { // TODO: check type
      if (self.condition) {
        self.condition = make_node('AST_Binary', self.condition, {
          left: self.condition,
          operator: '&&',
          right: first.condition.negate(compressor)
        })
      } else {
        self.condition = first.condition.negate(compressor)
      }
      drop_it(first.alternative)
    } else if (is_break(first.alternative)) {
      if (self.condition) {
        self.condition = make_node('AST_Binary', self.condition, {
          left: self.condition,
          operator: '&&',
          right: first.condition
        })
      } else {
        self.condition = first.condition
      }
      drop_it(first.body)
    }
  }
  return self

  function is_break (node: any | null) {
    return node instanceof AST_Break &&
            compressor.loopcontrol_target(node) === compressor.self()
  }

  function drop_it (rest) {
    rest = as_statement_array(rest)
    if (self.body instanceof AST_BlockStatement) {
      self.body = self.body.clone()
      self.body.body = rest.concat(self.body.body.slice(1))
      self.body = self.body.transform(compressor)
    } else {
      self.body = make_node('AST_BlockStatement', self.body, {
        body: rest
      }).transform(compressor)
    }
    self = if_break_in_loop(self, compressor)
  }
}

function is_object (node: any) {
  return node instanceof AST_Array ||
        node instanceof AST_Lambda ||
        node instanceof AST_Object ||
        node instanceof AST_Class
}

function within_array_or_object_literal (compressor) {
  var node; var level = 0
  while (node = compressor.parent(level++)) {
    if (node instanceof AST_Statement) return false
    if (node instanceof AST_Array ||
            node instanceof AST_ObjectKeyVal ||
            node instanceof AST_Object) {
      return true
    }
  }
  return false
}

function is_nullish (node: any) {
  let fixed
  return (
    node instanceof AST_Null ||
        is_undefined(node) ||
        (
          node instanceof AST_SymbolRef &&
            (fixed = node.definition?.().fixed) instanceof AST_Node &&
            is_nullish(fixed)
        )
  )
}

function is_nullish_check (check, check_subject, compressor) {
  if (check_subject.may_throw(compressor)) return false

  let nullish_side

  // foo == null
  if (
    check instanceof AST_Binary &&
        check.operator === '==' &&
        // which side is nullish?
        (
          (nullish_side = is_nullish(check.left) && check.left) ||
            (nullish_side = is_nullish(check.right) && check.right)
        ) &&
        // is the other side the same as the check_subject
        (
          nullish_side === check.left
            ? check.right
            : check.left
        ).equivalent_to(check_subject)
  ) {
    return true
  }

  // foo === null || foo === undefined
  if (check instanceof AST_Binary && check.operator === '||') {
    let null_cmp
    let undefined_cmp

    const find_comparison = cmp => {
      if (!(
        cmp instanceof AST_Binary &&
                (cmp.operator === '===' || cmp.operator === '==')
      )) {
        return false
      }

      let found = 0
      let defined_side

      if (cmp.left instanceof AST_Null) {
        found++
        null_cmp = cmp
        defined_side = cmp.right
      }
      if (cmp.right instanceof AST_Null) {
        found++
        null_cmp = cmp
        defined_side = cmp.left
      }
      if (is_undefined(cmp.left)) {
        found++
        undefined_cmp = cmp
        defined_side = cmp.right
      }
      if (is_undefined(cmp.right)) {
        found++
        undefined_cmp = cmp
        defined_side = cmp.left
      }

      if (found !== 1) {
        return false
      }

      if (!defined_side.equivalent_to(check_subject)) {
        return false
      }

      return true
    }

    if (!find_comparison(check.left)) return false
    if (!find_comparison(check.right)) return false

    if (null_cmp && undefined_cmp && null_cmp !== undefined_cmp) {
      return true
    }
  }

  return false
}

// TODO this only works with AST_Defun, shouldn't it work for other ways of defining functions?
export function retain_top_func (fn, compressor) {
  return compressor.top_retain &&
        fn instanceof AST_Defun &&
        has_flag(fn, TOP) &&
        fn.name &&
        compressor.top_retain(fn.name)
}

export function find_scope (tw) {
  for (let i = 0; ;i++) {
    const p = tw.parent(i)
    if (p instanceof AST_Toplevel) return p
    if (p instanceof AST_Lambda) return p
    if (p.block_scope) return p.block_scope
  }
}

function find_variable (compressor, name) {
  var scope; var i = 0
  while (scope = compressor.parent(i++)) {
    if (scope instanceof AST_Scope) break
    if (scope instanceof AST_Catch && scope.argname) {
      scope = scope.argname.definition?.().scope
      break
    }
  }
  return scope.find_variable(name)
}

export function scope_encloses_variables_in_this_scope (scope, pulled_scope) {
  for (const enclosed of pulled_scope.enclosed) {
    if (pulled_scope.variables.has(enclosed.name)) {
      continue
    }
    const looked_up = scope.find_variable(enclosed.name)
    if (looked_up) {
      if (looked_up === enclosed) continue
      return true
    }
  }
  return false
}

function is_atomic (lhs, self) {
  return lhs instanceof AST_SymbolRef || lhs.TYPE === self.TYPE
}

export function is_reachable (self, defs) {
  const find_ref = (node: any) => {
    if (node instanceof AST_SymbolRef && member(node.definition?.(), defs)) {
      return walk_abort
    }
  }

  return walk_parent(self, (node, info) => {
    if (node instanceof AST_Scope && node !== self) {
      var parent = info.parent()
      if (parent instanceof AST_Call && parent.expression === node) return
      if (walk(node, find_ref)) {
        return walk_abort
      }
      return true
    }
  })
}

export function print (this: any, output: any, force_parens?: boolean) {
  var self = this; var generator = self._codegen
  if (self instanceof AST_Scope) {
    output.active_scope = self
  } else if (!output.use_asm && self instanceof AST_Directive && self.value == 'use asm') {
    output.use_asm = output.active_scope
  }
  function doit () {
    output.prepend_comments(self)
    self.add_source_map(output)
    generator(self, output)
    output.append_comments(self)
  }
  output.push_node(self)
  if (force_parens || self.needs_parens(output)) {
    output.with_parens(doit)
  } else {
    doit()
  }
  output.pop_node()
  if (self === output.use_asm) {
    output.use_asm = null
  }

  if (printMangleOptions) {
    if (this instanceof AST_Symbol && !this.unmangleable(printMangleOptions)) {
      base54.consider(this.name, -1)
    } else if (printMangleOptions.properties) {
      if (this instanceof AST_Dot) {
        base54.consider(this.property as string, -1)
      } else if (this instanceof AST_Sub) {
        skip_string(this.property)
      }
    }
  }
}
