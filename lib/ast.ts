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
  sort_regexp_flags,
  return_true,
  return_this,
  remove,
  map_add,
  has_annotation,
  warn,
  keep_name
} from './utils/index'

import { parse, js_error, is_basic_identifier_string, is_identifier_string, PRECEDENCE, RESERVED_WORDS } from './parse'
import { OutputStream } from './output'

import { base54, function_defs, SymbolDef, setFunctionDefs } from './scope'

import {
  UNUSED,
  TRUTHY,
  FALSY,
  UNDEFINED,
  INLINED,
  WRITE_ONLY,
  SQUEEZED,
  OPTIMIZED,
  TOP,
  CLEAR_BETWEEN_PASSES,
  native_fns,
  has_flag,
  static_fns,
  global_names,
  global_pure_fns,
  unary_side_effects,
  set_flag,
  unaryPrefix,
  clear_flag
} from './constants'

import { equivalent_to } from './equivalent-to'

let unmangleable_names: Set<any> | null = null

// return true if the node at the top of the stack (that means the
// innermost node in the current output) is lexically the first in
// a statement.
export function first_in_statement (stack: any) {
  let node = stack.parent(-1)
  for (let i = 0, p; p = stack.parent(i); i++) {
    if (p instanceof AST_Statement && p.body === node) { return true }
    if ((p instanceof AST_Sequence && p.expressions[0] === node) ||
            (p.TYPE === 'Call' && p.expression === node) ||
            (p instanceof AST_PrefixedTemplateString && p.prefix === node) ||
            (p instanceof AST_Dot && p.expression === node) ||
            (p instanceof AST_Sub && p.expression === node) ||
            (p instanceof AST_Conditional && p.condition === node) ||
            (p instanceof AST_Binary && p.left === node) ||
            (p instanceof AST_UnaryPostfix && p.expression === node)
    ) {
      node = p
    } else {
      return false
    }
  }
  return undefined
}

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

/* #__INLINE__ */
const key_size = key =>
  typeof key === 'string' ? key.length : 0

/* #__INLINE__ */
const lambda_modifiers = func =>
  (func.is_generator ? 1 : 0) + (func.async ? 6 : 0)

/* #__INLINE__ */
const static_size = is_static => is_static ? 7 : 0

const list_overhead = (array) => array.length && array.length - 1

/* #__INLINE__ */
const def_size = (size, def) => size + list_overhead(def.definitions)

const pass_through = () => true

var TO_MOZ_STACK: Array<any | null> | null = null

function to_moz (node: any | null) {
  if (TO_MOZ_STACK === null) { TO_MOZ_STACK = [] }
  TO_MOZ_STACK.push(node)
  var ast = node != null ? node.to_mozilla_ast(TO_MOZ_STACK[TO_MOZ_STACK.length - 2]) : null
  TO_MOZ_STACK.pop()
  if (TO_MOZ_STACK.length === 0) { TO_MOZ_STACK = null }
  return ast
}

function to_moz_in_destructuring () {
  var i = TO_MOZ_STACK?.length
  while (i--) {
    if (TO_MOZ_STACK?.[i] instanceof AST_Destructuring) {
      return true
    }
  }
  return false
}

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

// Creates a shallow compare function
const mkshallow = (props) => {
  const comparisons = Object
    .keys(props)
    .map(key => {
      if (props[key] === 'eq') {
        return `this.${key} === other.${key}`
      } else if (props[key] === 'exist') {
        return `(this.${key} == null ? other.${key} == null : this.${key} === other.${key})`
      } else {
        throw new Error(`mkshallow: Unexpected instruction: ${props[key]}`)
      }
    })
    .join(' && ')

  return new Function('other', 'return ' + comparisons)
}

const get_transformer = descend => {
  return function (this: any, tw: any, in_list: boolean) {
    let transformed: any | undefined
    tw.push(this)
    if (tw.before) transformed = tw.before(this, descend, in_list)
    if (transformed === undefined) {
      transformed = this
      descend(transformed, tw)
      if (tw.after) {
        const after_ret = tw.after(transformed, in_list)
        if (after_ret !== undefined) transformed = after_ret
      }
    }
    tw.pop()
    return transformed
  }
}

function DEFNODE (type: string, strProps: string | null, methods: AnyObject, staticMethods: AnyObject, base: any | null) {
  const self_props = strProps ? strProps.split(/\s+/) : []
  const name = `AST_${type}`
  const factory = () => {
    const proto = base && Object.create(base.prototype)
    const BasicClass = base || class {}
    const obj = {
      [name]: class extends BasicClass {
        static _SUBCLASSES: any
        initialize: any

        CTOR = this.constructor
        flags = 0
        TYPE = type || undefined

        static get SELF_PROPS () { return self_props }
        static get SUBCLASSES () {
          if (!this._SUBCLASSES) {
            this._SUBCLASSES = []
          }
          return this._SUBCLASSES
        }

        static get PROPS () { return obj[name].SELF_PROPS.concat((BasicClass).PROPS || []) }
        static get BASE () { return proto ? base : undefined }
        static get TYPE () { return type || undefined }

        static DEFMETHOD (name: string, method: Function) {
          this.prototype[name] = method
        }

        constructor (args) {
          super(args)
          if (args) {
            obj[name].SELF_PROPS.forEach(item => this[item] = args[item])
          }
                    this.initialize?.()
        }
      }
    }
    return obj[name]
  }
  var Node: any = factory()
  if (base) base.SUBCLASSES.push(Node)
  if (methods) {
    for (const i in methods) {
      if (HOP(methods, i)) {
        Node.prototype[i] = methods[i]
      }
    }
  }
  if (staticMethods) {
    for (const i in staticMethods) {
      if (HOP(staticMethods, i)) {
        Node[i] = staticMethods[i]
      }
    }
  }
  return Node
}

class AST_Token {
  static _SUBCLASSES: any
  initialize: any
  static get SELF_PROPS () {
    return [
      'type',
      'value',
      'line',
      'col',
      'pos',
      'endline',
      'endcol',
      'endpos',
      'nlb',
      'comments_before',
      'comments_after',
      'file',
      'raw',
      'quote',
      'end'
    ]
  }

  static get SUBCLASSES () {
    if (!this._SUBCLASSES) {
      this._SUBCLASSES = []
    }
    return this._SUBCLASSES
  }

  static get PROPS () {
    return AST_Token.SELF_PROPS
  }

  static get BASE () {
    return undefined
  }

  static get TYPE () {
    return 'Token'
  }

  static DEFMETHOD (name: string, method: Function) {
    this.prototype[name] = method
  }

  constructor (args: any = {}) {
    if (args) {
      AST_Token.SELF_PROPS.map((item) => (this[item] = args[item]))
    }
      this.initialize?.()
  }
}

var AST_Node: any = DEFNODE('Node', 'start end', {
  is_block_scope: return_false,
  _clone: function (deep: boolean) {
    if (deep) {
      var self = this.clone()
      return self.transform(new TreeTransformer(function (node: any) {
        if (node !== self) {
          return node.clone(true)
        }
      }))
    }
    return new this.CTOR(this)
  },
  clone: function (deep: boolean) {
    return this._clone(deep)
  },
  _walk: function (visitor: any) {
    return visitor._visit(this)
  },
  walk: function (visitor: any) {
    return this._walk(visitor) // not sure the indirection will be any help
  },
  _children_backwards: () => {},
  _size: () => 0,
  size: function (compressor, stack) {
    // mangle_options = (default_options as any).mangle;

    let size = 0
    walk_parent(this, (node, info) => {
      size += node._size(info)
    }, stack || (compressor && compressor.stack))

    // just to save a bit of memory
    // mangle_options = undefined;

    return size
  },
  transform: get_transformer(noop),
  shallow_cmp: function () {
    throw new Error('did not find a shallow_cmp function for ' + this.constructor.name)
  },
  print: print,
  _print: print,
  print_to_string: function (options: any) {
    var output = OutputStream(options)
    this.print(output)
    return output.get()
  },
  needs_parens: return_false,
  optimize: function (compressor: any) {
    if (!this._optimize) {
      throw new Error('optimize not defined')
    }
    var self = this
    if (has_flag(self, OPTIMIZED)) return self
    if (compressor.has_directive('use asm')) return self
    var opt = this._optimize(self, compressor)
    set_flag(opt, OPTIMIZED)
    return opt
  },
  to_mozilla_ast: function (parent) {
    if (!this._to_mozilla_ast) {
      throw new Error('to_mozilla_ast not defined')
    }
    return set_moz_loc(this, this._to_mozilla_ast(this, parent))
  },
  add_source_map: noop,
  tail_node: return_this
}, {
  documentation: 'Base class of all AST nodes',
  propdoc: {
    start: '[AST_Token] The first token of this node',
    end: '[AST_Token] The last token of this node'
  },
  warn_function: null,
  warn: function (txt, props) {
    if (AST_Node.warn_function) { AST_Node.warn_function(string_template(txt, props)) }
  },
  from_mozilla_ast: function (node: any) {
    var save_stack = FROM_MOZ_STACK
    FROM_MOZ_STACK = []
    var ast = from_moz(node)
    FROM_MOZ_STACK = save_stack
    return ast
  }
}, null)

/* -----[ statements ]----- */

var AST_Statement: any = DEFNODE('Statement', null, {
  _codegen: function (self, output) {
    (self.body).print(output)
    output.semicolon()
  }
}, {
  documentation: 'Base class of all statements'
}, AST_Node)

var AST_Debugger: any = DEFNODE('Debugger', null, {
  shallow_cmp: pass_through,
  _size: () => 8,
  _to_mozilla_ast: () => ({ type: 'DebuggerStatement' }),
  _codegen: function (_self, output) {
    output.print('debugger')
    output.semicolon()
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Represents a debugger statement'
}, AST_Statement)

var AST_Directive: any = DEFNODE('Directive', 'value quote', {
  shallow_cmp: mkshallow({ value: 'eq' }),
  _size: function (): number {
    // TODO string encoding stuff
    return 2 + this.value.length
  },
  _to_mozilla_ast: function To_Moz_Directive (M) {
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: M.value,
        raw: M.print_to_string()
      },
      directive: M.value
    }
  },
  _codegen: function (self, output) {
    output.print_string(self.value, self.quote)
    output.semicolon()
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Represents a directive, like "use strict";',
  propdoc: {
    value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
    quote: '[string] the original quote character'
  }
}, AST_Statement)

var AST_SimpleStatement: any = DEFNODE('SimpleStatement', 'body', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_ExpressionStatement (M) {
    return {
      type: 'ExpressionStatement',
      expression: to_moz(M.body) // TODO: check type
    }
  },
  _codegen: function (self, output) {
    (self.body).print(output)
    output.semicolon()
  }
}, {
  documentation: 'A statement consisting of an expression, i.e. a = 1 + 2',
  propdoc: {
    body: '[AST_Node] an expression node (should not be instanceof AST_Statement)'
  }
}, AST_Statement)

function walk_body (node: any, visitor: any) {
  const body = node.body
  for (var i = 0, len = body.length; i < len; i++) {
    body[i]._walk(visitor)
  }
}

function clone_block_scope (deep: boolean) {
  var clone = this._clone(deep)
  if (this.block_scope) {
    // TODO this is sometimes undefined during compression.
    // But it should always have a value!
    clone.block_scope = this.block_scope.clone()
  }
  return clone
}

var AST_Block: any = DEFNODE('Block', 'body block_scope', {
  is_block_scope: return_true,
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      walk_body(this, visitor)
    })
  },
  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
  },
  clone: clone_block_scope,
  _size: function () {
    return 2 + list_overhead(this.body)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.body = do_list(self.body, tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'BlockStatement',
    body: M.body.map(to_moz)
  })
}, {
  documentation: 'A body of statements (usually braced)',
  propdoc: {
    body: '[AST_Statement*] an array of statements',
    block_scope: '[AST_Scope] the block scope'
  }
}, AST_Statement)

