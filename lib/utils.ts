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
  walk_abort,
  UNDEFINED,
  has_flag,
  pure_prop_access_globals,
  _NOINLINE,
  clear_flag,
  WRITE_ONLY,
  unary_side_effects,
  lazy_op
} from './constants'
import {
  AST_Accessor,
  AST_Array,
  AST_Arrow,
  AST_Assign,
  AST_Await,
  AST_BigInt,
  AST_Binary,
  AST_Block,
  AST_BlockStatement,
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
  AST_Statement,
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
  AST_Label,
  AST_LabeledStatement,
  AST_LabelRef,
  AST_Let,
  AST_Lambda,
  AST_LoopControl,
  AST_NameMapping,
  AST_NaN,
  AST_New,
  AST_NewTarget,
  AST_Null,
  AST_Number,
  AST_Node,
  AST_Object,
  AST_ObjectGetter,
  AST_ObjectKeyVal,
  AST_ObjectSetter,
  AST_PrefixedTemplateString,
  AST_PropAccess,
  AST_RegExp,
  AST_Return,
  AST_Scope,
  AST_Sequence,
  AST_SimpleStatement,
  AST_String,
  AST_Sub,
  AST_Super,
  AST_Switch,
  AST_Symbol,
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
  AST_Yield
} from './ast'

import TreeTransformer from './tree-transformer'
import TreeWalker from './tree-walker'

const AST_DICT = {
  AST_Accessor,
  AST_Array,
  AST_Arrow,
  AST_Assign,
  AST_Await,
  AST_BigInt,
  AST_Binary,
  AST_BlockStatement,
  AST_Break,
  AST_Call,
  AST_Case,
  AST_Catch,
  AST_ClassExpression,
  AST_ClassProperty,
  AST_ConciseMethod,
  AST_Conditional,
  AST_Const,
  AST_Continue,
  AST_Debugger,
  AST_Default,
  AST_DefaultAssign,
  AST_DefClass,
  AST_Statement,
  AST_Defun,
  AST_Destructuring,
  AST_Directive,
  AST_Do,
  AST_Dot,
  AST_EmptyStatement,
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
  AST_Label,
  AST_LabeledStatement,
  AST_LabelRef,
  AST_Let,
  AST_NameMapping,
  AST_NaN,
  AST_New,
  AST_NewTarget,
  AST_Null,
  AST_Number,
  AST_Object,
  AST_ObjectGetter,
  AST_ObjectKeyVal,
  AST_ObjectSetter,
  AST_PrefixedTemplateString,
  AST_RegExp,
  AST_Return,
  AST_Sequence,
  AST_SimpleStatement,
  AST_String,
  AST_Sub,
  AST_Super,
  AST_Switch,
  AST_SymbolCatch,
  AST_SymbolClass,
  AST_SymbolClassProperty,
  AST_SymbolConst,
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
  AST_UnaryPostfix,
  AST_UnaryPrefix,
  AST_Undefined,
  AST_Var,
  AST_VarDef,
  AST_While,
  AST_With,
  AST_Yield
}

class AtTop {
  v: any
  constructor (val: any) {
    this.v = val
  }
}

class Splice {
  v: any
  constructor (val: any) {
    this.v = val
  }
}

class Last {
  v: any
  constructor (val: any) {
    this.v = val
  }
}

function characters (str: string) {
  return str.split('')
}

function member<T> (name: T, array: T[]) {
  return array.includes(name)
}

export class DefaultsError extends Error {
  defs: any
  constructor (msg: string, defs: any) {
    super()

    this.name = 'DefaultsError'
    this.message = msg
    this.defs = defs
  }
}

function defaults (args: any, defs: AnyObject, croak?: boolean): typeof args {
  if (args === true) { args = {} }
  const ret = args || {}
  if (croak) {
    for (const i in ret) {
      if (HOP(ret, i) && !HOP(defs, i)) { throw new DefaultsError('`' + i + '` is not a supported option', defs) }
    }
  }
  for (const i in defs) {
    if (HOP(defs, i)) {
      if (!args || !HOP(args, i)) {
        ret[i] = defs[i]
      } else if (i === 'ecma') {
        let ecma = args[i] | 0
        if (ecma > 5 && ecma < 2015) ecma += 2009
        ret[i] = ecma
      } else {
        ret[i] = (args && HOP(args, i)) ? args[i] : defs[i]
      }
    }
  }
  return ret
}

function noop () {}
function return_false () { return false }
function return_true () { return true }
function return_this () { return this }
function return_null () { return null }

var MAP = (function () {
  function MAP (a: any[] | AnyObject, f: Function, backwards?: boolean) {
    var ret: any[] = []; var top: any[] = []; var i: string | number
    function doit () {
      var val: any = f((a as any)[i], i)
      var is_last = val instanceof Last
      if (is_last) val = val.v
      if (val instanceof AtTop) {
        val = val.v
        if (val instanceof Splice) {
          top.push.apply(top, backwards ? val.v.slice().reverse() : val.v)
        } else {
          top.push(val)
        }
      } else if (val !== skip) {
        if (val instanceof Splice) {
          ret.push.apply(ret, backwards ? val.v.slice().reverse() : val.v)
        } else {
          ret.push(val)
        }
      }
      return is_last
    }
    if (Array.isArray(a)) {
      if (backwards) {
        for (i = a.length; --i >= 0;) if (doit()) break
        ret.reverse()
        top.reverse()
      } else {
        for (i = 0; i < a.length; ++i) if (doit()) break
      }
    } else {
      for (i in a) if (HOP(a, i)) if (doit()) break
    }
    return top.concat(ret)
  }
  MAP.at_top = function (val: any) { return new AtTop(val) }
  MAP.splice = function (val: any) { return new Splice(val) }
  MAP.last = function (val: any) { return new Last(val) }
  var skip = MAP.skip = {}
  return MAP
})()

function make_node (ctor: string, orig?: any, props?: any) {
  if (!props) props = {}
  if (orig) {
    if (!props.start) props.start = orig.start
    if (!props.end) props.end = orig.end
  }
  return new AST_DICT[ctor](props)
}

function push_uniq<T> (array: T[], el: T) {
  if (!array.includes(el)) { array.push(el) }
}

function string_template (text: string, props?: AnyObject) {
  return text.replace(/{(.+?)}/g, function (_, p) {
    return props && props[p]
  })
}

function remove<T = any> (array: T[], el: T) {
  for (var i = array.length; --i >= 0;) {
    if (array[i] === el) array.splice(i, 1)
  }
}

function mergeSort<T> (array: T[], cmp: (a: T, b: T) => number): T[] {
  if (array.length < 2) return array.slice()
  function merge (a: T[], b: T[]) {
    var r: T[] = []; var ai = 0; var bi = 0; var i = 0
    while (ai < a.length && bi < b.length) {
      cmp(a[ai], b[bi]) <= 0
        ? r[i++] = a[ai++]
        : r[i++] = b[bi++]
    }
    if (ai < a.length) r.push.apply(r, a.slice(ai))
    if (bi < b.length) r.push.apply(r, b.slice(bi))
    return r
  }
  function _ms (a: any[]) {
    if (a.length <= 1) { return a }
    var m = Math.floor(a.length / 2); var left = a.slice(0, m); var right = a.slice(m)
    left = _ms(left)
    right = _ms(right)
    return merge(left, right)
  }
  return _ms(array)
}

function makePredicate (words: string | string[]) {
  if (!Array.isArray(words)) words = words.split(' ')

  return new Set(words)
}

