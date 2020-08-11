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

import { walk_abort, UNDEFINED, has_flag } from './constants'
import {
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
} from './ast'

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