var AST_BlockStatement: any = DEFNODE('BlockStatement', null, {
  _to_mozilla_ast: M => ({
    type: 'BlockStatement',
    body: M.body.map(to_moz)
  }),
  _codegen: function (self, output) {
    print_braced(self, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A block statement'
}, AST_Block)

var AST_EmptyStatement: any = DEFNODE('EmptyStatement', null, {
  shallow_cmp: pass_through,
  _to_mozilla_ast: () => ({ type: 'EmptyStatement' }),
  _size: () => 1,
  _codegen: function (_self, output) {
    output.semicolon()
  }
}, {
  documentation: 'The empty statement (empty block or simply a semicolon)'
}, AST_Statement)

var AST_StatementWithBody: any = DEFNODE('StatementWithBody', 'body', {
  _do_print_body: function (output: any) {
    force_statement(this.body, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`',
  propdoc: {
    body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
  }
}, AST_Statement)

var AST_LabeledStatement: any = DEFNODE('LabeledStatement', 'label', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.label._walk(visitor)
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
    push(this.label)
  },
  clone: function (deep: boolean) {
    var node = this._clone(deep)
    if (deep) {
      var label = node.label
      var def = this.label
      node.walk(new TreeWalker(function (node: any) {
        if (node instanceof AST_LoopControl &&
                    node.label && node.label.thedef === def) {
          node.label.thedef = label
          label.references.push(node)
        }
      }))
    }
    return node
  },
  _size: () => 2,
  shallow_cmp: mkshallow({ 'label.name': 'eq' }),
  transform: get_transformer(function (self, tw: any) {
    self.label = self.label.transform(tw)
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'LabeledStatement',
    label: to_moz(M.label),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
    self.label.print(output)
    output.colon();
    (self.body).print(output)
  },
  add_source_map: noop
}, {
  documentation: 'Statement with a label',
  propdoc: {
    label: '[AST_Label] a label definition'
  }
}, AST_StatementWithBody)

var AST_IterationStatement: any = DEFNODE('IterationStatement', 'block_scope', {
  is_block_scope: return_true,
  clone: clone_block_scope
}, {
  documentation: 'Internal class.  All loops inherit from it.',
  propdoc: {
    block_scope: '[AST_Scope] the block scope for this iteration statement.'
  }
}, AST_StatementWithBody)

var AST_DWLoop: any = DEFNODE('DWLoop', 'condition', {}, {
  documentation: 'Base class for do/while statements',
  propdoc: {
    condition: '[AST_Node] the loop condition.  Should not be instanceof AST_Statement'
  }
}, AST_IterationStatement)

var AST_Do: any = DEFNODE('Do', null, {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.body._walk(visitor)
      this.condition._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.condition)
    push(this.body)
  },
  _size: () => 9,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.body = (self.body).transform(tw)
    self.condition = self.condition.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'DoWhileStatement',
    test: to_moz(M.condition),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
    output.print('do')
    output.space()
    make_block(self.body, output)
    output.space()
    output.print('while')
    output.space()
    output.with_parens(function () {
      self.condition.print(output)
    })
    output.semicolon()
  }
}, {
  documentation: 'A `do` statement'
}, AST_DWLoop)

var AST_While: any = DEFNODE('While', null, {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
    push(this.condition)
  },
  _size: () => 7,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.condition = self.condition.transform(tw)
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'WhileStatement',
    test: to_moz(M.condition),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
    output.print('while')
    output.space()
    output.with_parens(function () {
      self.condition.print(output)
    })
    output.space()
    self._do_print_body(output)
  }
}, {
  documentation: 'A `while` statement'
}, AST_DWLoop)

var AST_For: any = DEFNODE('For', 'init condition step', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.init) this.init._walk(visitor)
      if (this.condition) this.condition._walk(visitor)
      if (this.step) this.step._walk(visitor)
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
    if (this.step) push(this.step)
    if (this.condition) push(this.condition)
    if (this.init) push(this.init)
  },
  _size: () => 8,
  shallow_cmp: mkshallow({
    init: 'exist',
    condition: 'exist',
    step: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.init) self.init = self.init.transform(tw)
    if (self.condition) self.condition = self.condition.transform(tw)
    if (self.step) self.step = self.step.transform(tw)
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'ForStatement',
    init: to_moz(M.init),
    test: to_moz(M.condition),
    update: to_moz(M.step),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'A `for` statement',
  propdoc: {
    init: '[AST_Node?] the `for` initialization code, or null if empty',
    condition: '[AST_Node?] the `for` termination clause, or null if empty',
    step: '[AST_Node?] the `for` update clause, or null if empty'
  }
}, AST_IterationStatement)

var AST_ForIn: any = DEFNODE('ForIn', 'init object', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.init._walk(visitor)
      this.object._walk(visitor)
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
    if (this.object) push(this.object)
    if (this.init) push(this.init)
  },
  _size: () => 8,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.init = self.init?.transform(tw) || null
    self.object = self.object.transform(tw)
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'ForInStatement',
    left: to_moz(M.init),
    right: to_moz(M.object),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'A `for ... in` statement',
  propdoc: {
    init: '[AST_Node] the `for/in` initialization code',
    object: "[AST_Node] the object that we're looping through"
  }
}, AST_IterationStatement)

var AST_ForOf: any = DEFNODE('ForOf', 'await', {
  shallow_cmp: pass_through,
  _to_mozilla_ast: M => ({
    type: 'ForOfStatement',
    left: to_moz(M.init),
    right: to_moz(M.object),
    body: to_moz(M.body),
    await: M.await
  })
}, {
  documentation: 'A `for ... of` statement'
}, AST_ForIn)

var AST_With: any = DEFNODE('With', 'expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      this.body._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.body)
    push(this.expression)
  },
  _size: () => 6,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.body = (self.body).transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'WithStatement',
    object: to_moz(M.expression),
    body: to_moz(M.body)
  }),
  _codegen: function (self, output) {
    output.print('with')
    output.space()
    output.with_parens(function () {
      self.expression.print(output)
    })
    output.space()
    self._do_print_body(output)
  }

}, {
  documentation: 'A `with` statement',
  propdoc: {
    expression: '[AST_Node] the `with` expression'
  }
}, AST_StatementWithBody)

/* -----[ scope and functions ]----- */

var AST_Scope: any = DEFNODE('Scope', 'variables functions uses_with uses_eval parent_scope enclosed cname _var_name_cache', {
  init_scope_vars: function (parent_scope: any) {
    this.variables = new Map() // map name to AST_SymbolVar (variables defined in this scope; includes functions)
    this.functions = new Map() // map name to AST_SymbolDefun (functions defined in this scope)
    this.uses_with = false // will be set to true if this or some nested scope uses the `with` statement
    this.uses_eval = false // will be set to true if this or nested scope uses the global `eval`
    this.parent_scope = parent_scope // the parent scope
    this.enclosed = [] // a list of variables from this or outer scope(s) that are referenced from this or inner scopes
    this.cname = -1 // the current index for mangling functions/variables
    this._var_name_cache = null
  },
  var_names: function varNames (this: any): Set<string> | null {
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
  },

  add_var_name: function (name: string) {
    // TODO change enclosed too
    if (!this._added_var_names) {
      // TODO stop adding var names entirely
      this._added_var_names = new Set()
    }
    this._added_var_names.add(name)
    if (!this._var_name_cache) this.var_names() // regen cache
    this._var_name_cache.add(name)
  },

  // TODO create function that asks if we can inline
  add_child_scope: function (scope: any) {
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
  },
  is_block_scope: function () {
    return this._block_scope || false
  },
  find_variable: function (name: any | string) {
    if (name instanceof AST_Symbol) name = name.name
    return this.variables.get(name) ||
          (this.parent_scope && this.parent_scope.find_variable(name))
  },
  def_function: function (this: any, symbol: any, init: boolean) {
    var def = this.def_variable(symbol, init)
    if (!def.init || def.init instanceof AST_Defun) def.init = init
    this.functions.set(symbol.name, def)
    return def
  },
  def_variable: function (symbol: any, init: boolean) {
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
  },
  next_mangled: function (options: any) {
    return next_mangled(this, options)
  },
  get_defun_scope: function () {
    var self = this
    while (self.is_block_scope()) {
      self = self.parent_scope
    }
    return self
  },
  clone: function (deep: boolean) {
    var node = this._clone(deep)
    if (this.variables) node.variables = new Map(this.variables)
    if (this.functions) node.functions = new Map(this.functions)
    if (this.enclosed) node.enclosed = this.enclosed.slice()
    if (this._block_scope) node._block_scope = this._block_scope
    return node
  },
  pinned: function () {
    return this.uses_eval || this.uses_with
  },
  figure_out_scope: function (options: any, { parent_scope = null, toplevel = this } = {}) {
    options = defaults(options, {
      cache: null,
      ie8: false,
      safari10: false
    })

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
}, {
  documentation: 'Base class for all statements introducing a lexical scope',
  propdoc: {
    variables: '[Map/S] a map of name -> SymbolDef for all variables/functions defined in this scope',
    functions: '[Map/S] like `variables`, but only lists function declarations',
    uses_with: '[boolean/S] tells whether this scope uses the `with` statement',
    uses_eval: '[boolean/S] tells whether this scope contains a direct call to the global `eval`',
    parent_scope: '[AST_Scope?/S] link to the parent scope',
    enclosed: '[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes',
    cname: '[integer/S] current index for mangling variables (used internally by the mangler)'
  }
}, AST_Block)

var AST_Toplevel: any = DEFNODE('Toplevel', 'globals', {
  def_global: function (node: any) {
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
  },
  is_block_scope: return_false,
  next_mangled: function (options: any) {
    let name
    const mangled_names = this.mangled_names
    do {
      name = next_mangled(this, options)
    } while (mangled_names.has(name))
    return name
  },
  _default_mangler_options: function (options: any) {
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
  },
  wrap_commonjs: function (name: string) {
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
  },
  wrap_enclose: function (args_values: string) {
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
  },
  shallow_cmp: pass_through,
  _size: function () {
    return list_overhead(this.body)
  },
  _to_mozilla_ast: function To_Moz_Program (M) {
    return to_moz_scope('Program', M)
  },
  _codegen: function (self, output) {
    display_body(self.body as any[], true, output, true)
    output.print('')
  },
  add_source_map: noop,
  compute_char_frequency: function (options: any) {
    options = this._default_mangler_options(options)
    try {
      AST_Node.prototype.print = function (this: any, stream: any, force_parens: boolean) {
        this._print(stream, force_parens)
        if (this instanceof AST_Symbol && !this.unmangleable(options)) {
          base54.consider(this.name, -1)
        } else if (options.properties) {
          if (this instanceof AST_Dot) {
            base54.consider(this.property as string, -1)
          } else if (this instanceof AST_Sub) {
            skip_string(this.property)
          }
        }
      }
      base54.consider(this.print_to_string(), 1)
    } finally {
      AST_Node.prototype.print = AST_Node.prototype._print
    }
    base54.sort()

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
  },
  expand_names: function (options: any) {
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
  },
  find_colliding_names: function (options: any) {
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
  },
  mangle_names: function (options: any) {
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
}, {
  documentation: 'The toplevel scope',
  propdoc: {
    globals: '[Map/S] a map of name -> SymbolDef for all undeclared names'
  }
}, AST_Scope)

var AST_Expansion: any = DEFNODE('Expansion', 'expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression.walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.expression)
  },
  _size: () => 3,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_Spread (M) {
    return {
      type: to_moz_in_destructuring() ? 'RestElement' : 'SpreadElement',
      argument: to_moz(M.expression)
    }
  },
  _codegen: function (self, output) {
    output.print('...')
    self.expression.print(output)
  }
}, {
  documentation: 'An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list',
  propdoc: {
    expression: '[AST_Node] the thing to be expanded'
  }
}, AST_Node)

var AST_Lambda: any = DEFNODE('Lambda', 'name argnames uses_arguments is_generator async', {
  is_block_scope: return_false,
  init_scope_vars: function () {
      AST_Scope.prototype.init_scope_vars?.apply(this, arguments)
      this.uses_arguments = false
      this.def_variable(new AST_SymbolFunarg({
        name: 'arguments',
        start: this.start,
        end: this.end
      }))
  },
  args_as_names: function () {
    var out: any[] = []
    for (var i = 0; i < this.argnames.length; i++) {
      if (this.argnames[i] instanceof AST_Destructuring) {
        out.push(...this.argnames[i].all_symbols())
      } else {
        out.push(this.argnames[i])
      }
    }
    return out
  },
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.name) this.name._walk(visitor)
      var argnames = this.argnames
      for (var i = 0, len = argnames.length; i < len; i++) {
        argnames[i]._walk(visitor)
      }
      walk_body(this, visitor)
    })
  },
  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])

    i = this.argnames.length
    while (i--) push(this.argnames[i])

    if (this.name) push(this.name)
  },
  shallow_cmp: mkshallow({
    is_generator: 'eq',
    async: 'eq'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.name) self.name = self.name.transform(tw)
    self.argnames = do_list(self.argnames, tw)
    if (self.body instanceof AST_Node) {
      self.body = (self.body).transform(tw)
    } else {
      self.body = do_list(self.body, tw)
    }
  }),
  _to_mozilla_ast: To_Moz_FunctionExpression,
  _do_print: function (this: any, output: any, nokeyword: boolean) {
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
  },
  _codegen: function (self, output) {
    self._do_print(output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Base class for functions',
  propdoc: {
    name: '[AST_SymbolDeclaration?] the name of this function',
    argnames: '[AST_SymbolFunarg|AST_Destructuring|AST_Expansion|AST_DefaultAssign*] array of function arguments, destructurings, or expanding arguments',
    uses_arguments: '[boolean/S] tells whether this function accesses the arguments array',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }
}, AST_Scope)

var AST_Accessor: any = DEFNODE('Accessor', null, {
  _size: function () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body)
  }
}, {
  documentation: 'A setter/getter function.  The `name` property is always null.'
}, AST_Lambda)

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

var AST_Function: any = DEFNODE('Function', null, {
  next_mangled: function (options: any, def: any) {
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
  },
  _size: function (info) {
    const first: any = !!first_in_statement(info)
    return (first * 2) + lambda_modifiers(this) + 12 + list_overhead(this.argnames) + list_overhead(this.body)
  },
  _to_mozilla_ast: To_Moz_FunctionExpression,
  // a function expression needs parens around it when it's provably
  // the first token to appear in a statement.
  needs_parens: function (output: any) {
    if (!output.has_parens() && first_in_statement(output)) {
      return true
    }

    if (output.option('webkit')) {
      var p = output.parent()
      if (p instanceof AST_PropAccess && p.expression === this) {
        return true
      }
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
}, {
  documentation: 'A function expression'
}, AST_Lambda)

var AST_Arrow: any = DEFNODE('Arrow', null, {
  init_scope_vars: function () {
      AST_Scope.prototype.init_scope_vars?.apply(this, arguments)
      this.uses_arguments = false
  },
  _size: function (): number {
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
  },
  _to_mozilla_ast: function To_Moz_ArrowFunctionExpression (M) {
    var body = {
      type: 'BlockStatement',
      body: M.body.map(to_moz)
    }
    return {
      type: 'ArrowFunctionExpression',
      params: M.argnames.map(to_moz),
      async: M.async,
      body: body
    }
  },
  needs_parens: function (output: any) {
    var p = output.parent()
    return p instanceof AST_PropAccess && p.expression === this
  },
  _do_print: function (this: any, output: any) {
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
}, {
  documentation: 'An ES6 Arrow function ((a) => b)'
}, AST_Lambda)

var AST_Defun: any = DEFNODE('Defun', null, {
  _size: function () {
    return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body)
  },
  _to_mozilla_ast: function To_Moz_FunctionDeclaration (M) {
    return {
      type: 'FunctionDeclaration',
      id: to_moz(M.name),
      params: M.argnames.map(to_moz),
      generator: M.is_generator,
      async: M.async,
      body: to_moz_scope('BlockStatement', M)
    }
  }
}, {
  documentation: 'A function definition'
}, AST_Lambda)

/* -----[ DESTRUCTURING ]----- */
var AST_Destructuring: any = DEFNODE('Destructuring', 'names is_array', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.names.forEach(function (name: any) {
        name._walk(visitor)
      })
    })
  },
  _children_backwards (push: Function) {
    let i = this.names.length
    while (i--) push(this.names[i])
  },
  all_symbols: function () {
    var out: any[] = []
    this.walk(new TreeWalker(function (node: any) {
      if (node instanceof AST_Symbol) {
        out.push(node)
      }
    }))
    return out
  },
  _size: () => 2,
  shallow_cmp: mkshallow({
    is_array: 'eq'
  }),
  transform: get_transformer(function (self, tw: any) {
    self.names = do_list(self.names, tw)
  }),
  _to_mozilla_ast: function To_Moz_ObjectPattern (M) {
    if (M.is_array) {
      return {
        type: 'ArrayPattern',
        elements: M.names.map(to_moz)
      }
    }
    return {
      type: 'ObjectPattern',
      properties: M.names.map(to_moz)
    }
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'A destructuring of several names. Used in destructuring assignment and with destructuring function argument names',
  propdoc: {
    names: '[AST_Node*] Array of properties or elements',
    is_array: '[Boolean] Whether the destructuring represents an object or array'
  }
}, AST_Node)

var AST_PrefixedTemplateString: any = DEFNODE('PrefixedTemplateString', 'template_string prefix', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.prefix._walk(visitor)
      this.template_string._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.template_string)
    push(this.prefix)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.prefix = self.prefix.transform(tw)
    self.template_string = self.template_string.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_TaggedTemplateExpression (M) {
    return {
      type: 'TaggedTemplateExpression',
      tag: to_moz(M.prefix),
      quasi: to_moz(M.template_string)
    }
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'A templatestring with a prefix, such as String.raw`foobarbaz`',
  propdoc: {
    template_string: '[AST_TemplateString] The template string',
    prefix: '[AST_SymbolRef|AST_PropAccess] The prefix, which can be a symbol such as `foo` or a dotted expression such as `String.raw`.'
  }
}, AST_Node)

var AST_TemplateString: any = DEFNODE('TemplateString', 'segments', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function (this: any) {
      this.segments.forEach(function (seg) {
        seg._walk(visitor)
      })
    })
  },
  _children_backwards (push: Function) {
    let i = this.segments.length
    while (i--) push(this.segments[i])
  },
  _size: function (): number {
    return 2 + (Math.floor(this.segments.length / 2) * 3) /* "${}" */
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.segments = do_list(self.segments, tw)
  }),
  _to_mozilla_ast: function To_Moz_TemplateLiteral (M) {
    var quasis: any[] = []
    var expressions: any[] = []
    for (var i = 0; i < M.segments.length; i++) {
      if (i % 2 !== 0) {
        expressions.push(to_moz(M.segments[i]))
      } else {
        quasis.push({
          type: 'TemplateElement',
          value: {
            raw: M.segments[i].raw,
            cooked: M.segments[i].value
          },
          tail: i === M.segments.length - 1
        })
      }
    }
    return {
      type: 'TemplateLiteral',
      quasis: quasis,
      expressions: expressions
    }
  },
  _codegen: function (self, output) {
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
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A template string literal',
  propdoc: {
    segments: '[AST_Node*] One or more segments, starting with AST_TemplateSegment. AST_Node may follow AST_TemplateSegment, but each AST_Node must be followed by AST_TemplateSegment.'
  }

}, AST_Node)

var AST_TemplateSegment: any = DEFNODE('TemplateSegment', 'value raw', {
  shallow_cmp: mkshallow({
    value: 'eq'
  }),
  _size: function (): number {
    return this.value.length
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A segment of a template string literal',
  propdoc: {
    value: 'Content of the segment',
    raw: 'Raw content of the segment'
  }
}, AST_Node)

/* -----[ JUMPS ]----- */

var AST_Jump: any = DEFNODE('Jump', null, {
  shallow_cmp: pass_through,
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: "Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"
}, AST_Statement)

var AST_Exit: any = DEFNODE('Exit', 'value', {
  _walk: function (visitor: any) {
    return visitor._visit(this, this.value && function () {
      this.value._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.value) push(this.value)
  },
  transform: get_transformer(function (self, tw: any) {
    if (self.value) self.value = self.value.transform(tw)
  }),
  _do_print: function (output: any, kind: string) {
    output.print(kind)
    if (this.value) {
      output.space()
      const comments = this.value.start.comments_before
      if (comments && comments.length && !output.printed_comments.has(comments)) {
        output.print('(')
        this.value.print(output)
        output.print(')')
      } else {
        this.value.print(output)
      }
    }
    output.semicolon()
  }
}, {
  documentation: 'Base class for “exits” (`return` and `throw`)',
  propdoc: {
    value: '[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return'
  }

}, AST_Jump)

var AST_Return: any = DEFNODE('Return', null, {
  _size: function () {
    return this.value ? 7 : 6
  },
  _to_mozilla_ast: M => ({
    type: 'ReturnStatement',
    argument: to_moz(M.value)
  }),
  _codegen: function (self, output) {
    self._do_print(output, 'return')
  }
}, {
  documentation: 'A `return` statement'
}, AST_Exit)

var AST_Throw: any = DEFNODE('Throw', null, {
  _size: () => 6,
  _to_mozilla_ast: M => ({
    type: 'ThrowStatement',
    argument: to_moz(M.value)
  }),
  _codegen: function (self, output) {
    self._do_print(output, 'throw')
  }
}, {
  documentation: 'A `throw` statement'
}, AST_Exit)

var AST_LoopControl: any = DEFNODE('LoopControl', 'label', {
  _walk: function (visitor: any) {
    return visitor._visit(this, this.label && function () {
      this.label._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.label) push(this.label)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    if (self.label) self.label = self.label.transform(tw)
  }),
  _do_print: function (output: any, kind: string) {
    output.print(kind)
    if (this.label) {
      output.space()
      this.label.print(output)
    }
    output.semicolon()
  }
}, {
  documentation: 'Base class for loop control statements (`break` and `continue`)',
  propdoc: {
    label: '[AST_LabelRef?] the label, or null if none'
  }

}, AST_Jump)

var AST_Break: any = DEFNODE('Break', null, {
  _size: function () {
    return this.label ? 6 : 5
  },
  _to_mozilla_ast: M => ({
    type: 'BreakStatement',
    label: to_moz(M.label)
  }),
  _codegen: function (self, output) {
    self._do_print(output, 'break')
  }
}, {
  documentation: 'A `break` statement'
}, AST_LoopControl)

var AST_Continue: any = DEFNODE('Continue', null, {
  _size: function () {
    return this.label ? 9 : 8
  },
  _to_mozilla_ast: M => ({
    type: 'ContinueStatement',
    label: to_moz(M.label)
  }),
  _codegen: function (self, output) {
    self._do_print(output, 'continue')
  }
}, {
  documentation: 'A `continue` statement'
}, AST_LoopControl)

var AST_Await: any = DEFNODE('Await', 'expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.expression)
  },
  _size: () => 6,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'AwaitExpression',
    argument: to_moz(M.expression)
  }),
  needs_parens: function (output: any) {
    var p = output.parent()
    return p instanceof AST_PropAccess && p.expression === this ||
            p instanceof AST_Call && p.expression === this ||
            output.option('safari10') && p instanceof AST_UnaryPrefix
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'An `await` statement',
  propdoc: {
    expression: '[AST_Node] the mandatory expression being awaited'
  }

}, AST_Node)

var AST_Yield: any = DEFNODE('Yield', 'expression is_star', {
  _walk: function (visitor: any) {
    return visitor._visit(this, this.expression && function () {
      this.expression._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.expression) push(this.expression)
  },
  _size: () => 6,
  shallow_cmp: mkshallow({
    is_star: 'eq'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.expression) self.expression = self.expression.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'YieldExpression',
    argument: to_moz(M.expression),
    delegate: M.is_star
  }),
  needs_parens: function (output: any) {
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
    if (p instanceof AST_PropAccess && p.expression === this) { return true }
    return undefined
  },
  _codegen: function (self, output) {
    var star = self.is_star ? '*' : ''
    output.print('yield' + star)
    if (self.expression) {
      output.space()
      self.expression.print(output)
    }
  }
}, {
  documentation: 'A `yield` statement',
  propdoc: {
    expression: '[AST_Node?] the value returned or thrown by this statement; could be null (representing undefined) but only when is_star is set to false',
    is_star: '[Boolean] Whether this is a yield or yield* statement'
  }

}, AST_Node)

/* -----[ IF ]----- */

var AST_If: any = DEFNODE('If', 'condition alternative', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.body._walk(visitor)
      if (this.alternative) this.alternative._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.alternative) {
      push(this.alternative)
    }
    push(this.body)
    push(this.condition)
  },
  _size: () => 4,
  shallow_cmp: mkshallow({
    alternative: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    self.condition = self.condition.transform(tw)
    self.body = (self.body).transform(tw)
    if (self.alternative) self.alternative = self.alternative.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'IfStatement',
    test: to_moz(M.condition),
    consequent: to_moz(M.body),
    alternate: to_moz(M.alternative)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'A `if` statement',
  propdoc: {
    condition: '[AST_Node] the `if` condition',
    alternative: '[AST_Statement?] the `else` part, or null if not present'
  }

}, AST_StatementWithBody)

/* -----[ SWITCH ]----- */

var AST_Switch: any = DEFNODE('Switch', 'expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  },
  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  },
  _size: function (): number {
    return 8 + list_overhead(this.body)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'SwitchStatement',
    discriminant: to_moz(M.expression),
    cases: M.body.map(to_moz)
  }),
  _codegen: function (self, output) {
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
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A `switch` statement',
  propdoc: {
    expression: '[AST_Node] the `switch` “discriminant”'
  }

}, AST_Block)

var AST_SwitchBranch: any = DEFNODE('SwitchBranch', null, {
  is_block_scope: return_false,
  shallow_cmp: pass_through,
  _to_mozilla_ast: function To_Moz_SwitchCase (M) {
    return {
      type: 'SwitchCase',
      test: to_moz(M.expression),
      consequent: M.body.map(to_moz)
    }
  },
  _do_print_body: function (this: any, output: any) {
    output.newline()
    this.body.forEach(function (stmt) {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Base class for `switch` branches'
}, AST_Block)

var AST_Default: any = DEFNODE('Default', null, {
  _size: function (): number {
    return 8 + list_overhead(this.body)
  },
  _codegen: function (self, output) {
    output.print('default:')
    self._do_print_body(output)
  }
}, {
  documentation: 'A `default` switch branch'
}, AST_SwitchBranch)

var AST_Case: any = DEFNODE('Case', 'expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  },
  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  },
  _size: function (): number {
    return 5 + list_overhead(this.body)
  },
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }),
  _codegen: function (self, output) {
    output.print('case')
    output.space()
    self.expression.print(output)
    output.print(':')
    self._do_print_body(output)
  }
}, {
  documentation: 'A `case` switch branch',
  propdoc: {
    expression: '[AST_Node] the `case` expression'
  }

}, AST_SwitchBranch)

/* -----[ EXCEPTIONS ]----- */

var AST_Try: any = DEFNODE('Try', 'bcatch bfinally', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      walk_body(this, visitor)
      if (this.bcatch) this.bcatch._walk(visitor)
      if (this.bfinally) this.bfinally._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.bfinally) push(this.bfinally)
    if (this.bcatch) push(this.bcatch)
    let i = this.body.length
    while (i--) push(this.body[i])
  },
  _size: function (): number {
    return 3 + list_overhead(this.body)
  },
  shallow_cmp: mkshallow({
    bcatch: 'exist',
    bfinally: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    self.body = do_list(self.body, tw)
    if (self.bcatch) self.bcatch = self.bcatch.transform(tw)
    if (self.bfinally) self.bfinally = self.bfinally.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_TryStatement (M) {
    return {
      type: 'TryStatement',
      block: to_moz_block(M),
      handler: to_moz(M.bcatch),
      guardedHandlers: [],
      finalizer: to_moz(M.bfinally)
    }
  },
  _codegen: function (self, output) {
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
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A `try` statement',
  propdoc: {
    bcatch: '[AST_Catch?] the catch block, or null if not present',
    bfinally: '[AST_Finally?] the finally block, or null if not present'
  }

}, AST_Block)

var AST_Catch: any = DEFNODE('Catch', 'argname', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.argname) this.argname._walk(visitor)
      walk_body(this, visitor)
    })
  },
  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    if (this.argname) push(this.argname)
  },
  _size: function (): number {
    let size = 7 + list_overhead(this.body)
    if (this.argname) {
      size += 2
    }
    return size
  },
  shallow_cmp: mkshallow({
    argname: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.argname) self.argname = self.argname.transform(tw)
    self.body = do_list(self.body, tw)
  }),
  _to_mozilla_ast: function To_Moz_CatchClause (M) {
    return {
      type: 'CatchClause',
      param: to_moz(M.argname),
      guard: null,
      body: to_moz_block(M)
    }
  },
  _codegen: function (self, output) {
    output.print('catch')
    if (self.argname) {
      output.space()
      output.with_parens(function () {
        self.argname.print(output)
      })
    }
    output.space()
    print_braced(self, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A `catch` node; only makes sense as part of a `try` statement',
  propdoc: {
    argname: '[AST_SymbolCatch|AST_Destructuring|AST_Expansion|AST_DefaultAssign] symbol for the exception'
  }

}, AST_Block)

var AST_Finally: any = DEFNODE('Finally', null, {
  shallow_cmp: pass_through,
  _size: function (): number {
    return 7 + list_overhead(this.body)
  },
  _codegen: function (self, output) {
    output.print('finally')
    output.space()
    print_braced(self, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'A `finally` node; only makes sense as part of a `try` statement'
}, AST_Block)

/* -----[ VAR/CONST ]----- */

var AST_Definitions: any = DEFNODE('Definitions', 'definitions', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      var definitions = this.definitions
      for (var i = 0, len = definitions.length; i < len; i++) {
        definitions[i]._walk(visitor)
      }
    })
  },
  _children_backwards (push: Function) {
    let i = this.definitions.length
    while (i--) push(this.definitions[i])
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.definitions = do_list(self.definitions, tw)
  }),
  _to_mozilla_ast: function To_Moz_VariableDeclaration (M) {
    return {
      type: 'VariableDeclaration',
      kind:
                M instanceof AST_Const ? 'const'
                  : M instanceof AST_Let ? 'let' : 'var',
      declarations: M.definitions.map(to_moz)
    }
  },
  _do_print: function (this: any, output: any, kind: string) {
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
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Base class for `var` or `const` nodes (variable declarations/initializations)',
  propdoc: {
    definitions: '[AST_VarDef*] array of variable definitions'
  }

}, AST_Statement)

var AST_Var: any = DEFNODE('Var', null, {
  _size: function (): number {
    return def_size(4, this)
  },
  _codegen: function (self, output) {
    self._do_print(output, 'var')
  }
}, {
  documentation: 'A `var` statement'
}, AST_Definitions)

var AST_Let: any = DEFNODE('Let', null, {
  _size: function (): number {
    return def_size(4, this)
  },
  _codegen: function (self, output) {
    self._do_print(output, 'let')
  }
}, {
  documentation: 'A `let` statement'
}, AST_Definitions)

var AST_Const: any = DEFNODE('Const', null, {
  _size: function (): number {
    return def_size(6, this)
  },
  _codegen: function (self, output) {
    self._do_print(output, 'const')
  }
}, {
  documentation: 'A `const` statement'
}, AST_Definitions)

var AST_VarDef: any = DEFNODE('VarDef', 'name value', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.name._walk(visitor)
      if (this.value) this.value._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    if (this.value) push(this.value)
    push(this.name)
  },
  _size: function (): number {
    return this.value ? 1 : 0
  },
  shallow_cmp: mkshallow({
    value: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    self.name = self.name.transform(tw)
    if (self.value) self.value = self.value.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'VariableDeclarator',
    id: to_moz(M.name),
    init: to_moz(M.value)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'A variable declaration; only appears in a AST_Definitions node',
  propdoc: {
    name: '[AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar] name of the variable',
    value: "[AST_Node?] initializer, or null of there's no initializer"
  }

}, AST_Node)

var AST_NameMapping: any = DEFNODE('NameMapping', 'foreign_name name', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.foreign_name._walk(visitor)
      this.name._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.name)
    push(this.foreign_name)
  },
  _size: function (): number {
    // foreign name isn't mangled
    return this.name ? 4 : 0
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.foreign_name = self.foreign_name.transform(tw)
    self.name = self.name.transform(tw)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'The part of the export/import statement that declare names from a module.',
  propdoc: {
    foreign_name: '[AST_SymbolExportForeign|AST_SymbolImportForeign] The name being exported/imported (as specified in the module)',
    name: '[AST_SymbolExport|AST_SymbolImport] The name as it is visible to this module.'
  }

}, AST_Node)

var AST_Import: any = DEFNODE('Import', 'imported_name imported_names module_name', {
  _walk: function (visitor: any) {
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
  },
  _children_backwards (push: Function) {
    push(this.module_name)
    if (this.imported_names) {
      let i = this.imported_names.length
      while (i--) push(this.imported_names[i])
    }
    if (this.imported_name) push(this.imported_name)
  },
  _size: function (): number {
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
  },
  shallow_cmp: mkshallow({
    imported_name: 'exist',
    imported_names: 'exist'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.imported_name) self.imported_name = self.imported_name.transform(tw)
    if (self.imported_names) do_list(self.imported_names, tw)
    self.module_name = self.module_name.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_ImportDeclaration (M) {
    var specifiers: any[] = []
    if (M.imported_name) {
      specifiers.push({
        type: 'ImportDefaultSpecifier',
        local: to_moz(M.imported_name)
      })
    }
    if (M.imported_names && M.imported_names[0].foreign_name.name === '*') {
      specifiers.push({
        type: 'ImportNamespaceSpecifier',
        local: to_moz(M.imported_names[0].name)
      })
    } else if (M.imported_names) {
      M.imported_names.forEach(function (name_mapping) {
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
      source: to_moz(M.module_name)
    }
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'An `import` statement',
  propdoc: {
    imported_name: "[AST_SymbolImport] The name of the variable holding the module's default export.",
    imported_names: '[AST_NameMapping*] The names of non-default imported variables',
    module_name: '[AST_String] String literal describing where this module came from'
  }

}, AST_Node)

var AST_Export: any = DEFNODE('Export', 'exported_definition exported_value is_default exported_names module_name', {
  _walk: function (visitor: any) {
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
  },
  _children_backwards (push: Function) {
    if (this.module_name) push(this.module_name)
    if (this.exported_names) {
      let i = this.exported_names.length
      while (i--) push(this.exported_names[i])
    }
    if (this.exported_value) push(this.exported_value)
    if (this.exported_definition) push(this.exported_definition)
  },
  _size: function (): number {
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
  },
  shallow_cmp: mkshallow({
    exported_definition: 'exist',
    exported_value: 'exist',
    exported_names: 'exist',
    module_name: 'eq',
    is_default: 'eq'
  }),
  transform: get_transformer(function (self, tw: any) {
    if (self.exported_definition) self.exported_definition = self.exported_definition.transform(tw)
    if (self.exported_value) self.exported_value = self.exported_value.transform(tw)
    if (self.exported_names) do_list(self.exported_names, tw)
    if (self.module_name) self.module_name = self.module_name.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_ExportDeclaration (M) {
    if (M.exported_names) {
      if (M.exported_names[0].name.name === '*') {
        return {
          type: 'ExportAllDeclaration',
          source: to_moz(M.module_name)
        }
      }
      return {
        type: 'ExportNamedDeclaration',
        specifiers: M.exported_names.map(function (name_mapping) {
          return {
            type: 'ExportSpecifier',
            exported: to_moz(name_mapping.foreign_name),
            local: to_moz(name_mapping.name)
          }
        }),
        declaration: to_moz(M.exported_definition),
        source: to_moz(M.module_name)
      }
    }
    return {
      type: M.is_default ? 'ExportDefaultDeclaration' : 'ExportNamedDeclaration',
      declaration: to_moz(M.exported_value || M.exported_definition)
    }
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'An `export` statement',
  propdoc: {
    exported_definition: '[AST_Defun|AST_Definitions|AST_DefClass?] An exported definition',
    exported_value: '[AST_Node?] An exported value',
    exported_names: '[AST_NameMapping*?] List of exported names',
    module_name: '[AST_String?] Name of the file to load exports from',
    is_default: '[Boolean] Whether this is the default exported value of this module'
  }

}, AST_Statement)

/* -----[ OTHER ]----- */

var AST_Call: any = DEFNODE('Call', 'expression args _annotations', {
  initialize () {
    if (this._annotations == null) this._annotations = 0
  },
  _walk (visitor: any) {
    return visitor._visit(this, function () {
      var args = this.args
      for (var i = 0, len = args.length; i < len; i++) {
        args[i]._walk(visitor)
      }
      this.expression._walk(visitor) // TODO why do we need to crawl this last?
    })
  },
  _children_backwards (push: Function) {
    let i = this.args.length
    while (i--) push(this.args[i])
    push(this.expression)
  },
  _size: function (): number {
    return 2 + list_overhead(this.args)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.args = do_list(self.args, tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'CallExpression',
    callee: to_moz(M.expression),
    arguments: M.args.map(to_moz)
  }),
  needs_parens: function (output: any) {
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
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'A function call expression',
  propdoc: {
    expression: '[AST_Node] expression to invoke as function',
    args: '[AST_Node*] array of arguments',
    _annotations: '[number] bitfield containing information about the call'
  }

}, AST_Node)

var AST_New: any = DEFNODE('New', null, {
  _size: function (): number {
    return 6 + list_overhead(this.args)
  },
  _to_mozilla_ast: M => ({
    type: 'NewExpression',
    callee: to_moz(M.expression),
    arguments: M.args.map(to_moz)
  }),
  needs_parens: function (output: any) {
    var p = output.parent()
    if (this.args.length === 0 &&
            (p instanceof AST_PropAccess || // (new Date).getTime(), (new Date)["getTime"]()
                p instanceof AST_Call && p.expression === this)) // (new foo)(bar)
    { return true }
    return undefined
  },
  _codegen: function (self, output) {
    output.print('new')
    output.space()
        AST_Call.prototype._codegen?.(self, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'An object instantiation.  Derives from a function call since it has exactly the same properties'
}, AST_Call)

var AST_Sequence: any = DEFNODE('Sequence', 'expressions', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expressions.forEach(function (node: any) {
        node._walk(visitor)
      })
    })
  },
  _children_backwards (push: Function) {
    let i = this.expressions.length
    while (i--) push(this.expressions[i])
  },
  _size: function (): number {
    return list_overhead(this.expressions)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    const result = do_list(self.expressions, tw)
    self.expressions = result.length
      ? result
      : [new AST_Number({ value: 0 })]
  }),
  _to_mozilla_ast: function To_Moz_SequenceExpression (M) {
    return {
      type: 'SequenceExpression',
      expressions: M.expressions.map(to_moz)
    }
  },
  needs_parens: function (output: any) {
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
  },
  _do_print: function (this: any, output: any) {
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
  },
  _codegen: function (self, output) {
    self._do_print(output)
  },
  tail_node: function () {
    return this.expressions[this.expressions.length - 1]
  }
}, {
  documentation: 'A sequence expression (comma-separated expressions)',
  propdoc: {
    expressions: '[AST_Node*] array of expressions (at least two)'
  }

}, AST_Node)

var AST_PropAccess: any = DEFNODE('PropAccess', 'expression property', {
  shallow_cmp: pass_through,
  _to_mozilla_ast: function To_Moz_MemberExpression (M) {
    var isComputed = M instanceof AST_Sub
    return {
      type: 'MemberExpression',
      object: to_moz(M.expression),
      computed: isComputed,
      property: isComputed ? to_moz(M.property) : { type: 'Identifier', name: M.property }
    }
  },
  needs_parens: function (output: any) {
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
}, {
  documentation: 'Base class for property access expressions, i.e. `a.foo` or `a["foo"]`',
  propdoc: {
    expression: '[AST_Node] the “container” expression',
    property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
  }
}, AST_Node)

var AST_Dot: any = DEFNODE('Dot', 'quote', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.expression)
  },
  _size: function (): number {
    return this.property.length + 1
  },
  shallow_cmp: mkshallow({ property: 'eq' }),
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }),
  _codegen: function (self, output) {
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
}, {
  documentation: 'A dotted property access expression',
  propdoc: {
    quote: '[string] the original quote character when transformed from AST_Sub'
  }
}, AST_PropAccess)

var AST_Sub: any = DEFNODE('Sub', null, {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      this.property._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.property)
    push(this.expression)
  },
  _size: () => 2,
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
    self.property = (self.property).transform(tw)
  }),
  _codegen: function (self, output) {
    self.expression.print(output)
    output.print('[');
    (self.property).print(output)
    output.print(']')
  }
}, {
  documentation: 'Index-style property access, i.e. `a["foo"]`'

}, AST_PropAccess)

var AST_Unary: any = DEFNODE('Unary', 'operator expression', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.expression)
  },
  _size: function (): number {
    if (this.operator === 'typeof') return 7
    if (this.operator === 'void') return 5
    return this.operator.length
  },
  shallow_cmp: mkshallow({ operator: 'eq' }),
  transform: get_transformer(function (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_Unary (M: any) {
    return {
      type: M.operator == '++' || M.operator == '--' ? 'UpdateExpression' : 'UnaryExpression',
      operator: M.operator,
      prefix: M instanceof AST_UnaryPrefix,
      argument: to_moz(M.expression)
    }
  },
  needs_parens: function (output: any) {
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
}, {
  documentation: 'Base class for unary expressions',
  propdoc: {
    operator: '[string] the operator',
    expression: '[AST_Node] expression that this unary operator applies to'
  }
}, AST_Node)

var AST_UnaryPrefix: any = DEFNODE('UnaryPrefix', null, {
  _codegen: function (self, output) {
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
}, {
  documentation: 'Unary prefix expression, i.e. `typeof i` or `++i`'
}, AST_Unary)

var AST_UnaryPostfix: any = DEFNODE('UnaryPostfix', null, {
  _codegen: function (self, output) {
    self.expression.print(output)
    output.print(self.operator)
  }
}, {
  documentation: 'Unary postfix expression, i.e. `i++`'
}, AST_Unary)

var AST_Binary: any = DEFNODE('Binary', 'operator left right', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.left._walk(visitor)
      this.right._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.right)
    push(this.left)
  },
  shallow_cmp: mkshallow({ operator: 'eq' }),
  _size: function (info): number {
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
  },
  transform: get_transformer(function (self, tw: any) {
    self.left = self.left.transform(tw)
    self.right = self.right.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_BinaryExpression (M: any) {
    if (M.operator == '=' && to_moz_in_destructuring()) {
      return {
        type: 'AssignmentPattern',
        left: to_moz(M.left),
        right: to_moz(M.right)
      }
    }

    const type = M.operator == '&&' || M.operator == '||' || M.operator === '??'
      ? 'LogicalExpression'
      : 'BinaryExpression'

    return {
      type,
      left: to_moz(M.left),
      operator: M.operator,
      right: to_moz(M.right)
    }
  },
  needs_parens: function (output: any) {
    var p = output.parent()
    // (foo && bar)()
    if (p instanceof AST_Call && p.expression === this) { return true }
    // typeof (foo && bar)
    if (p instanceof AST_Unary) { return true }
    // (foo && bar)["prop"], (foo && bar).prop
    if (p instanceof AST_PropAccess && p.expression === this) { return true }
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
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'Binary expression, i.e. `a + b`',
  propdoc: {
    left: '[AST_Node] left-hand side expression',
    operator: '[string] the operator',
    right: '[AST_Node] right-hand side expression'
  }

}, AST_Node)

var AST_Conditional: any = DEFNODE('Conditional', 'condition consequent alternative', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      this.condition._walk(visitor)
      this.consequent._walk(visitor)
      this.alternative._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.alternative)
    push(this.consequent)
    push(this.condition)
  },
  _size: () => 3,
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.condition = self.condition.transform(tw)
    self.consequent = self.consequent.transform(tw)
    self.alternative = self.alternative.transform(tw)
  }),
  _to_mozilla_ast: M => ({
    type: 'ConditionalExpression',
    test: to_moz(M.condition),
    consequent: to_moz(M.consequent),
    alternate: to_moz(M.alternative)
  }),
  needs_parens: needsParens,
  _codegen: function (self, output) {
    self.condition.print(output)
    output.space()
    output.print('?')
    output.space()
    self.consequent.print(output)
    output.space()
    output.colon()
    self.alternative.print(output)
  }
}, {
  documentation: 'Conditional expression using the ternary operator, i.e. `a ? b : c`',
  propdoc: {
    condition: '[AST_Node]',
    consequent: '[AST_Node]',
    alternative: '[AST_Node]'
  }
}, AST_Node)

var AST_Assign: any = DEFNODE('Assign', null, {
  _to_mozilla_ast: M => ({
    type: 'AssignmentExpression',
    operator: M.operator,
    left: to_moz(M.left),
    right: to_moz(M.right)
  }),
  needs_parens: needsParens
}, {
  documentation: 'An assignment expression — `a = b + 5`'
}, AST_Binary)

var AST_DefaultAssign: any = DEFNODE('DefaultAssign', null, {}, {
  documentation: 'A default assignment expression like in `(a = 3) => a`'
}, AST_Binary)

/* -----[ LITERALS ]----- */

var AST_Array: any = DEFNODE('Array', 'elements', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      var elements = this.elements
      for (var i = 0, len = elements.length; i < len; i++) {
        elements[i]._walk(visitor)
      }
    })
  },
  _children_backwards (push: Function) {
    let i = this.elements.length
    while (i--) push(this.elements[i])
  },
  _size: function (): number {
    return 2 + list_overhead(this.elements)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.elements = do_list(self.elements, tw)
  }),
  _to_mozilla_ast: function To_Moz_ArrayExpression (M: any) {
    return {
      type: 'ArrayExpression',
      elements: M.elements.map(to_moz)
    }
  },
  _codegen: function (self, output) {
    output.with_square(function () {
      var a = self.elements; var len = a.length
      if (len > 0) output.space()
      a.forEach(function (exp, i) {
        if (i) output.comma()
        exp.print(output)
        // If the final element is a hole, we need to make sure it
        // doesn't look like a trailing comma, by inserting an actual
        // trailing comma.
        if (i === len - 1 && exp instanceof AST_Hole) { output.comma() }
      })
      if (len > 0) output.space()
    })
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'An array literal',
  propdoc: {
    elements: '[AST_Node*] array of elements'
  }

}, AST_Node)

var AST_Object: any = DEFNODE('Object', 'properties', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      var properties = this.properties
      for (var i = 0, len = properties.length; i < len; i++) {
        properties[i]._walk(visitor)
      }
    })
  },
  _children_backwards (push: Function) {
    let i = this.properties.length
    while (i--) push(this.properties[i])
  },
  _size: function (info): number {
    let base = 2
    if (first_in_statement(info)) {
      base += 2 // parens
    }
    return base + list_overhead(this.properties)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    self.properties = do_list(self.properties, tw)
  }),
  _to_mozilla_ast: function To_Moz_ObjectExpression (M: any) {
    return {
      type: 'ObjectExpression',
      properties: M.properties.map(to_moz)
    }
  },
  // same goes for an object literal, because otherwise it would be
  // interpreted as a block of code.
  needs_parens: function (output: any) {
    return !output.has_parens() && first_in_statement(output)
  },
  _codegen: function (self, output) {
    if (self.properties.length > 0) {
      output.with_block(function () {
        self.properties.forEach(function (prop, i) {
          if (i) {
            output.print(',')
            output.newline()
          }
          output.indent()
          prop.print(output)
        })
        output.newline()
      })
    } else print_braced_empty(self, output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'An object literal',
  propdoc: {
    properties: '[AST_ObjectProperty*] array of properties'
  }
}, AST_Node)

var AST_ObjectProperty: any = DEFNODE('ObjectProperty', 'key value', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.key instanceof AST_Node) { this.key._walk(visitor) }
      this.value._walk(visitor)
    })
  },
  _children_backwards (push: Function) {
    push(this.value)
    if (this.key instanceof AST_Node) push(this.key)
  },
  shallow_cmp: pass_through,
  transform: get_transformer(function (self, tw: any) {
    if (self.key instanceof AST_Node) {
      self.key = self.key.transform(tw)
    }
    if (self.value) self.value = self.value.transform(tw)
  }),
  _to_mozilla_ast: function To_Moz_Property (M, parent) {
    var key = M.key instanceof AST_Node ? to_moz(M.key) : {
      type: 'Identifier',
      value: M.key
    }
    if (typeof M.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(M.key)
      }
    }
    if (typeof M.key === 'string') {
      key = {
        type: 'Identifier',
        name: M.key
      }
    }
    var kind
    var string_or_num = typeof M.key === 'string' || typeof M.key === 'number'
    var computed = string_or_num ? false : !(M.key instanceof AST_Symbol) || M.key instanceof AST_SymbolRef
    if (M instanceof AST_ObjectKeyVal) {
      kind = 'init'
      computed = !string_or_num
    } else
    if (M instanceof AST_ObjectGetter) {
      kind = 'get'
    } else
    if (M instanceof AST_ObjectSetter) {
      kind = 'set'
    }
    if (M instanceof AST_ClassProperty) {
      return {
        type: 'FieldDefinition',
        computed,
        key,
        value: to_moz(M.value),
        static: M.static
      }
    }
    if (parent instanceof AST_Class) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: M.static,
        key: to_moz(M.key),
        value: to_moz(M.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(M.value)
    }
  },
  _print_getter_setter: function (this: any, type: string, output: any) {
    var self = this
    if (self.static) {
      output.print('static')
      output.space()
    }
    if (type) {
      output.print(type)
      output.space()
    }
    if (self.key instanceof AST_SymbolMethod) {
      print_property_name(self.key.name, self.quote, output)
    } else {
      output.with_square(function () {
        self.key.print(output)
      })
    }
    self.value._do_print(output, true)
  },
  add_source_map: function (output) { output.add_mapping(this.start, this.key) }
}, {
  documentation: 'Base class for literal object properties',
  propdoc: {
    key: '[string|AST_Node] property name. For ObjectKeyVal this is a string. For getters, setters and computed property this is an AST_Node.',
    value: '[AST_Node] property value.  For getters and setters this is an AST_Accessor.'
  }
}, AST_Node)

var AST_ObjectKeyVal: any = DEFNODE('ObjectKeyVal', 'quote', {
  computed_key () {
    return this.key instanceof AST_Node
  },
  shallow_cmp: mkshallow({ key: 'eq' }),
  _size: function (): number {
    return key_size(this.key) + 1
  },
  _codegen: function (self, output) {
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
}, {
  documentation: 'A key: value object property',
  propdoc: {
    quote: '[string] the original quote character'
  }
}, AST_ObjectProperty)

var AST_ObjectSetter: any = DEFNODE('ObjectSetter', 'quote static', {
  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  },
  _size: function (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  },
  shallow_cmp: mkshallow({
    static: 'eq'
  }),
  _codegen: function (self, output) {
    self._print_getter_setter('set', output)
  },
  add_source_map: function (output) { output.add_mapping(this.start, this.key.name) }
}, {
  propdoc: {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static setter (classes only)'
  },
  documentation: 'An object setter property'
}, AST_ObjectProperty)

var AST_ObjectGetter: any = DEFNODE('ObjectGetter', 'quote static', {
  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  },
  _size: function (): number {
    return 5 + static_size(this.static) + key_size(this.key)
  },
  shallow_cmp: mkshallow({
    static: 'eq'
  }),
  _codegen: function (self, output) {
    self._print_getter_setter('get', output)
  },
  add_source_map: function (output) { output.add_mapping(this.start, this.key.name) }
}, {
  propdoc: {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] whether this is a static getter (classes only)'
  },
  documentation: 'An object getter property'
}, AST_ObjectProperty)

var AST_ConciseMethod: any = DEFNODE('ConciseMethod', 'quote static is_generator async', {
  computed_key () {
    return !(this.key instanceof AST_SymbolMethod)
  },
  _size: function (): number {
    return static_size(this.static) + key_size(this.key) + lambda_modifiers(this)
  },
  shallow_cmp: mkshallow({
    static: 'eq',
    is_generator: 'eq',
    async: 'eq'
  }),
  _to_mozilla_ast: function To_Moz_MethodDefinition (M, parent) {
    if (parent instanceof AST_Object) {
      return {
        type: 'Property',
        computed: !(M.key instanceof AST_Symbol) || M.key instanceof AST_SymbolRef,
        kind: 'init',
        method: true,
        shorthand: false,
        key: to_moz(M.key),
        value: to_moz(M.value)
      }
    }
    return {
      type: 'MethodDefinition',
      computed: !(M.key instanceof AST_Symbol) || M.key instanceof AST_SymbolRef,
      kind: M.key === 'constructor' ? 'constructor' : 'method',
      static: M.static,
      key: to_moz(M.key),
      value: to_moz(M.value)
    }
  },
  _codegen: function (self, output) {
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
}, {
  propdoc: {
    quote: '[string|undefined] the original quote character, if any',
    static: '[boolean] is this method static (classes only)',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  },
  documentation: 'An ES6 concise method inside an object or class'
}, AST_ObjectProperty)

var AST_Class: any = DEFNODE('Class', 'name extends properties', {
  is_block_scope: return_false,
  _walk: function (visitor: any) {
    return visitor._visit(this, function (this: any) {
      if (this.name) {
        this.name._walk(visitor)
      }
      if (this.extends) {
        this.extends._walk(visitor)
      }
      this.properties.forEach((prop) => prop._walk(visitor))
    })
  },
  _children_backwards (push: Function) {
    let i = this.properties.length
    while (i--) push(this.properties[i])
    if (this.extends) push(this.extends)
    if (this.name) push(this.name)
  },
  _size: function (): number {
    return (
      (this.name ? 8 : 7) +
            (this.extends ? 8 : 0)
    )
  },
  transform: get_transformer(function (self, tw: any) {
    if (self.name) self.name = self.name.transform(tw)
    if (self.extends) self.extends = self.extends.transform(tw)
    self.properties = do_list(self.properties, tw)
  }),
  shallow_cmp: mkshallow({
    name: 'exist',
    extends: 'exist'
  }),
  _to_mozilla_ast: function To_Moz_Class (M) {
    var type = M instanceof AST_ClassExpression ? 'ClassExpression' : 'ClassDeclaration'
    return {
      type: type,
      superClass: to_moz(M.extends),
      id: M.name ? to_moz(M.name) : null,
      body: {
        type: 'ClassBody',
        body: M.properties.map(to_moz)
      }
    }
  },
  _codegen: function (self, output) {
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
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  propdoc: {
    name: '[AST_SymbolClass|AST_SymbolDefClass?] optional class name.',
    extends: '[AST_Node]? optional parent class',
    properties: '[AST_ObjectProperty*] array of properties'
  },
  documentation: 'An ES6 class'

}, AST_Scope /* TODO a class might have a scope but it's not a scope */)

var AST_ClassProperty = DEFNODE('ClassProperty', 'static quote', {
  _walk: function (visitor: any) {
    return visitor._visit(this, function () {
      if (this.key instanceof AST_Node) { this.key._walk(visitor) }
      if (this.value instanceof AST_Node) { this.value._walk(visitor) }
    })
  },
  _children_backwards (push: Function) {
    if (this.value instanceof AST_Node) push(this.value)
    if (this.key instanceof AST_Node) push(this.key)
  },
  computed_key () {
    return !(this.key instanceof AST_SymbolClassProperty)
  },
  _size: function (): number {
    return (
      static_size(this.static) +
            (typeof this.key === 'string' ? this.key.length + 2 : 0) +
            (this.value ? 1 : 0)
    )
  },
  shallow_cmp: mkshallow({
    static: 'eq'
  }),
  _codegen: (self, output) => {
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
}, {
  documentation: 'A class property',
  propdoc: {
    static: '[boolean] whether this is a static key',
    quote: '[string] which quote is being used'
  }
}, AST_ObjectProperty)

var AST_DefClass: any = DEFNODE('DefClass', null, {}, {
  documentation: 'A class definition'
}, AST_Class)

var AST_ClassExpression: any = DEFNODE('ClassExpression', null, {
  needs_parens: first_in_statement
}, {
  documentation: 'A class expression.'
}, AST_Class)

let mangle_options

var AST_Symbol: any = DEFNODE('Symbol', 'scope name thedef', {
  mark_enclosed: function () {
    var def = this.definition()
    var s = this.scope
    while (s) {
      push_uniq(s.enclosed, def)
      if (s === def.scope) break
      s = s.parent_scope
    }
  },
  reference: function () {
    this.definition().references.push(this)
    this.mark_enclosed()
  },
  unmangleable: function (options: any) {
    var def = this.definition()
    return !def || def.unmangleable(options)
  },
  unreferenced: function () {
    return !this.definition().references.length && !this.scope.pinned()
  },
  definition: function () {
    return this.thedef
  },
  global: function () {
    return this.thedef.global
  },
  _size: function (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
      ? this.name.length
      : 2
  },
  shallow_cmp: mkshallow({
    name: 'eq'
  }),
  _to_mozilla_ast: function To_Moz_Identifier (M, parent) {
    if (M instanceof AST_SymbolMethod && parent.quote) {
      return {
        type: 'Literal',
        value: M.name
      }
    }
    var def = M.definition()
    return {
      type: 'Identifier',
      name: def ? def.mangled_name || def.name : M.name
    }
  },
  _do_print: function (output: any) {
    var def = this.definition()
    output.print_name(def ? def.mangled_name || def.name : this.name)
  },
  _codegen: function (self, output) {
    self._do_print(output)
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  propdoc: {
    name: '[string] name of this symbol',
    scope: '[AST_Scope/S] the current scope (not necessarily the definition scope)',
    thedef: '[SymbolDef/S] the definition of this symbol'
  },
  documentation: 'Base class for all symbols'
}, AST_Node)

var AST_NewTarget: any = DEFNODE('NewTarget', null, {
  _size: () => 10,
  shallow_cmp: pass_through,
  _to_mozilla_ast: function To_Moz_MetaProperty () {
    return {
      type: 'MetaProperty',
      meta: {
        type: 'Identifier',
        name: 'new'
      },
      property: {
        type: 'Identifier',
        name: 'target'
      }
    }
  },
  _codegen: function (_self, output) {
    output.print('new.target')
  }
}, {
  documentation: 'A reference to new.target'
}, AST_Node)

var AST_SymbolDeclaration: any = DEFNODE('SymbolDeclaration', 'init', {}, {
  documentation: 'A declaration symbol (symbol in var/const, function name or argument, symbol in catch)'
}, AST_Symbol)

var AST_SymbolVar: any = DEFNODE('SymbolVar', null, {}, {
  documentation: 'Symbol defining a variable'
}, AST_SymbolDeclaration)

var AST_SymbolBlockDeclaration: any = DEFNODE('SymbolBlockDeclaration', null, {}, {
  documentation: 'Base class for block-scoped declaration symbols'
}, AST_SymbolDeclaration)

var AST_SymbolConst: any = DEFNODE('SymbolConst', null, {}, {
  documentation: 'A constant declaration'
}, AST_SymbolBlockDeclaration)

var AST_SymbolLet: any = DEFNODE('SymbolLet', null, {}, {
  documentation: 'A block-scoped `let` declaration'
}, AST_SymbolBlockDeclaration)

var AST_SymbolFunarg: any = DEFNODE('SymbolFunarg', null, {}, {
  documentation: 'Symbol naming a function argument'
}, AST_SymbolVar)

var AST_SymbolDefun: any = DEFNODE('SymbolDefun', null, {}, {
  documentation: 'Symbol defining a function'
}, AST_SymbolDeclaration)

var AST_SymbolMethod: any = DEFNODE('SymbolMethod', null, {}, {
  documentation: 'Symbol in an object defining a method'
}, AST_Symbol)

var AST_SymbolClassProperty = DEFNODE('SymbolClassProperty', null, {
  // TODO take propmangle into account
  _size: function (): number {
    return this.name.length
  }
}, {
  documentation: 'Symbol for a class property'
}, AST_Symbol)

var AST_SymbolLambda: any = DEFNODE('SymbolLambda', null, {}, {
  documentation: 'Symbol naming a function expression'
}, AST_SymbolDeclaration)

var AST_SymbolDefClass: any = DEFNODE('SymbolDefClass', null, {}, {
  documentation: "Symbol naming a class's name in a class declaration. Lexically scoped to its containing scope, and accessible within the class."
}, AST_SymbolBlockDeclaration)

var AST_SymbolClass: any = DEFNODE('SymbolClass', null, {}, {
  documentation: "Symbol naming a class's name. Lexically scoped to the class."
}, AST_SymbolDeclaration)

var AST_SymbolCatch: any = DEFNODE('SymbolCatch', null, {}, {
  documentation: 'Symbol naming the exception in catch'
}, AST_SymbolBlockDeclaration)

var AST_SymbolImport: any = DEFNODE('SymbolImport', null, {}, {
  documentation: 'Symbol referring to an imported name'
}, AST_SymbolBlockDeclaration)

var AST_SymbolImportForeign: any = DEFNODE('SymbolImportForeign', null, {
  _size: function (): number {
    return this.name.length
  }
}, {
  documentation: "A symbol imported from a module, but it is defined in the other module, and its real name is irrelevant for this module's purposes"
}, AST_Symbol)

var AST_Label: any = DEFNODE('Label', 'references', {
  // labels are always mangleable
  unmangleable: return_false,
  initialize: function () {
    this.references = []
    this.thedef = this
  }
}, {
  documentation: 'Symbol naming a label (declaration)',
  propdoc: {
    references: '[AST_LoopControl*] a list of nodes referring to this label'
  }
}, AST_Symbol)

var AST_SymbolRef: any = DEFNODE('SymbolRef', null, {
  _size: function (): number {
    const { name, thedef } = this

    if (thedef && thedef.global) return name.length

    if (name === 'arguments') return 9

    return 2
  }
}, {
  documentation: 'Reference to some symbol (not definition/declaration)'
}, AST_Symbol)

var AST_SymbolExport: any = DEFNODE('SymbolExport', null, {}, {
  documentation: 'Symbol referring to a name to export'
}, AST_SymbolRef)

var AST_SymbolExportForeign: any = DEFNODE('SymbolExportForeign', null, {
  _size: function (): number {
    return this.name.length
  }
}, {
  documentation: "A symbol exported from this module, but it is used in the other module, and its real name is irrelevant for this module's purposes"
}, AST_Symbol)

var AST_LabelRef: any = DEFNODE('LabelRef', null, {}, {
  documentation: 'Reference to a label symbol'
}, AST_Symbol)

var AST_This: any = DEFNODE('This', null, {
  _size: () => 4,
  shallow_cmp: pass_through,
  _to_mozilla_ast: () => ({ type: 'ThisExpression' }),
  _codegen: function (_self, output) {
    output.print('this')
  }
}, {
  documentation: 'The `this` symbol'
}, AST_Symbol)

var AST_Super: any = DEFNODE('Super', null, {
  _size: () => 5,
  shallow_cmp: pass_through,
  _to_mozilla_ast: () => ({ type: 'Super' }),
  _codegen: function (_self, output) {
    output.print('super')
  }
}, {
  documentation: 'The `super` symbol'
}, AST_This)

function To_Moz_Literal (M) {
  var value = M.value
  if (typeof value === 'number' && (value < 0 || (value === 0 && 1 / value < 0))) {
    return {
      type: 'UnaryExpression',
      operator: '-',
      prefix: true,
      argument: {
        type: 'Literal',
        value: -value,
        raw: M.start.raw
      }
    }
  }
  return {
    type: 'Literal',
    value: value,
    raw: M.start.raw
  }
}

var AST_Constant: any = DEFNODE('Constant', null, {
  getValue: function () {
    return this.value
  },
  _to_mozilla_ast: To_Moz_Literal,
  _codegen: function (self, output) {
    output.print(self.getValue())
  },
  add_source_map: function (output) { output.add_mapping(this.start) }
}, {
  documentation: 'Base class for all constants'
}, AST_Node)

var AST_String: any = DEFNODE('String', 'value quote', {
  _size: function (): number {
    return this.value.length + 2
  },
  shallow_cmp: mkshallow({
    value: 'eq'
  }),
  _codegen: function (self, output) {
    output.print_string(self.getValue(), self.quote, output.in_directive)
  }
}, {
  documentation: 'A string literal',
  propdoc: {
    value: '[string] the contents of this string',
    quote: '[string] the original quote character'
  }
}, AST_Constant)

var AST_Number: any = DEFNODE('Number', 'value literal', {
  _size: function (): number {
    const { value } = this
    if (value === 0) return 1
    if (value > 0 && Math.floor(value) === value) {
      return Math.floor(Math.log10(value) + 1)
    }
    return value.toString().length
  },
  shallow_cmp: mkshallow({
    value: 'eq'
  }),
  needs_parens: function (output: any) {
    var p = output.parent()
    if (p instanceof AST_PropAccess && p.expression === this) {
      var value = this.getValue()
      if (value < 0 || /^0/.test(make_num(value))) {
        return true
      }
    }
    return undefined
  },
  _codegen: function (self, output) {
    if ((output.option('keep_numbers') || output.use_asm) && self.start && self.start.raw != null) {
      output.print(self.start.raw)
    } else {
      output.print(make_num(self.getValue()))
    }
  }
}, {
  documentation: 'A number literal',
  propdoc: {
    value: '[number] the numeric value',
    literal: '[string] numeric value as string (optional)'
  }
}, AST_Constant)

var AST_BigInt = DEFNODE('BigInt', 'value', {
  _size: function (): number {
    return this.value.length
  },
  shallow_cmp: mkshallow({
    value: 'eq'
  }),
  _to_mozilla_ast: M => ({
    type: 'BigIntLiteral',
    value: M.value
  }),
  _codegen: function (self, output) {
    output.print(self.getValue() + 'n')
  },
  needs_parens: function (output: any) {
    var p = output.parent()
    if (p instanceof AST_PropAccess && p.expression === this) {
      var value = this.getValue()
      if (value.startsWith('-')) {
        return true
      }
    }
    return undefined
  }
}, {
  documentation: 'A big int literal',
  propdoc: {
    value: '[string] big int value'
  }
}, AST_Constant)

var AST_RegExp: any = DEFNODE('RegExp', 'value', {
  _size: function (): number {
    return this.value.toString().length
  },
  shallow_cmp: function (other) {
    return (
      this.value.flags === other.value.flags &&
            this.value.source === other.value.source
    )
  },
  _to_mozilla_ast: function To_Moz_RegExpLiteral (M) {
    const pattern = M.value.source
    const flags = M.value.flags
    return {
      type: 'Literal',
      value: null,
      raw: M.print_to_string(),
      regex: { pattern, flags }
    }
  },
  _codegen: function (self, output) {
    let { source, flags } = self.getValue()
    source = regexp_source_fix(source)
    flags = flags ? sort_regexp_flags(flags) : ''
    source = source.replace(r_slash_script, slash_script_replace)
        output.print?.(output.to_utf8(`/${source}/${flags}`))
        const parent = output.parent()
        if (
          parent instanceof AST_Binary &&
            /^\w/.test(parent.operator) &&
            parent.left === self
        ) {
          output.print(' ')
        }
  }
}, {
  documentation: 'A regexp literal',
  propdoc: {
    value: '[RegExp] the actual regexp'
  }
}, AST_Constant)

var AST_Atom: any = DEFNODE('Atom', null, {
  shallow_cmp: pass_through,
  _to_mozilla_ast: function To_Moz_Atom (M) {
    return {
      type: 'Identifier',
      name: String(M.value)
    }
  }
}, {
  documentation: 'Base class for atoms'
}, AST_Constant)

var AST_Null: any = DEFNODE('Null', null, {
  value: null,
  _size: () => 4,
  _to_mozilla_ast: To_Moz_Literal
}, {
  documentation: 'The `null` atom'
}, AST_Atom)

var AST_NaN: any = DEFNODE('NaN', null, {
  value: 0 / 0,
  _size: () => 3
}, {
  documentation: 'The impossible value'
}, AST_Atom)

var AST_Undefined: any = DEFNODE('Undefined', null, {
  value: (function () {}()),
  _size: () => 6 // "void 0"
}, {
  documentation: 'The `undefined` value'
}, AST_Atom)

var AST_Hole: any = DEFNODE('Hole', null, {
  value: (function () {}()),
  to_mozilla_ast: function To_Moz_ArrayHole () { return null },
  _size: () => 0, // comma is taken into account
  _codegen: noop
}, {
  documentation: 'A hole in an array'
}, AST_Atom)

var AST_Infinity: any = DEFNODE('Infinity', null, {
  value: 1 / 0,
  _size: () => 8
}, {
  documentation: 'The `Infinity` value'
}, AST_Atom)

var AST_Boolean: any = DEFNODE('Boolean', null, {
  _to_mozilla_ast: To_Moz_Literal
}, {
  documentation: 'Base class for booleans'
}, AST_Atom)

var AST_False: any = DEFNODE('False', null, {
  value: false,
  _size: () => 5
}, {
  documentation: 'The `false` atom'
}, AST_Boolean)

var AST_True: any = DEFNODE('True', null, {
  value: true,
  _size: () => 4
}, {
  documentation: 'The `true` atom'
}, AST_Boolean)

/* -----[ Walk function ]---- */

/**
 * Walk nodes in depth-first search fashion.
 * Callback can return `walk_abort` symbol to stop iteration.
 * It can also return `true` to stop iteration just for child nodes.
 * Iteration can be stopped and continued by passing the `to_visit` argument,
 * which is given to the callback in the second argument.
 **/
function walk (node: any, cb: Function, to_visit = [node]) {
  const push = to_visit.push.bind(to_visit)
  while (to_visit.length) {
    const node = to_visit.pop()
    const ret = cb(node, to_visit)

    if (ret) {
      if (ret === walk_abort) return true
      continue
    }

        node?._children_backwards(push)
  }
  return false
}

function walk_parent (node: any, cb: Function, initial_stack?: any[]) {
  const to_visit = [node]
  const push = to_visit.push.bind(to_visit)
  const stack = initial_stack ? initial_stack.slice() : []
  const parent_pop_indices: any[] = []

  let current: any | undefined

  const info = {
    parent: (n = 0) => {
      if (n === -1) {
        return current
      }

      // [ p1 p0 ] [ 1 0 ]
      if (initial_stack && n >= stack.length) {
        n -= stack.length
        return initial_stack[
          initial_stack.length - (n + 1)
        ]
      }

      return stack[stack.length - (1 + n)]
    }
  }

  while (to_visit.length) {
    current = to_visit.pop()

    while (
      parent_pop_indices.length &&
            to_visit.length == parent_pop_indices[parent_pop_indices.length - 1]
    ) {
      stack.pop()
      parent_pop_indices.pop()
    }

    const ret = cb(current, info)

    if (ret) {
      if (ret === walk_abort) return true
      continue
    }

    const visit_length = to_visit.length

        current?._children_backwards(push)

        // Push only if we're going to traverse the children
        if (to_visit.length > visit_length) {
          stack.push(current)
          parent_pop_indices.push(visit_length - 1)
        }
  }

  return false
}

const walk_abort = Symbol('abort walk')

/* -----[ TreeWalker ]----- */

class TreeWalker {
  visit: any
  stack: any[]
  directives: AnyObject
  safe_ids: any
  in_loop: any
  loop_ids: Map<any, any> | undefined
  defs_to_safe_ids: Map<any, any> | undefined
  constructor (callback?: (node: any, descend: Function) => any) {
    this.visit = callback
    this.stack = []
    this.directives = Object.create(null)
  }

  _visit (node: any, descend?: Function) {
    this.push(node)
    var ret = this.visit(node, descend ? function () {
      descend.call(node)
    } : noop)
    if (!ret && descend) {
      descend.call(node)
    }
    this.pop()
    return ret
  }

  parent (n = 0) {
    return this.stack[this.stack.length - 2 - (n || 0)]
  }

  push (node: any) {
    if (node instanceof AST_Lambda) {
      this.directives = Object.create(this.directives)
    } else if (node instanceof AST_Directive && !this.directives[node.value]) {
      this.directives[node.value] = node
    } else if (node instanceof AST_Class) {
      this.directives = Object.create(this.directives)
      if (!this.directives['use strict']) {
        this.directives['use strict'] = node
      }
    }
    this.stack.push(node)
  }

  pop () {
    var node = this.stack.pop()
    if (node instanceof AST_Lambda || node instanceof AST_Class) {
      this.directives = Object.getPrototypeOf(this.directives)
    }
  }

  self () {
    return this.stack[this.stack.length - 1]
  }

  find_parent (type: any) {
    var stack = this.stack
    for (var i = stack.length; --i >= 0;) {
      var x = stack[i]
      if (x instanceof type) return x
    }
  }

  has_directive (type: string): any {
    var dir = this.directives[type]
    if (dir) return dir
    var node = this.stack[this.stack.length - 1]
    if (node instanceof AST_Scope && node.body) {
      for (var i = 0; i < node.body.length; ++i) {
        var st = node.body[i]
        if (!(st instanceof AST_Directive)) break
        if (st.value == type) return st
      }
    }
  }

  loopcontrol_target (node: any): any | undefined {
    var stack = this.stack
    if (node.label) {
      for (var i = stack.length; --i >= 0;) {
        var x = stack[i]
        if (x instanceof AST_LabeledStatement && x.label.name == node.label.name) { return x.body } // TODO: check this type
      }
    } else {
      for (var i = stack.length; --i >= 0;) {
        var x = stack[i]
        if (x instanceof AST_IterationStatement ||
                node instanceof AST_Break && x instanceof AST_Switch) { return x }
      }
    }
  }
}

// Tree transformer helpers.
class TreeTransformer extends TreeWalker {
  before: any
  after: any
  constructor (before: any, after?: any) {
    super()
    this.before = before
    this.after = after
  }
}

const _PURE = 0b00000001
const _INLINE = 0b00000010
const _NOINLINE = 0b00000100

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
  TreeTransformer,
  TreeWalker,
  walk,
  walk_abort,
  walk_body,
  walk_parent,
  _INLINE,
  _NOINLINE,
  _PURE
}

function do_list (list: any[], tw: any) {
  return MAP(list, function (node: any) {
    return node.transform(tw, true)
  })
}

var normalize_directives = function (body: any[]) {
  var in_directive = true

  for (var i = 0; i < body.length; i++) {
    const item = body[i]
    if (in_directive && item instanceof AST_Statement && item.body instanceof AST_String) {
      body[i] = new AST_Directive({
        start: body[i].start,
        end: body[i].end,
        value: item.body.value
      })
    } else if (in_directive && !(item instanceof AST_Statement && item.body instanceof AST_String)) {
      in_directive = false
    }
  }

  return body
}

var MOZ_TO_ME: any = {
  Program: function (M: any) {
    return new AST_Toplevel({
      start: my_start_token(M),
      end: my_end_token(M),
      body: normalize_directives((M.body as any[]).map(from_moz))
    })
  },
  ArrayPattern: function (M: any) {
    return new AST_Destructuring({
      start: my_start_token(M),
      end: my_end_token(M),
      names: M.elements.map(function (elm) {
        if (elm === null) {
          return new AST_Hole()
        }
        return from_moz(elm)
      }),
      is_array: true
    })
  },
  ObjectPattern: function (M: any) {
    return new AST_Destructuring({
      start: my_start_token(M),
      end: my_end_token(M),
      names: M.properties.map(from_moz),
      is_array: false
    })
  },
  AssignmentPattern: function (M: any) {
    return new AST_DefaultAssign({
      start: my_start_token(M),
      end: my_end_token(M),
      left: from_moz(M.left),
      operator: '=',
      right: from_moz(M.right)
    })
  },
  SpreadElement: function (M: any) {
    return new AST_Expansion({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.argument)
    })
  },
  RestElement: function (M: any) {
    return new AST_Expansion({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.argument)
    })
  },
  TemplateElement: function (M: any) {
    return new AST_TemplateSegment({
      start: my_start_token(M),
      end: my_end_token(M),
      value: M.value.cooked,
      raw: M.value.raw
    })
  },
  TemplateLiteral: function (M: any) {
    var segments: any[] = []
    const quasis = (M).quasis as any[]
    for (var i = 0; i < quasis.length; i++) {
      segments.push(from_moz(quasis[i]))
      if (M.expressions[i]) {
        segments.push(from_moz(M.expressions[i]))
      }
    }
    return new AST_TemplateString({
      start: my_start_token(M),
      end: my_end_token(M),
      segments: segments
    })
  },
  TaggedTemplateExpression: function (M: any) {
    return new AST_PrefixedTemplateString({
      start: my_start_token(M),
      end: my_end_token(M),
      template_string: from_moz((M).quasi),
      prefix: from_moz((M).tag)
    })
  },
  FunctionDeclaration: function (M: any) {
    return new AST_Defun({
      start: my_start_token(M),
      end: my_end_token(M),
      name: from_moz(M.id),
      argnames: M.params.map(from_moz),
      is_generator: M.generator,
      async: M.async,
      body: normalize_directives(from_moz(M.body).body)
    })
  },
  FunctionExpression: function (M: any) {
    return new AST_Function({
      start: my_start_token(M),
      end: my_end_token(M),
      name: from_moz(M.id),
      argnames: M.params.map(from_moz),
      is_generator: M.generator,
      async: M.async,
      body: normalize_directives(from_moz(M.body).body)
    })
  },
  ArrowFunctionExpression: function (M) {
    const body = M.body.type === 'BlockStatement'
      ? from_moz(M.body).body
      : [make_node(AST_Return, {}, { value: from_moz(M.body) })]
    return new AST_Arrow({
      start: my_start_token(M),
      end: my_end_token(M),
      argnames: M.params.map(from_moz),
      body,
      async: M.async
    })
  },
  ExpressionStatement: function (M) {
    return new AST_SimpleStatement({
      start: my_start_token(M),
      end: my_end_token(M),
      body: from_moz(M.expression)
    })
  },
  TryStatement: function (M) {
    var handlers = M.handlers || [M.handler]
    if (handlers.length > 1 || M.guardedHandlers && M.guardedHandlers.length) {
      throw new Error('Multiple catch clauses are not supported.')
    }
    return new AST_Try({
      start: my_start_token(M),
      end: my_end_token(M),
      body: from_moz(M.block).body,
      bcatch: from_moz(handlers[0]),
      bfinally: M.finalizer ? new AST_Finally(from_moz(M.finalizer)) : null
    })
  },
  Property: function (M) {
    var key = M.key
    var args: any = {
      start: my_start_token(key || M.value),
      end: my_end_token(M.value),
      key: key.type == 'Identifier' ? key.name : key.value,
      value: from_moz(M.value)
    }
    if (M.computed) {
      args.key = from_moz(M.key)
    }
    if (M.method) {
      args.is_generator = M.value.generator
      args.async = M.value.async
      if (!M.computed) {
        args.key = new AST_SymbolMethod({ name: args.key })
      } else {
        args.key = from_moz(M.key)
      }
      return new AST_ConciseMethod(args)
    }
    if (M.kind == 'init') {
      if (key.type != 'Identifier' && key.type != 'Literal') {
        args.key = from_moz(key)
      }
      return new AST_ObjectKeyVal(args)
    }
    if (typeof args.key === 'string' || typeof args.key === 'number') {
      args.key = new AST_SymbolMethod({
        name: args.key
      })
    }
    args.value = new AST_Accessor(args.value)
    if (M.kind == 'get') return new AST_ObjectGetter(args)
    if (M.kind == 'set') return new AST_ObjectSetter(args)
    if (M.kind == 'method') {
      args.async = M.value.async
      args.is_generator = M.value.generator
      args.quote = M.computed ? '"' : null
      return new AST_ConciseMethod(args)
    }
  },
  MethodDefinition: function (M) {
    var args: any = {
      start: my_start_token(M),
      end: my_end_token(M),
      key: M.computed ? from_moz(M.key) : new AST_SymbolMethod({ name: M.key.name || M.key.value }),
      value: from_moz(M.value),
      static: M.static
    }
    if (M.kind == 'get') {
      return new AST_ObjectGetter(args)
    }
    if (M.kind == 'set') {
      return new AST_ObjectSetter(args)
    }
    args.is_generator = M.value.generator
    args.async = M.value.async
    return new AST_ConciseMethod(args)
  },
  FieldDefinition: function (M) {
    let key
    if (M.computed) {
      key = from_moz(M.key)
    } else {
      if (M.key.type !== 'Identifier') throw new Error('Non-Identifier key in FieldDefinition')
      key = from_moz(M.key)
    }
    return new AST_ClassProperty({
      start: my_start_token(M),
      end: my_end_token(M),
      key,
      value: from_moz(M.value),
      static: M.static
    })
  },
  ArrayExpression: function (M) {
    return new AST_Array({
      start: my_start_token(M),
      end: my_end_token(M),
      elements: M.elements.map(function (elem) {
        return elem === null ? new AST_Hole() : from_moz(elem)
      })
    })
  },
  ObjectExpression: function (M) {
    return new AST_Object({
      start: my_start_token(M),
      end: my_end_token(M),
      properties: M.properties.map(function (prop) {
        if (prop.type === 'SpreadElement') {
          return from_moz(prop)
        }
        prop.type = 'Property'
        return from_moz(prop)
      })
    })
  },
  SequenceExpression: function (M) {
    return new AST_Sequence({
      start: my_start_token(M),
      end: my_end_token(M),
      expressions: M.expressions.map(from_moz)
    })
  },
  MemberExpression: function (M) {
    return new (M.computed ? AST_Sub : AST_Dot)({
      start: my_start_token(M),
      end: my_end_token(M),
      property: M.computed ? from_moz(M.property) : M.property.name,
      expression: from_moz(M.object)
    })
  },
  SwitchCase: function (M) {
    return new (M.test ? AST_Case : AST_Default)({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.test),
      body: M.consequent.map(from_moz)
    })
  },
  VariableDeclaration: function (M) {
    return new (M.kind === 'const' ? AST_Const
      : M.kind === 'let' ? AST_Let : AST_Var)({
      start: my_start_token(M),
      end: my_end_token(M),
      definitions: M.declarations.map(from_moz)
    })
  },

  ImportDeclaration: function (M) {
    var imported_name = null
    var imported_names: any[] | null = null
    M.specifiers.forEach(function (specifier) {
      if (specifier.type === 'ImportSpecifier') {
        if (!imported_names) { imported_names = [] }
        imported_names.push(new AST_NameMapping({
          start: my_start_token(specifier),
          end: my_end_token(specifier),
          foreign_name: from_moz(specifier.imported),
          name: from_moz(specifier.local)
        }))
      } else if (specifier.type === 'ImportDefaultSpecifier') {
        imported_name = from_moz(specifier.local)
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        if (!imported_names) { imported_names = [] }
        imported_names.push(new AST_NameMapping({
          start: my_start_token(specifier),
          end: my_end_token(specifier),
          foreign_name: new AST_SymbolImportForeign({ name: '*' }),
          name: from_moz(specifier.local)
        }))
      }
    })
    return new AST_Import({
      start: my_start_token(M),
      end: my_end_token(M),
      imported_name: imported_name,
      imported_names: imported_names,
      module_name: from_moz(M.source)
    })
  },
  ExportAllDeclaration: function (M) {
    return new AST_Export({
      start: my_start_token(M),
      end: my_end_token(M),
      exported_names: [
        new AST_NameMapping({
          name: new AST_SymbolExportForeign({ name: '*' }),
          foreign_name: new AST_SymbolExportForeign({ name: '*' })
        })
      ],
      module_name: from_moz(M.source)
    })
  },
  ExportNamedDeclaration: function (M) {
    return new AST_Export({
      start: my_start_token(M),
      end: my_end_token(M),
      exported_definition: from_moz(M.declaration),
      exported_names: M.specifiers && M.specifiers.length ? M.specifiers.map(function (specifier) {
        return new AST_NameMapping({
          foreign_name: from_moz(specifier.exported),
          name: from_moz(specifier.local)
        })
      }) : null,
      module_name: from_moz(M.source)
    })
  },
  ExportDefaultDeclaration: function (M) {
    return new AST_Export({
      start: my_start_token(M),
      end: my_end_token(M),
      exported_value: from_moz(M.declaration),
      is_default: true
    })
  },
  Literal: function (M) {
    var val = M.value; var args: any = {
      start: my_start_token(M),
      end: my_end_token(M)
    }
    var rx = M.regex
    if (rx && rx.pattern) {
      // RegExpLiteral as per ESTree AST spec
      args.value = {
        source: rx.pattern,
        flags: rx.flags
      }
      return new AST_RegExp(args)
    } else if (rx) {
      // support legacy RegExp
      const rx_source = M.raw || val
      const match = rx_source.match(/^\/(.*)\/(\w*)$/)
      if (!match) throw new Error('Invalid regex source ' + rx_source)
      const [, source, flags] = match
      args.value = { source, flags }
      return new AST_RegExp(args)
    }
    if (val === null) return new AST_Null(args)
    switch (typeof val) {
      case 'string':
        args.value = val
        return new AST_String(args)
      case 'number':
        args.value = val
        return new AST_Number(args)
      case 'boolean':
        return new (val ? AST_True : AST_False)(args)
    }
  },
  MetaProperty: function (M) {
    if (M.meta.name === 'new' && M.property.name === 'target') {
      return new AST_NewTarget({
        start: my_start_token(M),
        end: my_end_token(M)
      })
    }
  },
  Identifier: function (M) {
    var p = FROM_MOZ_STACK?.[FROM_MOZ_STACK.length - 2]
    return new (p.type == 'LabeledStatement' ? AST_Label
      : p.type == 'VariableDeclarator' && p.id === M ? (p.kind == 'const' ? AST_SymbolConst : p.kind == 'let' ? AST_SymbolLet : AST_SymbolVar)
        : /Import.*Specifier/.test(p.type) ? (p.local === M ? AST_SymbolImport : AST_SymbolImportForeign)
          : p.type == 'ExportSpecifier' ? (p.local === M ? AST_SymbolExport : AST_SymbolExportForeign)
            : p.type == 'FunctionExpression' ? (p.id === M ? AST_SymbolLambda : AST_SymbolFunarg)
              : p.type == 'FunctionDeclaration' ? (p.id === M ? AST_SymbolDefun : AST_SymbolFunarg)
                : p.type == 'ArrowFunctionExpression' ? (p.params.includes(M)) ? AST_SymbolFunarg : AST_SymbolRef
                  : p.type == 'ClassExpression' ? (p.id === M ? AST_SymbolClass : AST_SymbolRef)
                    : p.type == 'Property' ? (p.key === M && p.computed || p.value === M ? AST_SymbolRef : AST_SymbolMethod)
                      : p.type == 'FieldDefinition' ? (p.key === M && p.computed || p.value === M ? AST_SymbolRef : AST_SymbolClassProperty)
                        : p.type == 'ClassDeclaration' ? (p.id === M ? AST_SymbolDefClass : AST_SymbolRef)
                          : p.type == 'MethodDefinition' ? (p.computed ? AST_SymbolRef : AST_SymbolMethod)
                            : p.type == 'CatchClause' ? AST_SymbolCatch
                              : p.type == 'BreakStatement' || p.type == 'ContinueStatement' ? AST_LabelRef
                                : AST_SymbolRef)({
      start: my_start_token(M),
      end: my_end_token(M),
      name: M.name
    })
  },
  BigIntLiteral (M) {
    return new AST_BigInt({
      start: my_start_token(M),
      end: my_end_token(M),
      value: M.value
    })
  },
  UpdateExpression: To_Moz_Unary,
  UnaryExpression: To_Moz_Unary,
  ClassDeclaration: From_Moz_Class,
  ClassExpression: From_Moz_Class,

  EmptyStatement: M => new AST_EmptyStatement({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  BlockStatement: M => new AST_BlockStatement({
    start: my_start_token(M),
    end: my_end_token(M),
    body: M.body.map(from_moz)
  }),
  IfStatement: M => new AST_If({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.consequent),
    alternative: from_moz(M.alternate)
  }),
  LabeledStatement: M => new AST_LabeledStatement({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label),
    body: from_moz(M.body)
  }),
  BreakStatement: M => new AST_Break({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label)
  }),
  ContinueStatement: M => new AST_Continue({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label)
  }),
  WithStatement: M => new AST_With({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.object),
    body: from_moz(M.body)
  }),
  SwitchStatement: M => new AST_Switch({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.discriminant),
    body: M.cases.map(from_moz)
  }),
  ReturnStatement: M => new AST_Return({
    start: my_start_token(M),
    end: my_end_token(M),
    value: from_moz(M.argument)
  }),
  ThrowStatement: M => new AST_Throw({
    start: my_start_token(M),
    end: my_end_token(M),
    value: from_moz(M.argument)
  }),
  WhileStatement: M => new AST_While({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.body)
  }),
  DoWhileStatement: M => new AST_Do({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.body)
  }),
  ForStatement: M => new AST_For({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.init),
    condition: from_moz(M.test),
    step: from_moz(M.update),
    body: from_moz(M.body)
  }),
  ForInStatement: M => new AST_ForIn({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.left),
    object: from_moz(M.right),
    body: from_moz(M.body)
  }),
  ForOfStatement: M => new AST_ForOf({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.left),
    object: from_moz(M.right),
    body: from_moz(M.body),
    await: M.await
  }),
  AwaitExpression: M => new AST_Await({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.argument)
  }),
  YieldExpression: M => new AST_Yield({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.argument),
    is_star: M.delegate
  }),
  DebuggerStatement: M => new AST_Debugger({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  VariableDeclarator: M => new AST_VarDef({
    start: my_start_token(M),
    end: my_end_token(M),
    name: from_moz(M.id),
    value: from_moz(M.init)
  }),
  CatchClause: M => new AST_Catch({
    start: my_start_token(M),
    end: my_end_token(M),
    argname: from_moz(M.param),
    body: from_moz(M.body).body
  }),
  ThisExpression: M => new AST_This({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  Super: M => new AST_Super({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  BinaryExpression: M => new AST_Binary({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  LogicalExpression: M => new AST_Binary({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  AssignmentExpression: M => new AST_Assign({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  ConditionalExpression: M => new AST_Conditional({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    consequent: from_moz(M.consequent),
    alternative: from_moz(M.alternate)
  }),
  NewExpression: M => new AST_New({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.callee),
    args: M.arguments.map(from_moz)
  }),
  CallExpression: M => new AST_Call({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.callee),
    args: M.arguments.map(from_moz)
  })
}

function To_Moz_Unary (M) {
  var prefix = 'prefix' in M ? M.prefix
    : M.type == 'UnaryExpression'
  return new (prefix ? AST_UnaryPrefix : AST_UnaryPostfix)({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    expression: from_moz(M.argument)
  })
}

function From_Moz_Class (M) {
  return new (M.type === 'ClassDeclaration' ? AST_DefClass : AST_ClassExpression)({
    start: my_start_token(M),
    end: my_end_token(M),
    name: from_moz(M.id),
    extends: from_moz(M.superClass),
    properties: M.body.body.map(from_moz)
  })
}

/* -----[ tools ]----- */

function raw_token (moznode) {
  if (moznode.type == 'Literal') {
    return moznode.raw != null ? moznode.raw : moznode.value + ''
  }
}

function my_start_token (moznode: any) {
  var loc = moznode.loc; var start = loc && loc.start
  var range = moznode.range
  return new AST_Token({
    file: loc && loc.source,
    line: start && start.line,
    col: start && start.column,
    pos: range ? range[0] : moznode.start,
    endline: start && start.line,
    endcol: start && start.column,
    endpos: range ? range[0] : moznode.start,
    raw: raw_token(moznode)
  })
}

function my_end_token (moznode) {
  var loc = moznode.loc; var end = loc && loc.end
  var range = moznode.range
  return new AST_Token({
    file: loc && loc.source,
    line: end && end.line,
    col: end && end.column,
    pos: range ? range[1] : moznode.end,
    endline: end && end.line,
    endcol: end && end.column,
    endpos: range ? range[1] : moznode.end,
    raw: raw_token(moznode)
  })
}

var FROM_MOZ_STACK = []

function from_moz (node) {
    FROM_MOZ_STACK?.push(node)
    var ret = node != null ? MOZ_TO_ME[node.type](node) : null
    FROM_MOZ_STACK?.pop()
    return ret
}

function set_moz_loc (mynode: any, moznode) {
  var start = mynode.start
  var end = mynode.end
  if (!(start && end)) {
    return moznode
  }
  if (start.pos != null && end.endpos != null) {
    moznode.range = [start.pos, end.endpos]
  }
  if (start.line) {
    moznode.loc = {
      start: { line: start.line, column: start.col },
      end: end.endline ? { line: end.endline, column: end.endcol } : null
    }
    if (start.file) {
      moznode.loc.source = start.file
    }
  }
  return moznode
}

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

function print (this: any, output: any, force_parens: boolean) {
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
  if (p instanceof AST_PropAccess && p.expression === this) { return true }
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

function print_braced_empty (self: any, output: any) {
  output.print('{')
  output.with_indent(output.next_indent(), function () {
    output.append_comments(self, true)
  })
  output.print('}')
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

function print_property_name (key: string, quote: string, output: any) {
  if (output.option('quote_keys')) {
    return output.print_string(key)
  }
  if ('' + +key == key && Number(key) >= 0) {
    if (output.option('keep_numbers')) {
      return output.print(key)
    }
    return output.print(make_num(Number(key)))
  }
  var print_string = RESERVED_WORDS.has(key)
    ? output.option('ie8')
    : (
      output.option('ecma') < 2015
        ? !is_basic_identifier_string(key)
        : !is_identifier_string(key, true)
    )
  if (print_string || (quote && output.option('keep_quoted_props'))) {
    return output.print_string(key, quote)
  }
  return output.print_name(key)
}

const r_slash_script = /(<\s*\/\s*script)/i
const slash_script_replace = (_: any, $1: string) => $1.replace('/', '\\/')

function force_statement (stat: any, output: any) {
  if (output.option('braces')) {
    make_block(stat, output)
  } else {
    if (!stat || stat instanceof AST_EmptyStatement) { output.force_semicolon() } else { stat.print(output) }
  }
}

function best_of (a: string[]) {
  var best = a[0]; var len = best.length
  for (var i = 1; i < a.length; ++i) {
    if (a[i].length < len) {
      best = a[i]
      len = best.length
    }
  }
  return best
}

function make_num (num: number) {
  var str = num.toString(10).replace(/^0\./, '.').replace('e+', 'e')
  var candidates = [str]
  if (Math.floor(num) === num) {
    if (num < 0) {
      candidates.push('-0x' + (-num).toString(16).toLowerCase())
    } else {
      candidates.push('0x' + num.toString(16).toLowerCase())
    }
  }
  var match: RegExpExecArray | null, len, digits
  if (match = /^\.0+/.exec(str)) {
    len = match[0].length
    digits = str.slice(len)
    candidates.push(digits + 'e-' + (digits.length + len - 1))
  } else if (match = /0+$/.exec(str)) {
    len = match[0].length
    candidates.push(str.slice(0, -len) + 'e' + len)
  } else if (match = /^(\d)\.(\d+)e(-?\d+)$/.exec(str)) {
    candidates.push(match[1] + match[2] + 'e' + (Number(match[3]) - match[2].length))
  }
  return best_of(candidates)
}

function make_block (stmt: any, output: any) {
  if (!stmt || stmt instanceof AST_EmptyStatement) { output.print('{}') } else if (stmt instanceof AST_BlockStatement) { stmt.print?.(output) } else {
    output.with_block(function () {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  }
}

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

AST_PropAccess.DEFMETHOD('flatten_object', function (key, compressor) {
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
        return make_node(AST_Sub, this, {
          expression: make_node(AST_Array, expr, {
            elements: props.map(function (prop) {
              var v = prop.value
              if (v instanceof AST_Accessor) v = make_node(AST_Function, v, v)
              var k = prop.key
              if (k instanceof AST_Node && !(k instanceof AST_SymbolMethod)) {
                return make_sequence(prop, [k, v])
              }
              return v
            })
          }),
          property: make_node(AST_Number, this, {
            value: i
          })
        })
      }
    }
  }
})

export function safe_to_flatten (value, compressor) {
  if (value instanceof AST_SymbolRef) {
    value = value.fixed_value()
  }
  if (!value) return false
  if (!(value instanceof AST_Lambda || value instanceof AST_Class)) return true
  if (!(value instanceof AST_Lambda && value.contains_this())) return true
  return compressor.parent() instanceof AST_New
}

export function make_sequence (orig, expressions) {
  if (expressions.length == 1) return expressions[0]
  if (expressions.length == 0) throw new Error('trying to create a sequence with length zero!')
  return make_node(AST_Sequence, orig, {
    expressions: expressions.reduce(merge_sequence, [])
  })
}

export function merge_sequence (array, node) {
  if (node instanceof AST_Sequence) {
    array.push(...node.expressions)
  } else {
    array.push(node)
  }
  return array
}

AST_Lambda.DEFMETHOD('contains_this', function () {
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
})

AST_Binary.DEFMETHOD('lift_sequences', function (compressor: any) {
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
})

AST_Unary.DEFMETHOD('lift_sequences', function (compressor: any) {
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
})

AST_Definitions.DEFMETHOD('to_assignments', function (compressor: any) {
  var reduce_vars = compressor.option('reduce_vars')
  var assignments = this.definitions.reduce(function (a, def) {
    if (def.value && !(def.name instanceof AST_Destructuring)) {
      var name = make_node(AST_SymbolRef, def.name, def.name)
      a.push(make_node(AST_Assign, def, {
        operator: '=',
        left: name,
        right: def.value
      }))
      if (reduce_vars) name.definition().fixed = false
    } else if (def.value) {
      // Because it's a destructuring, do not turn into an assignment.
      var varDef = make_node(AST_VarDef, def, {
        name: def.name,
        value: def.value
      })
      var var_ = make_node(AST_Var, def, {
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
})

AST_Definitions.DEFMETHOD('remove_initializers', function () {
  var decls: any[] = []
  this.definitions.forEach(function (def) {
    if (def.name instanceof AST_SymbolDeclaration) {
      def.value = null
      decls.push(def)
    } else {
      walk(def.name, (node: any) => {
        if (node instanceof AST_SymbolDeclaration) {
          decls.push(make_node(AST_VarDef, def, {
            name: node,
            value: null
          }))
        }
      })
    }
  })
  this.definitions = decls
})

AST_Scope.DEFMETHOD('drop_unused', function (compressor: any) {
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
  var scope = this
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
            return in_list ? MAP.skip : make_node(AST_Number, node, {
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
      if ((node instanceof AST_Defun || node instanceof AST_DefClass) && node !== self) {
        const def = node.name?.definition?.()
        const keep = def.global && !drop_funcs || in_use_ids.has(def.id)
        if (!keep) {
          compressor[node.name?.unreferenced() ? 'warn' : 'info']('Dropping unused function {name} [{file}:{line},{col}]', template(node.name))
          def.eliminated++
          if (node instanceof AST_DefClass) {
            // Classes might have extends with side effects
            const side_effects = node.drop_side_effect_free(compressor)
            if (side_effects) {
              return make_node(AST_SimpleStatement, node, {
                body: side_effects
              })
            }
          }
          return in_list ? MAP.skip : make_node(AST_EmptyStatement, node)
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
                  var ref = make_node(AST_SymbolRef, def.name, def.name)
                  sym.references.push(ref)
                  var assign = make_node(AST_Assign, def, {
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
                  body.push(make_node(AST_SimpleStatement, node, {
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
          body.push(make_node(AST_SimpleStatement, node, {
            body: make_sequence(node, side_effects)
          }))
        }
        switch (body.length) {
          case 0:
            return in_list ? MAP.skip : make_node(AST_EmptyStatement, node)
          case 1:
            return body[0]
          default:
            return in_list ? MAP.splice(body) : make_node(AST_BlockStatement, node, {
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
})

AST_Scope.DEFMETHOD('hoist_declarations', function (compressor: any) {
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
            return make_node(AST_EmptyStatement, node)
          }
          if (hoist_funs && node instanceof AST_Defun &&
                        !(tt.parent() instanceof AST_Export) &&
                        tt.parent() === self) {
            hoisted.push(node)
            return make_node(AST_EmptyStatement, node)
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
                return make_node(AST_SymbolRef, def, def)
              }
              return seq
            }
            if (p instanceof AST_For && p.init === node) {
              return seq
            }
            if (!seq) return make_node(AST_EmptyStatement, node)
            return make_node(AST_SimpleStatement, node, {
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
      const args_as_names = is_lambda ? self.args_as_names() : null
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
        defs = make_node(AST_Var, self, {
          definitions: defs
        })
        hoisted.push(defs)
      }
    }
    self.body = dirs.concat(hoisted, self.body)
  }
  return self
})

AST_Scope.DEFMETHOD('make_var_name', function (prefix) {
  var var_names = this.var_names()
  prefix = prefix.replace(/(?:^[^a-z_$]|[^a-z0-9_$])/ig, '_')
  var name = prefix
  for (var i = 0; var_names.has(name); i++) name = prefix + '$' + i
  this.add_var_name(name)
  return name
})

AST_Scope.DEFMETHOD('hoist_properties', function (compressor: any) {
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
          assignments.push(make_node(AST_VarDef, node, {
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
        const sym = make_node(AST_SymbolRef, node, {
          name: def.name,
          scope: node.expression.scope,
          thedef: def
        })
        sym.reference({})
        return sym
      }
    }

    function make_sym (sym: any | any, key: string, defs: Map<string, any>) {
      const new_var = make_node(sym.CTOR, sym, {
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
})

// we shouldn't compress (1,func)(something) to
// func(something) because that changes the meaning of
// the func (becomes lexical instead of global).
export function maintain_this_binding (parent, orig, val) {
  if (parent instanceof AST_UnaryPrefix && parent.operator == 'delete' ||
        parent instanceof AST_Call && parent.expression === orig &&
            (val instanceof AST_PropAccess || val instanceof AST_SymbolRef && val.name == 'eval')) {
    return make_sequence(orig, [make_node(AST_Number, orig, { value: 0 }), val])
  }
  return val
}

export function is_empty (thing) {
  if (thing === null) return true
  if (thing instanceof AST_EmptyStatement) return true
  if (thing instanceof AST_BlockStatement) return thing.body.length == 0
  return false
}

export function can_be_evicted_from_block (node: any) {
  return !(
    node instanceof AST_DefClass ||
        node instanceof AST_Defun ||
        node instanceof AST_Let ||
        node instanceof AST_Const ||
        node instanceof AST_Export ||
        node instanceof AST_Import
  )
}
export function is_ref_of (ref, type) {
  if (!(ref instanceof AST_SymbolRef)) return false
  var orig = ref.definition?.().orig
  for (var i = orig.length; --i >= 0;) {
    if (orig[i] instanceof type) return true
  }
}

export function get_value (key) {
  if (key instanceof AST_Constant) {
    return key.getValue()
  }
  if (key instanceof AST_UnaryPrefix &&
        key.operator == 'void' &&
        key.expression instanceof AST_Constant) {
    return
  }
  return key
}

AST_Node.DEFMETHOD('is_call_pure', return_false)
AST_Dot.DEFMETHOD('is_call_pure', function (compressor: any) {
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
})

AST_Call.DEFMETHOD('is_expr_pure', function (compressor: any) {
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
})

export function is_undeclared_ref (node: any) {
  return node instanceof AST_SymbolRef && node.definition?.().undeclared
}

AST_SymbolRef.DEFMETHOD('is_declared', function (compressor: any) {
  return !this.definition?.().undeclared ||
        compressor.option('unsafe') && global_names.has(this.name)
})

// methods to evaluate a constant expression
// If the node has been successfully reduced to a constant,
// then its value is returned; otherwise the element itself
// is returned.
// They can be distinguished as constant value is never a
// descendant of AST_Node.
AST_Node.DEFMETHOD('evaluate', function (compressor: any) {
  if (!compressor.option('evaluate')) return this
  var val = this._eval(compressor, 1)
  if (!val || val instanceof RegExp) return val
  if (typeof val === 'function' || typeof val === 'object') return this
  return val
})
AST_Node.DEFMETHOD('is_constant', function () {
  // Accomodate when compress option evaluate=false
  // as well as the common constant expressions !0 and -1
  if (this instanceof AST_Constant) {
    return !(this instanceof AST_RegExp)
  } else {
    return this instanceof AST_UnaryPrefix &&
            this.expression instanceof AST_Constant &&
            unaryPrefix.has(this.operator)
  }
})

AST_Toplevel.DEFMETHOD('resolve_defines', function (compressor: any) {
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
})

export function is_lhs (node, parent) {
  if (parent instanceof AST_Unary && unary_side_effects.has(parent.operator)) return parent.expression
  if (parent instanceof AST_Assign && parent.left === node) return node
}

// may_throw_on_access()
// returns true if this node may be null, undefined or contain `AST_Accessor`
AST_Node.DEFMETHOD('may_throw_on_access', function (compressor: any) {
  return !compressor.option('pure_getters') ||
        this._dot_throw(compressor)
})

AST_Symbol.DEFMETHOD('fixed_value', function () {
  var fixed = this.thedef.fixed
  if (!fixed || fixed instanceof AST_Node) return fixed
  return fixed()
})

AST_SymbolRef.DEFMETHOD('is_immutable', function () {
  var orig = this.definition?.().orig
  return orig.length == 1 && orig[0] instanceof AST_SymbolLambda
})

AST_Toplevel.DEFMETHOD('reset_opt_flags', function (compressor: any) {
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
})

AST_Node.DEFMETHOD('equivalent_to', function (node: any) {
  return equivalent_to(this, node)
})

AST_Scope.DEFMETHOD('process_expression', function (insert, compressor) {
  var self = this
  var tt = new TreeTransformer(function (node: any) {
    if (insert && node instanceof AST_SimpleStatement) {
      return make_node(AST_Return, node, {
        value: node.body
      })
    }
    if (!insert && node instanceof AST_Return) {
      if (compressor) {
        var value = node.value && node.value.drop_side_effect_free?.(compressor, true)
        return value ? make_node(AST_SimpleStatement, node, {
          body: value
        }) : make_node(AST_EmptyStatement, node)
      }
      return make_node(AST_SimpleStatement, node, {
        body: node.value || make_node(AST_UnaryPrefix, node, {
          operator: 'void',
          expression: make_node(AST_Number, node, {
            value: 0
          })
        })
      })
    }
    if (node instanceof AST_Class || node instanceof AST_Lambda && node !== self) {
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
})

AST_Toplevel.DEFMETHOD('drop_console', function () {
  return this.transform(new TreeTransformer(function (self) {
    if (self.TYPE == 'Call') {
      var exp = self.expression
      if (exp instanceof AST_PropAccess) {
        var name = exp.expression
        while (name.expression) {
          name = name.expression
        }
        if (is_undeclared_ref(name) && name.name == 'console') {
          return make_node(AST_Undefined, self)
        }
      }
    }
  }))
})