function map_add (map: Map<string, any[]>, key: string, value: any) {
  if (map.has(key)) {
        map.get(key)?.push(value)
  } else {
    map.set(key, [value])
  }
}

function map_from_object (obj: AnyObject) {
  var map = new Map()
  for (var key in obj) {
    if (HOP(obj, key) && key.charAt(0) === '$') {
      map.set(key.substr(1), obj[key])
    }
  }
  return map
}

function map_to_object (map: Map<any, any>) {
  var obj = Object.create(null)
  map.forEach(function (value, key) {
    obj['$' + key] = value
  })
  return obj
}

function HOP (obj: AnyObject, prop: string) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

function keep_name (keep_setting: boolean | RegExp | undefined, name: string) {
  return keep_setting === true ||
        (keep_setting instanceof RegExp && keep_setting.test(name))
}

var lineTerminatorEscape: AnyObject<string> = {
  '\n': 'n',
  '\r': 'r',
  '\u2028': 'u2028',
  '\u2029': 'u2029'
}
function regexp_source_fix (source: string) {
  // V8 does not escape line terminators in regexp patterns in node 12
  return source.replace(/[\n\r\u2028\u2029]/g, function (match, offset) {
    var escaped = source[offset - 1] == '\\' &&
            (source[offset - 2] != '\\' ||
            /(?:^|[^\\])(?:\\{2})*$/.test(source.slice(0, offset - 1)))
    return (escaped ? '' : '\\') + lineTerminatorEscape[match]
  })
}
const all_flags = 'gimuy'
function sort_regexp_flags (flags: string) {
  const existing_flags = new Set(flags.split(''))
  let out = ''
  for (const flag of all_flags) {
    if (existing_flags.has(flag)) {
      out += flag
      existing_flags.delete(flag)
    }
  }
  if (existing_flags.size) {
    // Flags Terser doesn't know about
    existing_flags.forEach(flag => { out += flag })
  }
  return out
}

function set_annotation (node: any, annotation: number) {
  node._annotations |= annotation
}

export {
  characters,
  defaults,
  HOP,
  keep_name,
  make_node,
  makePredicate,
  map_add,
  map_from_object,
  map_to_object,
  MAP,
  member,
  mergeSort,
  noop,
  push_uniq,
  regexp_source_fix,
  remove,
  return_false,
  return_null,
  return_this,
  return_true,
  sort_regexp_flags,
  string_template,
  set_annotation
}

export function convert_to_predicate (obj) {
  const out = new Map()
  for (var key of Object.keys(obj)) {
    out.set(key, makePredicate(obj[key]))
  }
  return out
}

export function has_annotation (node: any, annotation: number) {
  return node._annotations & annotation
}

export function warn (compressor, node) {
  compressor.warn('global_defs ' + node.print_to_string() + ' redefined [{file}:{line},{col}]', node.start)
}

export function is_strict (compressor) {
  const optPureGettters = compressor.option('pure_getters')
  return typeof optPureGettters === 'string' && optPureGettters.includes('strict')
}

export function push (tw) {
  tw.safe_ids = Object.create(tw.safe_ids)
}

export function pop (tw) {
  tw.safe_ids = Object.getPrototypeOf(tw.safe_ids)
}

export function mark (tw, def, safe) {
  tw.safe_ids[def.id] = safe
}

export function walk_parent (node: any, cb: Function, initial_stack?: any[]) {
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

export function set_moz_loc (mynode: any, moznode) {
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

export let FROM_MOZ_STACK = []

export function from_moz (node) {
    FROM_MOZ_STACK?.push(node)
    var ret = node != null ? MOZ_TO_ME[node.type](node) : null
    FROM_MOZ_STACK?.pop()
    return ret
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
      : [make_node('AST_Return', {}, { value: from_moz(M.body) })]
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
        return new (val ? AST_True : AST_False as any)(args)
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

export function my_start_token (moznode: any) {
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

export function my_end_token (moznode) {
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

export const normalize_directives = function (body: any[]) {
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

export function raw_token (moznode) {
  if (moznode.type == 'Literal') {
    return moznode.raw != null ? moznode.raw : moznode.value + ''
  }
}

export function To_Moz_Unary (M) {
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

export function setFromMozStack (val) {
  FROM_MOZ_STACK = val
}

export const pass_through = () => true

// Creates a shallow compare function
export const mkshallow = (props) => {
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

  return new Function('other', 'return ' + comparisons) as any
}

export function to_moz (node: any | null) {
  if (TO_MOZ_STACK === null) { TO_MOZ_STACK = [] }
  TO_MOZ_STACK.push(node)
  var ast = node != null ? node.to_mozilla_ast(TO_MOZ_STACK[TO_MOZ_STACK.length - 2]) : null
  TO_MOZ_STACK.pop()
  if (TO_MOZ_STACK.length === 0) { TO_MOZ_STACK = null }
  return ast
}

let TO_MOZ_STACK: Array<any | null> | null = null

export function to_moz_in_destructuring () {
  var i = TO_MOZ_STACK?.length
  while (i--) {
    if (TO_MOZ_STACK?.[i] instanceof AST_Destructuring) {
      return true
    }
  }
  return false
}

export function To_Moz_Literal (M) {
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

export function make_num (num: number) {
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
  return best_of_string(candidates)
}

export function best_of_string (a: string[]) {
  var best = a[0]; var len = best.length
  for (var i = 1; i < a.length; ++i) {
    if (a[i].length < len) {
      best = a[i]
      len = best.length
    }
  }
  return best
}

export function literals_in_boolean_context (self, compressor) {
  if (compressor.in_boolean_context()) {
    return best_of(compressor, self, make_sequence(self, [
      self,
      make_node('AST_True', self)
    ]).optimize(compressor))
  }
  return self
}

export function make_sequence (orig, expressions) {
  if (expressions.length == 1) return expressions[0]
  if (expressions.length == 0) throw new Error('trying to create a sequence with length zero!')
  return make_node('AST_Sequence', orig, {
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

export function best_of (compressor, ast1, ast2) {
  return (first_in_statement(compressor) ? best_of_statement : best_of_expression)(ast1, ast2)
}

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

function best_of_statement (ast1, ast2) {
  return best_of_expression(
    make_node('AST_SimpleStatement', ast1, {
      body: ast1
    }),
    make_node('AST_SimpleStatement', ast2, {
      body: ast2
    })
  ).body
}

export function best_of_expression (ast1, ast2) {
  return ast1.size() > ast2.size() ? ast2 : ast1
}

export function is_undefined (node, compressor?) {
  return has_flag(node, UNDEFINED) ||
        node instanceof AST_Undefined ||
        node instanceof AST_UnaryPrefix &&
            node.operator == 'void' &&
            !node.expression.has_side_effects(compressor)
}

export function force_statement (stat: any, output: any) {
  if (output.option('braces')) {
    make_block(stat, output)
  } else {
    if (!stat || stat instanceof AST_EmptyStatement) { output.force_semicolon() } else { stat.print(output) }
  }
}

export function make_block (stmt: any, output: any) {
  if (!stmt || stmt instanceof AST_EmptyStatement) { output.print('{}') } else if (stmt instanceof AST_BlockStatement) { stmt.print?.(output) } else {
    output.with_block(function () {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  }
}

// Tighten a bunch of statements together. Used whenever there is a block.
export function tighten_body (statements, compressor) {
  var in_loop, in_try
  var scope = compressor.find_parent(AST_Scope).get_defun_scope()
  find_loop_scope_try()
  var CHANGED; var max_iter = 10
  do {
    CHANGED = false
    eliminate_spurious_blocks(statements)
    if (compressor.option('dead_code')) {
      eliminate_dead_code(statements, compressor)
    }
    if (compressor.option('if_return')) {
      handle_if_return(statements, compressor)
    }
    if (compressor.sequences_limit > 0) {
      sequencesize(statements, compressor)
      sequencesize_2(statements, compressor)
    }
    if (compressor.option('join_vars')) {
      join_consecutive_vars(statements)
    }
    if (compressor.option('collapse_vars')) {
      collapse(statements, compressor)
    }
  } while (CHANGED && max_iter-- > 0)

  function find_loop_scope_try () {
    var node = compressor.self(); var level = 0
    do {
      if (node instanceof AST_Catch || node instanceof AST_Finally) {
        level++
      } else if (node instanceof AST_IterationStatement) {
        in_loop = true
      } else if (node instanceof AST_Scope) {
        scope = node
        break
      } else if (node instanceof AST_Try) {
        in_try = true
      }
    } while (node = compressor.parent(level++))
  }

  // Search from right to left for assignment-like expressions:
  // - `var a = x;`
  // - `a = x;`
  // - `++a`
  // For each candidate, scan from left to right for first usage, then try
  // to fold assignment into the site for compression.
  // Will not attempt to collapse assignments into or past code blocks
  // which are not sequentially executed, e.g. loops and conditionals.
  function collapse (statements, compressor) {
    if (scope.pinned()) return statements
    var args
    var candidates: any[] = []
    var stat_index = statements.length
    var scanner = new TreeTransformer(function (node: any) {
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
      var parent = scanner.parent()
      if (node instanceof AST_Assign && node.operator != '=' && lhs.equivalent_to(node.left) ||
                node instanceof AST_Await ||
                node instanceof AST_Call && lhs instanceof AST_PropAccess && lhs.equivalent_to(node.expression) ||
                node instanceof AST_Debugger ||
                node instanceof AST_Destructuring ||
                node instanceof AST_Expansion &&
                   node.expression instanceof AST_Symbol &&
                   node.expression.definition?.().references.length > 1 ||
                node instanceof AST_IterationStatement && !(node instanceof AST_For) ||
                node instanceof AST_LoopControl ||
                node instanceof AST_Try ||
                node instanceof AST_With ||
                node instanceof AST_Yield ||
                node instanceof AST_Export ||
                node instanceof AST_Class ||
                parent instanceof AST_For && node !== parent.init ||
                !replace_all &&
                    (
                      node instanceof AST_SymbolRef &&
                        !node.is_declared(compressor) &&
                        !pure_prop_access_globals.has(node as any)) || // TODO: check type
                node instanceof AST_SymbolRef &&
                    parent instanceof AST_Call &&
                    has_annotation(parent, _NOINLINE)
      ) {
        abort = true
        return node
      }
      // Stop only if candidate is found within conditional branches
      if (!stop_if_hit && (!lhs_local || !replace_all) &&
                (parent instanceof AST_Binary && lazy_op.has(parent.operator) && parent.left !== node ||
                    parent instanceof AST_Conditional && parent.condition !== node ||
                    parent instanceof AST_If && parent.condition !== node)) {
        stop_if_hit = parent
      }
      // Replace variable with assignment when found
      if (can_replace &&
                !(node instanceof AST_SymbolDeclaration) &&
                lhs.equivalent_to(node)
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
          if (value_def && candidate instanceof AST_VarDef) return node
        }
        CHANGED = abort = true
        compressor.info('Collapsing {name} [{file}:{line},{col}]', {
          name: node.print_to_string(),
          file: node.start.file,
          line: node.start.line,
          col: node.start.col
        })
        if (candidate instanceof AST_UnaryPostfix) {
          return make_node('AST_UnaryPrefix', candidate, candidate)
        }
        if (candidate instanceof AST_VarDef) {
          var def = candidate.name.definition?.()
          var value = candidate.value
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
      var sym
      if (node instanceof AST_Call ||
                node instanceof AST_Exit &&
                    (side_effects || lhs instanceof AST_PropAccess || may_modify(lhs)) ||
                node instanceof AST_PropAccess &&
                    (side_effects || node.expression.may_throw_on_access(compressor)) ||
                node instanceof AST_SymbolRef &&
                    (lvalues.get(node.name) || side_effects && may_modify(node)) ||
                node instanceof AST_VarDef && node.value &&
                    (lvalues.has(node.name.name) || side_effects && may_modify(node.name)) ||
                (sym = is_lhs(node.left, node)) &&
                    (sym instanceof AST_PropAccess || lvalues.has(sym.name)) ||
                may_throw &&
                    (in_try ? node.has_side_effects(compressor) : side_effects_external(node))) {
        stop_after = node
        if (node instanceof AST_Scope) abort = true
      }
      return handle_custom_scan_order(node)
    }, function (node: any) {
      if (abort) return
      if (stop_after === node) abort = true
      if (stop_if_hit === node) stop_if_hit = null
    })
    var multi_replacer = new TreeTransformer(function (node: any) {
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
      if (node instanceof AST_SymbolRef &&
                node.name == def.name) {
        if (!--replaced) abort = true
        if (is_lhs(node, multi_replacer.parent())) return node
        def.replaced++
        value_def.replaced--
        return candidate.value
      }
      // Skip (non-executed) functions and (leading) default case in switch statements
      if (node instanceof AST_Default || node instanceof AST_Scope) return node
    })
    while (--stat_index >= 0) {
      // Treat parameters as collapsible in IIFE, i.e.
      //   function(a, b){ ... }(x());
      // would be translated into equivalent assignments:
      //   var a = x(), b = undefined;
      if (stat_index == 0 && compressor.option('unused')) extract_args()
      // Find collapsible assignments
      var hit_stack: any[] = []
      extract_candidates(statements[stat_index])
      while (candidates.length > 0) {
        hit_stack = candidates.pop()
        var hit_index = 0
        var candidate = hit_stack[hit_stack.length - 1]
        var value_def: any = null
        var stop_after: any = null
        var stop_if_hit: any = null
        var lhs = get_lhs(candidate)
        if (!lhs || is_lhs_read_only(lhs) || lhs.has_side_effects(compressor)) continue
        // Locate symbols which may execute code outside of scanning range
        var lvalues = get_lvalues(candidate)
        var lhs_local = is_lhs_local(lhs)
        if (lhs instanceof AST_SymbolRef) lvalues.set(lhs.name, false)
        var side_effects = value_has_side_effects(candidate)
        var replace_all = replace_all_symbols()
        var may_throw = candidate.may_throw(compressor)
        var funarg = candidate.name instanceof AST_SymbolFunarg
        var hit = funarg
        var abort = false; var replaced: any = 0; var can_replace = !args || !hit
        if (!can_replace) {
          for (var j = compressor.self().argnames.lastIndexOf(candidate.name) + 1; !abort && j < args.length; j++) {
            args[j].transform(scanner)
          }
          can_replace = true
        }
        for (var i = stat_index; !abort && i < statements.length; i++) {
          statements[i].transform(scanner)
        }
        if (value_def) {
          var def = candidate.name.definition?.()
          if (abort && def.references.length - def.replaced > replaced) replaced = false
          else {
            abort = false
            hit_index = 0
            hit = funarg
            for (var i = stat_index; !abort && i < statements.length; i++) {
              statements[i].transform(multi_replacer)
            }
            value_def.single_use = false
          }
        }
        if (replaced && !remove_candidate(candidate)) statements.splice(stat_index, 1)
      }
    }

    function handle_custom_scan_order (node: any) {
      // Skip (non-executed) functions
      if (node instanceof AST_Scope) return node

      // Scan case expressions first in a switch statement
      if (node instanceof AST_Switch) {
        node.expression = node.expression.transform(scanner)
        for (var i = 0, len = node.body.length; !abort && i < len; i++) {
          var branch = node.body[i]
          if (branch instanceof AST_Case) {
            if (!hit) {
              if (branch !== hit_stack[hit_index]) continue
              hit_index++
            }
            branch.expression = branch.expression.transform(scanner)
            if (!replace_all) break
          }
        }
        abort = true
        return node
      }
    }

    function redefined_within_scope (def, scope) {
      if (def.global) return false
      let cur_scope = def.scope
      while (cur_scope && cur_scope !== scope) {
        if (cur_scope.variables.has(def.name)) return true
        cur_scope = cur_scope.parent_scope
      }
      return false
    }

    function has_overlapping_symbol (fn, arg, fn_strict) {
      var found = false; var scan_this = !(fn instanceof AST_Arrow)
      arg.walk(new TreeWalker(function (node: any, descend) {
        if (found) return true
        if (node instanceof AST_SymbolRef && (fn.variables.has(node.name) || redefined_within_scope(node.definition?.(), fn))) {
          var s = node.definition?.().scope
          if (s !== scope) {
            while (s = s.parent_scope) {
              if (s === scope) return true
            }
          }
          return found = true
        }
        if ((fn_strict || scan_this) && node instanceof AST_This) {
          return found = true
        }
        if (node instanceof AST_Scope && !(node instanceof AST_Arrow)) {
          var prev = scan_this
          scan_this = false
          descend()
          scan_this = prev
          return true
        }
      }))
      return found
    }

    function extract_args () {
      var iife; var fn = compressor.self()
      if (is_func_expr(fn) &&
                !fn.name &&
                !fn.uses_arguments &&
                !fn.pinned() &&
                (iife = compressor.parent()) instanceof AST_Call &&
                iife.expression === fn &&
                iife.args.every((arg) => !(arg instanceof AST_Expansion))
      ) {
        var fn_strict = compressor.has_directive('use strict')
        if (fn_strict && !member(fn_strict, fn.body)) fn_strict = false
        var len = fn.argnames.length
        args = iife.args.slice(len)
        var names = new Set()
        for (var i = len; --i >= 0;) {
          var sym = fn.argnames[i]
          var arg: any = iife.args[i]
          // The following two line fix is a duplicate of the fix at
          // https://github.com/terser/terser/commit/011d3eb08cefe6922c7d1bdfa113fc4aeaca1b75
          // This might mean that these two pieces of code (one here in collapse_vars and another in reduce_vars
          // Might be doing the exact same thing.
          const def = sym.definition && sym.definition?.()
          const is_reassigned = def && def.orig.length > 1
          if (is_reassigned) continue
          args.unshift(make_node('AST_VarDef', sym, {
            name: sym,
            value: arg
          }))
          if (names.has(sym.name)) continue
          names.add(sym.name)
          if (sym instanceof AST_Expansion) {
            var elements = iife.args.slice(i)
            if (elements.every((arg) =>
              !has_overlapping_symbol(fn, arg, fn_strict)
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
            } else if (arg instanceof AST_Lambda && arg.pinned?.() ||
                            has_overlapping_symbol(fn, arg, fn_strict)
            ) {
              arg = null
            }
            if (arg) {
              candidates.unshift([make_node('AST_VarDef', sym, {
                name: sym,
                value: arg
              })])
            }
          }
        }
      }
    }

    function extract_candidates (expr) {
      hit_stack.push(expr)
      if (expr instanceof AST_Assign) {
        if (!expr.left.has_side_effects(compressor)) {
          candidates.push(hit_stack.slice())
        }
        extract_candidates(expr.right)
      } else if (expr instanceof AST_Binary) {
        extract_candidates(expr.left)
        extract_candidates(expr.right)
      } else if (expr instanceof AST_Call && !has_annotation(expr, _NOINLINE)) {
        extract_candidates(expr.expression)
        expr.args.forEach(extract_candidates)
      } else if (expr instanceof AST_Case) {
        extract_candidates(expr.expression)
      } else if (expr instanceof AST_Conditional) {
        extract_candidates(expr.condition)
        extract_candidates(expr.consequent)
        extract_candidates(expr.alternative)
      } else if (expr instanceof AST_Definitions) {
        var len = expr.definitions.length
        // limit number of trailing variable definitions for consideration
        var i = len - 200
        if (i < 0) i = 0
        for (; i < len; i++) {
          extract_candidates(expr.definitions[i])
        }
      } else if (expr instanceof AST_DWLoop) {
        extract_candidates(expr.condition)
        if (!(expr.body instanceof AST_Block)) {
          extract_candidates(expr.body)
        }
      } else if (expr instanceof AST_Exit) {
        if (expr.value) extract_candidates(expr.value)
      } else if (expr instanceof AST_For) {
        if (expr.init) extract_candidates(expr.init)
        if (expr.condition) extract_candidates(expr.condition)
        if (expr.step) extract_candidates(expr.step)
        if (!(expr.body instanceof AST_Block)) {
          extract_candidates(expr.body)
        }
      } else if (expr instanceof AST_ForIn) {
        extract_candidates(expr.object)
        if (!(expr.body instanceof AST_Block)) {
          extract_candidates(expr.body)
        }
      } else if (expr instanceof AST_If) {
        extract_candidates(expr.condition)
        if (!(expr.body instanceof AST_Block)) {
          extract_candidates(expr.body)
        }
        if (expr.alternative && !(expr.alternative instanceof AST_Block)) {
          extract_candidates(expr.alternative)
        }
      } else if (expr instanceof AST_Sequence) {
        expr.expressions.forEach(extract_candidates)
      } else if (expr instanceof AST_SimpleStatement) {
        extract_candidates(expr.body)
      } else if (expr instanceof AST_Switch) {
        extract_candidates(expr.expression)
        expr.body.forEach(extract_candidates)
      } else if (expr instanceof AST_Unary) {
        if (expr.operator == '++' || expr.operator == '--') {
          candidates.push(hit_stack.slice())
        }
      } else if (expr instanceof AST_VarDef) {
        if (expr.value) {
          candidates.push(hit_stack.slice())
          extract_candidates(expr.value)
        }
      }
      hit_stack.pop()
    }

    function find_stop (node, level, write_only?) {
      var parent = scanner.parent(level)
      if (parent instanceof AST_Assign) {
        if (write_only &&
                    !(parent.left instanceof AST_PropAccess ||
                        lvalues.has(parent.left.name))) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (parent instanceof AST_Binary) {
        if (write_only && (!lazy_op.has(parent.operator) || parent.left === node)) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (parent instanceof AST_Call) return node
      if (parent instanceof AST_Case) return node
      if (parent instanceof AST_Conditional) {
        if (write_only && parent.condition === node) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (parent instanceof AST_Definitions) {
        return find_stop(parent, level + 1, true)
      }
      if (parent instanceof AST_Exit) {
        return write_only ? find_stop(parent, level + 1, write_only) : node
      }
      if (parent instanceof AST_If) {
        if (write_only && parent.condition === node) {
          return find_stop(parent, level + 1, write_only)
        }
        return node
      }
      if (parent instanceof AST_IterationStatement) return node
      if (parent instanceof AST_Sequence) {
        return find_stop(parent, level + 1, parent.tail_node() !== node)
      }
      if (parent instanceof AST_SimpleStatement) {
        return find_stop(parent, level + 1, true)
      }
      if (parent instanceof AST_Switch) return node
      if (parent instanceof AST_VarDef) return node
      return null
    }

    function mangleable_var (var_def) {
      var value = var_def.value
      if (!(value instanceof AST_SymbolRef)) return
      if (value.name == 'arguments') return
      var def = value.definition?.()
      if (def.undeclared) return
      return value_def = def
    }

    function get_lhs (expr) {
      if (expr instanceof AST_VarDef && expr.name instanceof AST_SymbolDeclaration) {
        var def = expr.name.definition?.()
        if (!member(expr.name, def.orig)) return
        var referenced = def.references.length - def.replaced
        if (!referenced) return
        var declared = def.orig.length - def.eliminated
        if (declared > 1 && !(expr.name instanceof AST_SymbolFunarg) ||
                    (referenced > 1 ? mangleable_var(expr) : !compressor.exposed(def))) {
          return make_node('AST_SymbolRef', expr.name, expr.name)
        }
      } else {
        const lhs = expr[expr instanceof AST_Assign ? 'left' : 'expression']
        return !is_ref_of(lhs, AST_SymbolConst) &&
                    !is_ref_of(lhs, AST_SymbolLet) && lhs
      }
    }

    function get_rvalue (expr) {
      return expr[expr instanceof AST_Assign ? 'right' : 'value']
    }

    function get_lvalues (expr) {
      var lvalues = new Map()
      if (expr instanceof AST_Unary) return lvalues
      var tw = new TreeWalker(function (node: any) {
        var sym = node
        while (sym instanceof AST_PropAccess) sym = sym.expression
        if (sym instanceof AST_SymbolRef || sym instanceof AST_This) {
          lvalues.set(sym.name, lvalues.get(sym.name) || is_modified(compressor, tw, node, node, 0))
        }
      })
      get_rvalue(expr).walk(tw)
      return lvalues
    }

    function remove_candidate (expr) {
      if (expr.name instanceof AST_SymbolFunarg) {
        var iife = compressor.parent(); var argnames = compressor.self().argnames
        var index = argnames.indexOf(expr.name)
        if (index < 0) {
          iife.args.length = Math.min(iife.args.length, argnames.length - 1)
        } else {
          var args = iife.args
          if (args[index]) {
            args[index] = make_node('AST_Number', args[index], {
              value: 0
            })
          }
        }
        return true
      }
      var found = false
      return statements[stat_index].transform(new TreeTransformer(function (node, descend, in_list) {
        if (found) return node
        if (node === expr || node.body === expr) {
          found = true
          if (node instanceof AST_VarDef) {
            node.value = node.name instanceof AST_SymbolConst
              ? make_node('AST_Undefined', node.value) // `const` always needs value.
              : null
            return node
          }
          return in_list ? MAP.skip : null
        }
      }, function (node: any) {
        if (node instanceof AST_Sequence) {
          switch (node.expressions.length) {
            case 0: return null
            case 1: return node.expressions[0]
          }
        }
      }))
    }

    function is_lhs_local (lhs) {
      while (lhs instanceof AST_PropAccess) lhs = lhs.expression
      return lhs instanceof AST_SymbolRef &&
                lhs.definition?.().scope === scope &&
                !(in_loop &&
                    (lvalues.has(lhs.name) ||
                        candidate instanceof AST_Unary ||
                        candidate instanceof AST_Assign && candidate.operator != '='))
    }

    function value_has_side_effects (expr) {
      if (expr instanceof AST_Unary) return unary_side_effects.has(expr.operator)
      return get_rvalue(expr).has_side_effects(compressor)
    }

    function replace_all_symbols () {
      if (side_effects) return false
      if (value_def) return true
      if (lhs instanceof AST_SymbolRef) {
        var def = lhs.definition?.()
        if (def.references.length - def.replaced == (candidate instanceof AST_VarDef ? 1 : 2)) {
          return true
        }
      }
      return false
    }

    function may_modify (sym) {
      if (!sym.definition) return true // AST_Destructuring
      var def = sym.definition?.()
      if (def.orig.length == 1 && def.orig[0] instanceof AST_SymbolDefun) return false
      if (def.scope.get_defun_scope() !== scope) return true
      return !def.references.every((ref) => {
        var s = ref.scope.get_defun_scope()
        // "block" scope within AST_Catch
        if (s.TYPE == 'Scope') s = s.parent_scope
        return s === scope
      })
    }

    function side_effects_external (node, lhs?) {
      if (node instanceof AST_Assign) return side_effects_external(node.left, true)
      if (node instanceof AST_Unary) return side_effects_external(node.expression, true)
      if (node instanceof AST_VarDef) return node.value && side_effects_external(node.value)
      if (lhs) {
        if (node instanceof AST_Dot) return side_effects_external(node.expression, true)
        if (node instanceof AST_Sub) return side_effects_external(node.expression, true)
        if (node instanceof AST_SymbolRef) return node.definition?.().scope !== scope
      }
      return false
    }
  }

  function eliminate_spurious_blocks (statements) {
    var seen_dirs: any[] = []
    for (var i = 0; i < statements.length;) {
      var stat = statements[i]
      if (stat instanceof AST_BlockStatement && stat.body.every(can_be_evicted_from_block)) {
        CHANGED = true
        eliminate_spurious_blocks(stat.body)
        statements.splice(i, 1, ...stat.body)
        i += stat.body.length
      } else if (stat instanceof AST_EmptyStatement) {
        CHANGED = true
        statements.splice(i, 1)
      } else if (stat instanceof AST_Directive) {
        if (!seen_dirs.includes(stat.value)) {
          i++
          seen_dirs.push(stat.value)
        } else {
          CHANGED = true
          statements.splice(i, 1)
        }
      } else i++
    }
  }

  function handle_if_return (statements, compressor) {
    var self = compressor.self()
    var multiple_if_returns = has_multiple_if_returns(statements)
    var in_lambda = self instanceof AST_Lambda
    for (var i = statements.length; --i >= 0;) {
      var stat = statements[i]
      var j = next_index(i)
      var next = statements[j]

      if (in_lambda && !next && stat instanceof AST_Return) {
        if (!stat.value) {
          CHANGED = true
          statements.splice(i, 1)
          continue
        }
        if (stat.value instanceof AST_UnaryPrefix && stat.value.operator == 'void') {
          CHANGED = true
          statements[i] = make_node('AST_SimpleStatement', stat, {
            body: stat.value.expression
          })
          continue
        }
      }

      if (stat instanceof AST_If) {
        var ab = aborts(stat.body)
        if (can_merge_flow(ab)) {
          if (ab.label) {
            remove(ab.label.thedef.references, ab)
          }
          CHANGED = true
          stat = stat.clone()
          stat.condition = stat.condition.negate(compressor)
          var body = as_statement_array_with_return(stat.body, ab)
          stat.body = make_node('AST_BlockStatement', stat, {
            body: as_statement_array(stat.alternative).concat(extract_functions())
          })
          stat.alternative = make_node('AST_BlockStatement', stat, {
            body: body
          })
          statements[i] = stat.transform(compressor)
          continue
        }

        var ab = aborts(stat.alternative)
        if (can_merge_flow(ab)) {
          if (ab.label) {
            remove(ab.label.thedef.references, ab)
          }
          CHANGED = true
          stat = stat.clone()
          stat.body = make_node('AST_BlockStatement', stat.body, {
            body: as_statement_array(stat.body).concat(extract_functions())
          })
          var body = as_statement_array_with_return(stat.alternative, ab)
          stat.alternative = make_node('AST_BlockStatement', stat.alternative, {
            body: body
          })
          statements[i] = stat.transform(compressor)
          continue
        }
      }

      if (stat instanceof AST_If && stat.body instanceof AST_Return) {
        var value = stat.body.value
        // ---
        // pretty silly case, but:
        // if (foo()) return; return; ==> foo(); return;
        if (!value && !stat.alternative &&
                    (in_lambda && !next || next instanceof AST_Return && !next.value)) {
          CHANGED = true
          statements[i] = make_node('AST_SimpleStatement', stat.condition, {
            body: stat.condition
          })
          continue
        }
        // ---
        // if (foo()) return x; return y; ==> return foo() ? x : y;
        if (value && !stat.alternative && next instanceof AST_Return && next.value) {
          CHANGED = true
          stat = stat.clone()
          stat.alternative = next
          statements[i] = stat.transform(compressor)
          statements.splice(j, 1)
          continue
        }
        // ---
        // if (foo()) return x; [ return ; ] ==> return foo() ? x : undefined;
        if (value && !stat.alternative &&
                    (!next && in_lambda && multiple_if_returns ||
                        next instanceof AST_Return)) {
          CHANGED = true
          stat = stat.clone()
          stat.alternative = next || make_node('AST_Return', stat, {
            value: null
          })
          statements[i] = stat.transform(compressor)
          if (next) statements.splice(j, 1)
          continue
        }
        // ---
        // if (a) return b; if (c) return d; e; ==> return a ? b : c ? d : void e;
        //
        // if sequences is not enabled, this can lead to an endless loop (issue #866).
        // however, with sequences on this helps producing slightly better output for
        // the example code.
        var prev = statements[prev_index(i)]
        if (compressor.option('sequences') && in_lambda && !stat.alternative &&
                    prev instanceof AST_If && prev.body instanceof AST_Return &&
                    next_index(j) == statements.length && next instanceof AST_SimpleStatement) {
          CHANGED = true
          stat = stat.clone()
          stat.alternative = make_node('AST_BlockStatement', next, {
            body: [
              next,
              make_node('AST_Return', next, {
                value: null
              })
            ]
          })
          statements[i] = stat.transform(compressor)
          statements.splice(j, 1)
          continue
        }
      }
    }

    function has_multiple_if_returns (statements) {
      var n = 0
      for (var i = statements.length; --i >= 0;) {
        var stat = statements[i]
        if (stat instanceof AST_If && stat.body instanceof AST_Return) {
          if (++n > 1) return true
        }
      }
      return false
    }

    function is_return_void (value) {
      return !value || value instanceof AST_UnaryPrefix && value.operator == 'void'
    }

    function can_merge_flow (ab) {
      if (!ab) return false
      for (var j = i + 1, len = statements.length; j < len; j++) {
        var stat = statements[j]
        if (stat instanceof AST_Const || stat instanceof AST_Let) return false
      }
      var lct = ab instanceof AST_LoopControl ? compressor.loopcontrol_target(ab) : null
      return ab instanceof AST_Return && in_lambda && is_return_void(ab.value) ||
                ab instanceof AST_Continue && self === loop_body(lct) ||
                ab instanceof AST_Break && lct instanceof AST_BlockStatement && self === lct
    }

    function extract_functions () {
      var tail = statements.slice(i + 1)
      statements.length = i + 1
      return tail.filter(function (stat) {
        if (stat instanceof AST_Defun) {
          statements.push(stat)
          return false
        }
        return true
      })
    }

    function as_statement_array_with_return (node, ab) {
      var body = as_statement_array(node).slice(0, -1)
      if (ab.value) {
        body.push(make_node('AST_SimpleStatement', ab.value, {
          body: ab.value.expression
        }))
      }
      return body
    }

    function next_index (i) {
      for (var j = i + 1, len = statements.length; j < len; j++) {
        var stat = statements[j]
        if (!(stat instanceof AST_Var && declarations_only(stat))) {
          break
        }
      }
      return j
    }

    function prev_index (i) {
      for (var j = i; --j >= 0;) {
        var stat = statements[j]
        if (!(stat instanceof AST_Var && declarations_only(stat))) {
          break
        }
      }
      return j
    }
  }

  function eliminate_dead_code (statements, compressor) {
    var has_quit
    var self = compressor.self()
    for (var i = 0, n = 0, len = statements.length; i < len; i++) {
      var stat = statements[i]
      if (stat instanceof AST_LoopControl) {
        var lct = compressor.loopcontrol_target(stat)
        if (stat instanceof AST_Break &&
                        !(lct instanceof AST_IterationStatement) &&
                        loop_body(lct) === self ||
                    stat instanceof AST_Continue &&
                        loop_body(lct) === self) {
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
    CHANGED = n != len
    if (has_quit) {
      has_quit.forEach(function (stat) {
        extract_declarations_from_unreachable_code(compressor, stat, statements)
      })
    }
  }

  function declarations_only (node: any) {
    return node.definitions.every((var_def) =>
      !var_def.value
    )
  }

  function sequencesize (statements, compressor) {
    if (statements.length < 2) return
    var seq: any[] = []; var n = 0
    function push_seq () {
      if (!seq.length) return
      var body = make_sequence(seq[0], seq)
      statements[n++] = make_node('AST_SimpleStatement', body, { body: body })
      seq = []
    }
    for (var i = 0, len = statements.length; i < len; i++) {
      var stat = statements[i]
      if (stat instanceof AST_SimpleStatement) {
        if (seq.length >= compressor.sequences_limit) push_seq()
        var body = stat.body
        if (seq.length > 0) body = body.drop_side_effect_free(compressor)
        if (body) merge_sequence(seq, body)
      } else if (stat instanceof AST_Definitions && declarations_only(stat) ||
                stat instanceof AST_Defun) {
        statements[n++] = stat
      } else {
        push_seq()
        statements[n++] = stat
      }
    }
    push_seq()
    statements.length = n
    if (n != len) CHANGED = true
  }

  function to_simple_statement (block, decls) {
    if (!(block instanceof AST_BlockStatement)) return block
    var stat: any = null
    for (var i = 0, len = block.body.length; i < len; i++) {
      var line = block.body[i]
      if (line instanceof AST_Var && declarations_only(line)) {
        decls.push(line)
      } else if (stat) {
        return false
      } else {
        stat = line
      }
    }
    return stat
  }

  function sequencesize_2 (statements: any[], compressor) {
    function cons_seq (right) {
      n--
      CHANGED = true
      var left = prev.body
      return make_sequence(left, [left, right]).transform(compressor)
    }
    var n = 0; var prev
    for (var i = 0; i < statements.length; i++) {
      var stat = statements[i]
      if (prev) {
        if (stat instanceof AST_Exit) {
          stat.value = cons_seq(stat.value || make_node('AST_Undefined', stat).transform(compressor))
        } else if (stat instanceof AST_For) {
          if (!(stat.init instanceof AST_Definitions)) {
            const abort = walk(prev.body, (node: any) => {
              if (node instanceof AST_Scope) return true
              if (
                node instanceof AST_Binary &&
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
                CHANGED = true
              }
            }
          }
        } else if (stat instanceof AST_ForIn) {
          if (!(stat.init instanceof AST_Const) && !(stat.init instanceof AST_Let)) {
            stat.object = cons_seq(stat.object)
          }
        } else if (stat instanceof AST_If) {
          stat.condition = cons_seq(stat.condition)
        } else if (stat instanceof AST_Switch) {
          stat.expression = cons_seq(stat.expression)
        } else if (stat instanceof AST_With) {
          stat.expression = cons_seq(stat.expression)
        }
      }
      if (compressor.option('conditionals') && stat instanceof AST_If) {
        var decls: any[] = []
        var body = to_simple_statement(stat.body, decls)
        var alt = to_simple_statement(stat.alternative, decls)
        if (body !== false && alt !== false && decls.length > 0) {
          var len = decls.length
          decls.push(make_node('AST_If', stat, {
            condition: stat.condition,
            body: body || make_node('AST_EmptyStatement', stat.body),
            alternative: alt
          }))
          decls.unshift(n, 1);
          [].splice.apply(statements, decls as any) // TODO: check type
          i += len
          n += len + 1
          prev = null
          CHANGED = true
          continue
        }
      }
      statements[n++] = stat
      prev = stat instanceof AST_SimpleStatement ? stat : null
    }
    statements.length = n
  }

  function join_object_assignments (defn, body) {
    if (!(defn instanceof AST_Definitions)) return
    var def = defn.definitions[defn.definitions.length - 1]
    if (!(def.value instanceof AST_Object)) return
    var exprs
    if (body instanceof AST_Assign) {
      exprs = [body]
    } else if (body instanceof AST_Sequence) {
      exprs = body.expressions.slice()
    }
    if (!exprs) return
    var trimmed = false
    do {
      var node = exprs[0]
      if (!(node instanceof AST_Assign)) break
      if (node.operator != '=') break
      if (!(node.left instanceof AST_PropAccess)) break
      var sym = node.left.expression
      if (!(sym instanceof AST_SymbolRef)) break
      if (def.name.name != sym.name) break
      if (!node.right.is_constant_expression(scope)) break
      var prop = node.left.property
      if (prop instanceof AST_Node) {
        prop = prop.evaluate?.(compressor)
      }
      if (prop instanceof AST_Node) break
      prop = '' + prop
      var diff = compressor.option('ecma') < 2015 &&
                compressor.has_directive('use strict') ? function (node: any) {
          return node.key != prop && (node.key && node.key.name != prop)
        } : function (node: any) {
          return node.key && node.key.name != prop
        }
      if (!def.value.properties.every(diff)) break
      var p = def.value.properties.filter(function (p) { return p.key === prop })[0]
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

  function join_consecutive_vars (statements) {
    var defs
    for (var i = 0, j = -1, len = statements.length; i < len; i++) {
      var stat = statements[i]
      var prev = statements[j]
      if (stat instanceof AST_Definitions) {
        if (prev && prev.TYPE == stat.TYPE) {
          prev.definitions = prev.definitions.concat(stat.definitions)
          CHANGED = true
        } else if (defs && defs.TYPE == stat.TYPE && declarations_only(stat)) {
          defs.definitions = defs.definitions.concat(stat.definitions)
          CHANGED = true
        } else {
          statements[++j] = stat
          defs = stat
        }
      } else if (stat instanceof AST_Exit) {
        stat.value = extract_object_assignments(stat.value)
      } else if (stat instanceof AST_For) {
        var exprs = join_object_assignments(prev, stat.init)
        if (exprs) {
          CHANGED = true
          stat.init = exprs.length ? make_sequence(stat.init, exprs) : null
          statements[++j] = stat
        } else if (prev instanceof AST_Var && (!stat.init || stat.init.TYPE == prev.TYPE)) {
          if (stat.init) {
            prev.definitions = prev.definitions.concat(stat.init.definitions)
          }
          stat.init = prev
          statements[j] = stat
          CHANGED = true
        } else if (defs && stat.init && defs.TYPE == stat.init.TYPE && declarations_only(stat.init)) {
          defs.definitions = defs.definitions.concat(stat.init.definitions)
          stat.init = null
          statements[++j] = stat
          CHANGED = true
        } else {
          statements[++j] = stat
        }
      } else if (stat instanceof AST_ForIn) {
        stat.object = extract_object_assignments(stat.object)
      } else if (stat instanceof AST_If) {
        stat.condition = extract_object_assignments(stat.condition)
      } else if (stat instanceof AST_SimpleStatement) {
        var exprs = join_object_assignments(prev, stat.body)
        if (exprs) {
          CHANGED = true
          if (!exprs.length) continue
          stat.body = make_sequence(stat.body, exprs)
        }
        statements[++j] = stat
      } else if (stat instanceof AST_Switch) {
        stat.expression = extract_object_assignments(stat.expression)
      } else if (stat instanceof AST_With) {
        stat.expression = extract_object_assignments(stat.expression)
      } else {
        statements[++j] = stat
      }
    }
    statements.length = j + 1

    function extract_object_assignments (value) {
      statements[++j] = stat
      var exprs = join_object_assignments(prev, value)
      if (exprs) {
        CHANGED = true
        if (exprs.length) {
          return make_sequence(value, exprs)
        } else if (value instanceof AST_Sequence) {
          return value.tail_node().left
        } else {
          return value.left
        }
      }
      return value
    }
  }
}

export function anyMayThrow (list, compressor) {
  for (var i = list.length; --i >= 0;) {
    if (list[i].may_throw(compressor)) { return true }
  }
  return false
}

export function anySideEffect (list, compressor) {
  for (var i = list.length; --i >= 0;) {
    if (list[i].has_side_effects(compressor)) { return true }
  }
  return false
}

export function reset_block_variables (compressor, node) {
  if (node.block_scope) {
    node.block_scope.variables.forEach((def) => {
      reset_def(compressor, def)
    })
  }
}

export function reset_def (compressor, def) {
  def.assignments = 0
  def.chained = false
  def.direct_access = false
  def.escaped = 0
  def.recursive_refs = 0
  def.references = []
  def.should_replace = undefined
  def.single_use = undefined
  if (def.scope.pinned()) {
    def.fixed = false
  } else if (def.orig[0] instanceof AST_SymbolConst || !compressor.exposed(def)) {
    def.fixed = def.init
  } else {
    def.fixed = false
  }
}

export function is_identifier_atom (node: any | null) {
  return node instanceof AST_Infinity ||
        node instanceof AST_NaN ||
        node instanceof AST_Undefined
}

export function walk_body (node: any, visitor: any) {
  const body = node.body
  for (var i = 0, len = body.length; i < len; i++) {
    body[i]._walk(visitor)
  }
}

export function clone_block_scope (deep: boolean) {
  var clone = this._clone(deep)
  if (this.block_scope) {
    // TODO this is sometimes undefined during compression.
    // But it should always have a value!
    clone.block_scope = this.block_scope.clone()
  }
  return clone
}

export function is_lhs (node, parent) {
  if (parent instanceof AST_Unary && unary_side_effects.has(parent.operator)) return parent.expression
  if (parent instanceof AST_Assign && parent.left === node) return node
}

export const list_overhead = (array) => array.length && array.length - 1

export function do_list (list: any[], tw: any) {
  return MAP(list, function (node: any) {
    return node.transform(tw, true)
  })
}

// we shouldn't compress (1,func)(something) to
// func(something) because that changes the meaning of
// the func (becomes lexical instead of global).
export function maintain_this_binding (parent, orig, val) {
  if (parent instanceof AST_UnaryPrefix && parent.operator == 'delete' ||
        parent instanceof AST_Call && parent.expression === orig &&
            (val instanceof AST_PropAccess || val instanceof AST_SymbolRef && val.name == 'eval')) {
    return make_sequence(orig, [make_node('AST_Number', orig, { value: 0 }), val])
  }
  return val
}

export function is_lhs_read_only (lhs) {
  if (lhs instanceof AST_This) return true
  if (lhs instanceof AST_SymbolRef) return lhs.definition?.().orig[0] instanceof AST_SymbolLambda
  if (lhs instanceof AST_PropAccess) {
    lhs = lhs.expression
    if (lhs instanceof AST_SymbolRef) {
      if (lhs.is_immutable()) return false
      lhs = lhs.fixed_value()
    }
    if (!lhs) return true
    if (lhs instanceof AST_RegExp) return false
    if (lhs instanceof AST_Constant) return true
    return is_lhs_read_only(lhs)
  }
  return false
}

export function is_func_expr (node: any) {
  return node instanceof AST_Arrow || node instanceof AST_Function
}

export function is_ref_of (ref, type) {
  if (!(ref instanceof AST_SymbolRef)) return false
  var orig = ref.definition?.().orig
  for (var i = orig.length; --i >= 0;) {
    if (orig[i] instanceof type) return true
  }
}

export function is_modified (compressor, tw, node, value, level, immutable?) {
  var parent = tw.parent(level)
  var lhs = is_lhs(node, parent)
  if (lhs) return lhs
  if (!immutable &&
        parent instanceof AST_Call &&
        parent.expression === node &&
        !(value instanceof AST_Arrow) &&
        !(value instanceof AST_Class) &&
        !parent.is_expr_pure?.(compressor) &&
        (!(value instanceof AST_Function) ||
            !(parent instanceof AST_New) && value.contains_this?.())) {
    return true
  }
  if (parent instanceof AST_Array) {
    return is_modified(compressor, tw, parent, parent, level + 1)
  }
  if (parent instanceof AST_ObjectKeyVal && node === parent.value) {
    var obj = tw.parent(level + 1)
    return is_modified(compressor, tw, obj, obj, level + 2)
  }
  if (parent instanceof AST_PropAccess && parent.expression === node) {
    var prop = read_property(value, parent.property)
    return !immutable && is_modified(compressor, tw, parent, prop, level + 1)
  }
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

// tell me if a statement aborts
export function aborts (thing) {
  return thing && thing.aborts()
}

export function as_statement_array (thing) {
  if (thing === null) return []
  if (thing instanceof AST_BlockStatement) return thing.body
  if (thing instanceof AST_EmptyStatement) return []
  if (thing instanceof AST_Statement) return [thing]
  throw new Error("Can't convert thing to statement array")
}

function loop_body (x) {
  if (x instanceof AST_IterationStatement) {
    return x.body instanceof AST_BlockStatement ? x.body : x
  }
  return x
}

export function extract_declarations_from_unreachable_code (compressor, stat, target) {
  if (!(stat instanceof AST_Defun)) {
    compressor.warn('Dropping unreachable code [{file}:{line},{col}]', stat.start)
  }
  walk(stat, (node: any) => {
    if (node instanceof AST_Var) {
      compressor.warn('Declarations in unreachable code! [{file}:{line},{col}]', node.start)
      node.remove_initializers()
      target.push(node)
      return true
    }
    if (
      node instanceof AST_Defun &&
            (node === stat || !compressor.has_directive('use strict'))
    ) {
      target.push(node === stat ? node : make_node('AST_Var', node, {
        definitions: [
          make_node('AST_VarDef', node, {
            name: make_node('AST_SymbolVar', node.name, node.name),
            value: null
          })
        ]
      }))
      return true
    }
    if (node instanceof AST_Scope) {
      return true
    }
  })
}

/* -----[ Walk function ]---- */

/**
 * Walk nodes in depth-first search fashion.
 * Callback can return `walk_abort` symbol to stop iteration.
 * It can also return `true` to stop iteration just for child nodes.
 * Iteration can be stopped and continued by passing the `to_visit` argument,
 * which is given to the callback in the second argument.
 **/
export function walk (node: any, cb: Function, to_visit = [node]) {
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

export function read_property (obj, key) {
  key = get_value(key)
  if (key instanceof AST_Node) return
  var value
  if (obj instanceof AST_Array) {
    var elements = obj.elements
    if (key == 'length') return make_node_from_constant(elements.length, obj)
    if (typeof key === 'number' && key in elements) value = elements[key]
  } else if (obj instanceof AST_Object) {
    key = '' + key
    var props = obj.properties
    for (var i = props.length; --i >= 0;) {
      var prop = props[i]
      if (!(prop instanceof AST_ObjectKeyVal)) return
      if (!value && props[i].key === key) value = props[i].value
    }
  }
  return value instanceof AST_SymbolRef && value.fixed_value() || value
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

export function make_node_from_constant (val, orig) {
  switch (typeof val) {
    case 'string':
      return make_node('AST_String', orig, {
        value: val
      })
    case 'number':
      if (isNaN(val)) return make_node('AST_NaN', orig)
      if (isFinite(val)) {
        return 1 / val < 0 ? make_node('AST_UnaryPrefix', orig, {
          operator: '-',
          expression: make_node('AST_Number', orig, { value: -val })
        }) : make_node('AST_Number', orig, { value: val })
      }
      return val < 0 ? make_node('AST_UnaryPrefix', orig, {
        operator: '-',
        expression: make_node('AST_Infinity', orig)
      }) : make_node('AST_Infinity', orig)
    case 'boolean':
      return make_node(val ? 'AST_True' : 'AST_False', orig)
    case 'undefined':
      return make_node('AST_Undefined', orig)
    default:
      if (val === null) {
        return make_node('AST_Null', orig, { value: null })
      }
      if (val instanceof RegExp) {
        return make_node('AST_RegExp', orig, {
          value: {
            source: regexp_source_fix(val.source),
            flags: val.flags
          }
        })
      }
      throw new Error(string_template("Can't handle constant of type: {type}", {
        type: typeof val
      }))
  }
}

export function has_break_or_continue (loop, parent?) {
  var found = false
  var tw = new TreeWalker(function (node: any) {
    if (found || node instanceof AST_Scope) return true
    if (node instanceof AST_LoopControl && tw.loopcontrol_target(node) === loop) {
      return found = true
    }
  })
  if (parent instanceof AST_LabeledStatement) tw.push(parent)
  tw.push(loop)
  loop.body.walk(tw)
  return found
}

export function block_aborts () {
  for (var i = 0; i < this.body.length; i++) {
    if (aborts(this.body[i])) {
      return this.body[i]
    }
  }
  return null
}

export function inline_array_like_spread (self, compressor, elements) {
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i]
    if (el instanceof AST_Expansion) {
      var expr = el.expression
      if (expr instanceof AST_Array) {
        elements.splice(i, 1, ...expr.elements)
        // Step back one, as the element at i is now new.
        i--
      }
      // In array-like spread, spreading a non-iterable value is TypeError.
      // We therefore can’t optimize anything else, unlike with object spread.
    }
  }
  return self
}

// Drop side-effect-free elements from an array of expressions.
// Returns an array of expressions with side-effects or null
// if all elements were dropped. Note: original array may be
// returned if nothing changed.
export function trim (nodes: any[], compressor: any, first_in_statement?) {
  var len = nodes.length
  if (!len) return null
  var ret: any[] = []; var changed = false
  for (var i = 0; i < len; i++) {
    var node = nodes[i].drop_side_effect_free(compressor, first_in_statement)
    changed = (node !== nodes[i]) || changed
    if (node) {
      ret.push(node)
      first_in_statement = false
    }
  }
  return changed ? ret.length ? ret : null : nodes
}

export function print_braced_empty (self: any, output: any) {
  output.print('{')
  output.with_indent(output.next_indent(), function () {
    output.append_comments(self, true)
  })
  output.print('}')
}
