import {
  MozillaAst,
  MozillaAstMetaProperty,
  MozillaAstNewExpression,
  MozillaAstCallExpression,
  MozillaAstSwitchStatement,
  MozillaAstImportDeclaration,
  MozillaAstVariableDeclaration,
  MozillaAstArrayExpression,
  MozillaAstSequenceExpression,
  MozillaAstArrayPattern,
  MozillaAstFunctionExpression,
  MozillaAstFunctionDeclaration,
  MozillaAstObjectPattern,
  MozillaAstMemberExpression,
  MozillaAstMethodDefinition,
  MozillaAstObjectExpression,
  MozillaAstTemplateLiteral,
  MozillaAstArrowFunctionExpression,
  MozillaAstFieldDefinition,
  MozillaAstProperty
} from './types'
import { OutputStream } from './output'
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

import { walk_abort, UNDEFINED, has_flag, unary_side_effects, TOP, lazy_op } from './constants'

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
  AST_Scope,
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
  AST_Yield,
  AST_Node,
  AST_Lambda,
  AST_Class,
  AST_Unary,
  AST_Boolean,
  AST_Definitions,
  AST_PropAccess,
  AST_ObjectProperty,
  AST_SymbolBlockDeclaration,
  AST_SymbolDeclaration,
  AST_Symbol,
  AST_Constant,
  AST_Atom,
  AST_Jump,
  AST_Exit,
  AST_LoopControl,
  AST_StatementWithBody,
  AST_Block,
  AST_IterationStatement,
  AST_DWLoop,
  AST_SwitchBranch
} from './ast'

import { unmangleable_names, function_defs } from './ast/toplevel'

import TreeTransformer from './tree-transformer'
import TreeWalker from './tree-walker'

import { is_basic_identifier_string, is_identifier_string, RESERVED_WORDS } from './parse'
import Compressor from './compressor'
import SymbolDef from './symbol-def'

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

export function characters (str: string) {
  return str.split('')
}

export function member<T> (name: T, array: T[]) {
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

export function defaults (args: any, defs: AnyObject, croak: boolean = false): typeof args {
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

export const MAP = (function () {
  const skip = {}
  function MAP (a: any[] | AnyObject, f: Function, backwards: boolean = false) {
    const ret: any[] = []; const top: any[] = []; let i: string | number
    function doit () {
      let val: any = f((a as any)[i], i)
      const is_last = val instanceof Last
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
  MAP.skip = skip
  return MAP
})()

export function make_node (ctorName: keyof typeof AST_DICT, orig?: AST_Node | AnyObject, props?: AnyObject): AST_Node {
  return make_ast_node(AST_DICT[ctorName] as any, orig, props)
}

export function make_ast_node<T extends AST_Node> (CTOR: new (props: any) => T, orig?: AST_Node | AnyObject, props?: any): T {
  return new CTOR(Object.assign({}, props, { start: props?.start || orig?.start, end: props?.end || orig?.end }))
}

export function push_uniq<T> (array: T[], el: T) {
  if (!array.includes(el)) { array.push(el) }
}

export function string_template (text: string, props?: AnyObject) {
  return text.replace(/{(.+?)}/g, function (_, p) {
    return props?.[p]
  })
}

export function remove<T = any> (array: T[], el: T) {
  for (let i = array.length; --i >= 0;) {
    if (array[i] === el) array.splice(i, 1)
  }
}

export function mergeSort<T> (array: T[], cmp: (a: T, b: T) => number): T[] {
  if (array.length < 2) return array.slice()
  function merge (a: T[], b: T[]) {
    const r: T[] = []; let ai = 0; let bi = 0; let i = 0
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
    const m = Math.floor(a.length / 2); let left = a.slice(0, m); let right = a.slice(m)
    left = _ms(left)
    right = _ms(right)
    return merge(left, right)
  }
  return _ms(array)
}

export function makePredicate (words: string | string[]) {
  if (!Array.isArray(words)) words = words.split(' ')

  return new Set(words)
}

export function HOP (obj: AnyObject, prop: string | number) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

export function keep_name (keep_setting: boolean | RegExp | undefined, name: string) {
  return keep_setting === true ||
        (keep_setting instanceof RegExp && keep_setting.test(name))
}

const lineTerminatorEscape: AnyObject<string> = {
  '\n': 'n',
  '\r': 'r',
  '\u2028': 'u2028',
  '\u2029': 'u2029'
}

export function regexp_source_fix (source: string) {
  // V8 does not escape line terminators in regexp patterns in node 12
  return source.replace(/[\n\r\u2028\u2029]/g, function (match, offset) {
    const escaped = source[offset - 1] == '\\' &&
            (source[offset - 2] != '\\' ||
            /(?:^|[^\\])(?:\\{2})*$/.test(source.slice(0, offset - 1)))
    return (escaped ? '' : '\\') + lineTerminatorEscape[match]
  })
}

const all_flags = 'gimuy'

export function sort_regexp_flags (flags: string) {
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

export function set_annotation (node: AST_Node, annotation: number) {
  node._annotations = (node._annotations ?? 0) | annotation
}

export function convert_to_predicate (obj: {[x: string]: string | string[]}) {
  const out = new Map()
  for (const key of Object.keys(obj)) {
    out.set(key, makePredicate(obj[key]))
  }
  return out
}

export function has_annotation (node: AST_Node, annotation: number) {
  return (node._annotations ?? 0) & annotation
}

export function warn (compressor: Compressor, node: AST_Node) {
  compressor.warn('global_defs ' + node.print_to_string() + ' redefined [{file}:{line},{col}]', node.start)
}

export function is_strict (compressor: Compressor) {
  const optPureGettters = compressor.option('pure_getters')
  return typeof optPureGettters === 'string' && optPureGettters.includes('strict')
}

export function push (tw: TreeWalker) {
  tw.safe_ids = Object.create(tw.safe_ids)
}

export function pop (tw: TreeWalker) {
  tw.safe_ids = Object.getPrototypeOf(tw.safe_ids)
}

export function mark (tw: TreeWalker, def: SymbolDef, safe: boolean) {
  tw.safe_ids[def.id] = safe
}

export function walk_parent (node: AST_Node, cb: Function, initial_stack?: any[]) {
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

export function set_moz_loc (mynode: AST_Node, moznode: MozillaAst): MozillaAst {
  const start = mynode.start
  const end = mynode.end
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

export let FROM_MOZ_STACK: Array<MozillaAst | undefined | null> = []

export function from_moz (node?: MozillaAst | null) {
  FROM_MOZ_STACK.push(node)
  const ret = node != null ? MOZ_TO_ME[node.type](node) : null
  FROM_MOZ_STACK.pop()
  return ret
}

const MOZ_TO_ME: any = {
  Program: function (M: MozillaAst) {
    return new AST_Toplevel({
      start: my_start_token(M),
      end: my_end_token(M),
      body: normalize_directives((M.body as any[]).map(from_moz))
    })
  },
  ArrayPattern: function (M: MozillaAstArrayPattern) {
    return new AST_Destructuring({
      start: my_start_token(M),
      end: my_end_token(M),
      names: M.elements.map(function (elm) {
        if (elm === null) {
          return new AST_Hole({})
        }
        return from_moz(elm)
      }),
      is_array: true
    })
  },
  ObjectPattern: function (M: MozillaAstObjectPattern) {
    return new AST_Destructuring({
      start: my_start_token(M),
      end: my_end_token(M),
      names: M.properties.map(from_moz),
      is_array: false
    })
  },
  AssignmentPattern: function (M: MozillaAst) {
    return new AST_DefaultAssign({
      start: my_start_token(M),
      end: my_end_token(M),
      left: from_moz(M.left),
      operator: '=',
      right: from_moz(M.right)
    })
  },
  SpreadElement: function (M: MozillaAst) {
    return new AST_Expansion({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.argument)
    })
  },
  RestElement: function (M: MozillaAst) {
    return new AST_Expansion({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.argument)
    })
  },
  TemplateElement: function (M: MozillaAst) {
    return new AST_TemplateSegment({
      start: my_start_token(M),
      end: my_end_token(M),
      value: M.value.cooked,
      raw: M.value.raw
    })
  },
  TemplateLiteral: function (M: MozillaAstTemplateLiteral) {
    const segments: any[] = []
    const quasis = (M).quasis as any[]
    for (let i = 0; i < quasis.length; i++) {
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
  TaggedTemplateExpression: function (M: MozillaAst) {
    return new AST_PrefixedTemplateString({
      start: my_start_token(M),
      end: my_end_token(M),
      template_string: from_moz((M).quasi),
      prefix: from_moz((M).tag)
    })
  },
  FunctionDeclaration: function (M: MozillaAstFunctionDeclaration) {
    return new AST_Defun({
      start: my_start_token(M),
      end: my_end_token(M),
      name: from_moz(M.id),
      argnames: M.params.map(from_moz),
      is_generator: M.generator,
      async: M.async,
      body: normalize_directives(from_moz(M.body as MozillaAst).body)
    })
  },
  FunctionExpression: function (M: MozillaAstFunctionExpression) {
    return new AST_Function({
      start: my_start_token(M),
      end: my_end_token(M),
      name: from_moz(M.id),
      argnames: M.params.map(from_moz),
      is_generator: M.generator,
      async: M.async,
      body: normalize_directives(from_moz(M.body as MozillaAst).body)
    })
  },
  ArrowFunctionExpression: function (M: MozillaAstArrowFunctionExpression) {
    const mozbody = M.body as MozillaAst
    const body = mozbody.type === 'BlockStatement'
      ? from_moz(mozbody).body
      : [make_node('AST_Return', {}, { value: from_moz(mozbody) })]
    return new AST_Arrow({
      start: my_start_token(M),
      end: my_end_token(M),
      argnames: M.params.map(from_moz),
      body,
      async: M.async
    })
  },
  ExpressionStatement: function (M: MozillaAst) {
    return new AST_SimpleStatement({
      start: my_start_token(M),
      end: my_end_token(M),
      body: from_moz(M.expression)
    })
  },
  TryStatement: function (M: MozillaAst) {
    const handlers = M.handlers || [M.handler]
    if (handlers.length > 1 || M.guardedHandlers?.length) {
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
  Property: function (M: MozillaAstProperty) {
    const key = M.key
    const args: any = {
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
  MethodDefinition: function (M: MozillaAstMethodDefinition) {
    const args: any = {
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
  FieldDefinition: function (M: MozillaAstFieldDefinition) {
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
  ArrayExpression: function (M: MozillaAstArrayExpression) {
    return new AST_Array({
      start: my_start_token(M),
      end: my_end_token(M),
      elements: M.elements.map(function (elem) {
        return elem === null ? new AST_Hole({}) : from_moz(elem)
      })
    })
  },
  ObjectExpression: function (M: MozillaAstObjectExpression) {
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
  SequenceExpression: function (M: MozillaAstSequenceExpression) {
    return new AST_Sequence({
      start: my_start_token(M),
      end: my_end_token(M),
      expressions: M.expressions.map(from_moz)
    })
  },
  MemberExpression: function (M: MozillaAstMemberExpression) {
    return new (M.computed ? AST_Sub : AST_Dot)({
      start: my_start_token(M),
      end: my_end_token(M),
      property: M.computed ? from_moz(M.property) : M.property.name,
      expression: from_moz(M.object)
    })
  },
  SwitchCase: function (M: MozillaAst) {
    return new (M.test ? AST_Case : AST_Default)({
      start: my_start_token(M),
      end: my_end_token(M),
      expression: from_moz(M.test),
      body: (M.consequent as MozillaAst[]).map(from_moz)
    })
  },
  VariableDeclaration: function (M: MozillaAstVariableDeclaration) {
    return new (M.kind === 'const' ? AST_Const
      : M.kind === 'let' ? AST_Let : AST_Var)({
      start: my_start_token(M),
      end: my_end_token(M),
      definitions: M.declarations.map(from_moz)
    })
  },

  ImportDeclaration: function (M: MozillaAstImportDeclaration) {
    let imported_name = null
    let imported_names: any[] | null = null
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
  ExportAllDeclaration: function (M: MozillaAst) {
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
  ExportNamedDeclaration: function (M: MozillaAst) {
    return new AST_Export({
      start: my_start_token(M),
      end: my_end_token(M),
      exported_definition: from_moz(M.declaration),
      exported_names: M.specifiers?.length ? M.specifiers.map(function (specifier) {
        return new AST_NameMapping({
          foreign_name: from_moz(specifier.exported),
          name: from_moz(specifier.local)
        })
      }) : null,
      module_name: from_moz(M.source)
    })
  },
  ExportDefaultDeclaration: function (M: MozillaAst) {
    return new AST_Export({
      start: my_start_token(M),
      end: my_end_token(M),
      exported_value: from_moz(M.declaration),
      is_default: true
    })
  },
  Literal: function (M: MozillaAst) {
    const val = M.value; const args: any = {
      start: my_start_token(M),
      end: my_end_token(M)
    }
    const rx = M.regex
    if (rx?.pattern) {
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
  MetaProperty: function (M: MozillaAstMetaProperty) {
    if (M.meta.name === 'new' && M.property.name === 'target') {
      return new AST_NewTarget({
        start: my_start_token(M),
        end: my_end_token(M)
      })
    }
  },
  Identifier: function (M: MozillaAst) {
    const p = FROM_MOZ_STACK[FROM_MOZ_STACK.length - 2]
    if (p) {
      return new (p.type === 'LabeledStatement' ? AST_Label
        : p.type === 'VariableDeclarator' && p.id === M ? (p.kind == 'const' ? AST_SymbolConst : p.kind == 'let' ? AST_SymbolLet : AST_SymbolVar)
          : /Import.*Specifier/.test(p.type) ? (p.local === M ? AST_SymbolImport : AST_SymbolImportForeign)
            : p.type === 'ExportSpecifier' ? (p.local === M ? AST_SymbolExport : AST_SymbolExportForeign)
              : p.type === 'FunctionExpression' ? (p.id === M ? AST_SymbolLambda : AST_SymbolFunarg)
                : p.type === 'FunctionDeclaration' ? (p.id === M ? AST_SymbolDefun : AST_SymbolFunarg)
                  : p.type === 'ArrowFunctionExpression' ? ((p as MozillaAstArrowFunctionExpression).params.includes(M)) ? AST_SymbolFunarg : AST_SymbolRef
                    : p.type === 'ClassExpression' ? (p.id === M ? AST_SymbolClass : AST_SymbolRef)
                      : p.type === 'Property' ? (p.key === M && p.computed || p.value === M ? AST_SymbolRef : AST_SymbolMethod)
                        : p.type === 'FieldDefinition' ? (p.key === M && p.computed || p.value === M ? AST_SymbolRef : AST_SymbolClassProperty)
                          : p.type === 'ClassDeclaration' ? (p.id === M ? AST_SymbolDefClass : AST_SymbolRef)
                            : p.type === 'MethodDefinition' ? (p.computed ? AST_SymbolRef : AST_SymbolMethod)
                              : p.type === 'CatchClause' ? AST_SymbolCatch
                                : p.type === 'BreakStatement' || p.type === 'ContinueStatement' ? AST_LabelRef
                                  : AST_SymbolRef)({
        start: my_start_token(M),
        end: my_end_token(M),
        name: M.name
      })
    }
  },
  BigIntLiteral (M: MozillaAst) {
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

  EmptyStatement: (M: MozillaAst) => new AST_EmptyStatement({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  BlockStatement: (M: MozillaAst) => new AST_BlockStatement({
    start: my_start_token(M),
    end: my_end_token(M),
    body: (M.body as MozillaAst[]).map(from_moz)
  }),
  IfStatement: (M: MozillaAst) => new AST_If({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.consequent as MozillaAst),
    alternative: from_moz(M.alternate)
  }),
  LabeledStatement: (M: MozillaAst) => new AST_LabeledStatement({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label),
    body: from_moz(M.body as MozillaAst)
  }),
  BreakStatement: (M: MozillaAst) => new AST_Break({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label)
  }),
  ContinueStatement: (M: MozillaAst) => new AST_Continue({
    start: my_start_token(M),
    end: my_end_token(M),
    label: from_moz(M.label)
  }),
  WithStatement: (M: MozillaAst) => new AST_With({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.object),
    body: from_moz(M.body as MozillaAst)
  }),
  SwitchStatement: (M: MozillaAstSwitchStatement) => new AST_Switch({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.discriminant),
    body: M.cases.map(from_moz)
  }),
  ReturnStatement: (M: MozillaAst) => new AST_Return({
    start: my_start_token(M),
    end: my_end_token(M),
    value: from_moz(M.argument)
  }),
  ThrowStatement: (M: MozillaAst) => new AST_Throw({
    start: my_start_token(M),
    end: my_end_token(M),
    value: from_moz(M.argument)
  }),
  WhileStatement: (M: MozillaAst) => new AST_While({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.body as MozillaAst)
  }),
  DoWhileStatement: (M: MozillaAst) => new AST_Do({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    body: from_moz(M.body as MozillaAst)
  }),
  ForStatement: (M: MozillaAst) => new AST_For({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.init),
    condition: from_moz(M.test),
    step: from_moz(M.update),
    body: from_moz(M.body as MozillaAst)
  }),
  ForInStatement: (M: MozillaAst) => new AST_ForIn({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.left),
    object: from_moz(M.right),
    body: from_moz(M.body as MozillaAst)
  }),
  ForOfStatement: (M: MozillaAst) => new AST_ForOf({
    start: my_start_token(M),
    end: my_end_token(M),
    init: from_moz(M.left),
    object: from_moz(M.right),
    body: from_moz(M.body as MozillaAst),
    await: M.await
  }),
  AwaitExpression: (M: MozillaAst) => new AST_Await({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.argument)
  }),
  YieldExpression: (M: MozillaAst) => new AST_Yield({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.argument),
    is_star: M.delegate
  }),
  DebuggerStatement: (M: MozillaAst) => new AST_Debugger({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  VariableDeclarator: (M: MozillaAst) => new AST_VarDef({
    start: my_start_token(M),
    end: my_end_token(M),
    name: from_moz(M.id),
    value: from_moz(M.init)
  }),
  CatchClause: (M: MozillaAst) => new AST_Catch({
    start: my_start_token(M),
    end: my_end_token(M),
    argname: from_moz(M.param),
    body: from_moz(M.body as MozillaAst).body
  }),
  ThisExpression: (M: MozillaAst) => new AST_This({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  Super: (M: MozillaAst) => new AST_Super({
    start: my_start_token(M),
    end: my_end_token(M)
  }),
  BinaryExpression: (M: MozillaAst) => new AST_Binary({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  LogicalExpression: (M: MozillaAst) => new AST_Binary({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  AssignmentExpression: (M: MozillaAst) => new AST_Assign({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator,
    left: from_moz(M.left),
    right: from_moz(M.right)
  }),
  ConditionalExpression: (M: MozillaAst) => new AST_Conditional({
    start: my_start_token(M),
    end: my_end_token(M),
    condition: from_moz(M.test),
    consequent: from_moz(M.consequent as MozillaAst),
    alternative: from_moz(M.alternate)
  }),
  NewExpression: (M: MozillaAstNewExpression) => new AST_New({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.callee),
    args: M.arguments.map(from_moz)
  }),
  CallExpression: (M: MozillaAstCallExpression) => new AST_Call({
    start: my_start_token(M),
    end: my_end_token(M),
    expression: from_moz(M.callee),
    args: M.arguments.map(from_moz)
  })
}

export function my_start_token (moznode: MozillaAst) {
  const loc = moznode.loc
  const start = loc?.start
  const range = moznode.range
  return new AST_Token({
    file: loc?.source,
    line: start?.line,
    col: start?.column,
    pos: range ? range[0] : moznode.start as number,
    endline: start?.line,
    endcol: start?.column,
    endpos: range ? range[0] : moznode.start as number,
    raw: raw_token(moznode)
  })
}

export function my_end_token (moznode: MozillaAst) {
  const loc = moznode.loc
  const end = loc?.end
  const range = moznode.range
  return new AST_Token({
    file: loc?.source,
    line: end?.line,
    col: end?.column,
    pos: range ? range[1] : moznode.end,
    endline: end?.line,
    endcol: end?.column,
    endpos: range ? range[1] : moznode.end,
    raw: raw_token(moznode)
  })
}

export function normalize_directives (body: any[]) {
  let in_directive = true

  for (let i = 0; i < body.length; i++) {
    const item = body[i]
    if (in_directive && is_ast_statement(item) && is_ast_string(item.body)) {
      body[i] = new AST_Directive({
        start: body[i].start,
        end: body[i].end,
        value: item.body.value
      })
    } else if (in_directive && !(is_ast_statement(item) && is_ast_string(item.body))) {
      in_directive = false
    }
  }

  return body
}

export function raw_token (moznode: MozillaAst) {
  if (moznode.type == 'Literal') {
    return moznode.raw != null ? moznode.raw : moznode.value + ''
  }
}

export function To_Moz_Unary (M: MozillaAst) {
  const prefix = 'prefix' in M ? M.prefix
    : M.type == 'UnaryExpression'
  return new (prefix ? AST_UnaryPrefix : AST_UnaryPostfix)({
    start: my_start_token(M),
    end: my_end_token(M),
    operator: M.operator as any,
    expression: from_moz(M.argument)
  })
}

function From_Moz_Class (M: MozillaAst) {
  return new (M.type === 'ClassDeclaration' ? AST_DefClass : AST_ClassExpression)({
    start: my_start_token(M),
    end: my_end_token(M),
    name: from_moz(M.id),
    extends: from_moz(M.superClass),
    properties: ((M.body as MozillaAst).body as MozillaAst[]).map(from_moz)
  })
}

export function setFromMozStack (val: MozillaAst[]) {
  FROM_MOZ_STACK = val
}

export function to_moz (node: AST_Node): MozillaAst {
  if (TO_MOZ_STACK === null) { TO_MOZ_STACK = [] }
  TO_MOZ_STACK.push(node)
  const ast = node != null ? node.to_mozilla_ast(TO_MOZ_STACK[TO_MOZ_STACK.length - 2]) : null
  TO_MOZ_STACK.pop()
  if (TO_MOZ_STACK.length === 0) { TO_MOZ_STACK = null }
  return ast as any
}

let TO_MOZ_STACK: Array<any | null> | null = null

export function to_moz_in_destructuring () {
  let i = TO_MOZ_STACK?.length ?? 0
  while (i--) {
    if (is_ast_destructuring(TO_MOZ_STACK?.[i])) {
      return true
    }
  }
  return false
}

export function To_Moz_Literal (M: AST_Node) {
  const value = M.value
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
  const str = num.toString(10).replace(/^0\./, '.').replace('e+', 'e')
  const candidates = [str]
  if (Math.floor(num) === num) {
    if (num < 0) {
      candidates.push('-0x' + (-num).toString(16).toLowerCase())
    } else {
      candidates.push('0x' + num.toString(16).toLowerCase())
    }
  }
  let match: RegExpExecArray | null, len, digits
  if ((match = /^\.0+/.exec(str))) {
    len = match[0].length
    digits = str.slice(len)
    candidates.push(digits + 'e-' + (digits.length + len - 1))
  } else if ((match = /0+$/.exec(str))) {
    len = match[0].length
    candidates.push(str.slice(0, -len) + 'e' + len)
  } else if ((match = /^(\d)\.(\d+)e(-?\d+)$/.exec(str))) {
    candidates.push(match[1] + match[2] + 'e' + (Number(match[3]) - match[2].length))
  }
  return best_of_string(candidates)
}

export function best_of_string (a: string[]) {
  let best = a[0]; let len = best.length
  for (let i = 1; i < a.length; ++i) {
    if (a[i].length < len) {
      best = a[i]
      len = best.length
    }
  }
  return best
}

export function make_sequence (orig: AST_Node, expressions: Array<AST_Node | undefined>): AST_Node {
  if (expressions.length == 1) return expressions[0] as any
  if (expressions.length == 0) throw new Error('trying to create a sequence with length zero!')
  return make_node('AST_Sequence', orig, {
    expressions: expressions.reduce(merge_sequence, [])
  })
}

export function merge_sequence (array: Array<AST_Node | undefined>, node: AST_Node | undefined) {
  if (is_ast_sequence(node)) {
    array.push(...node.expressions)
  } else {
    array.push(node)
  }
  return array
}

export function best_of (compressor: Compressor, ast1: AST_Node, ast2: AST_Node) {
  return (first_in_statement(compressor) ? best_of_statement : best_of_expression)(ast1, ast2)
}

// return true if the node at the top of the stack (that means the
// innermost node in the current output) is lexically the first in
// a statement.
export function first_in_statement (stack: any) {
  let node = stack.parent(-1)
  for (let i = 0, p; (p = stack.parent(i)); i++) {
    if (is_ast_statement(p) && p.body === node) { return true }
    if ((is_ast_sequence(p) && p.expressions[0] === node) ||
            (p.TYPE === 'Call' && p.expression === node) ||
            (is_ast_prefixed_template_string(p) && p.prefix === node) ||
            (is_ast_dot(p) && p.expression === node) ||
            (is_ast_sub(p) && p.expression === node) ||
            (is_ast_conditional(p) && p.condition === node) ||
            (is_ast_binary(p) && p.left === node) ||
            (is_ast_unary_postfix(p) && p.expression === node)
    ) {
      node = p
    } else {
      return false
    }
  }
  return false
}

function best_of_statement (ast1: AST_Node, ast2: AST_Node) {
  return best_of_expression(
    make_node('AST_SimpleStatement', ast1, {
      body: ast1
    }),
    make_node('AST_SimpleStatement', ast2, {
      body: ast2
    })
  ).body
}

export function best_of_expression (ast1: AST_Node, ast2: AST_Node) {
  return ast1.size() > ast2.size() ? ast2 : ast1
}

export function is_undefined (node: AST_Node, compressor?: Compressor) {
  return has_flag(node, UNDEFINED) ||
        is_ast_undefined(node) ||
        is_ast_unary_prefix(node) && node.operator == 'void' && !node.expression.has_side_effects(compressor as any)
}

export function force_statement (stat: AST_Node, output: OutputStream) {
  if (output.option('braces')) {
    make_block(stat, output)
  } else {
    if (!stat || is_ast_empty_statement(stat)) { output.force_semicolon() } else { stat.print(output) }
  }
}

export function make_block (stmt: AST_Node | undefined, output: OutputStream) {
  if (!stmt || is_ast_empty_statement(stmt)) { output.print('{}') } else if (is_ast_block_statement(stmt)) { stmt.print?.(output) } else {
    output.with_block(function () {
      output.indent()
      stmt.print(output)
      output.newline()
    })
  }
}

export function anyMayThrow (list: any[], compressor: Compressor) {
  for (let i = list.length; --i >= 0;) {
    if (list[i].may_throw(compressor)) { return true }
  }
  return false
}

export function anySideEffect (list: any[], compressor?: Compressor) {
  for (let i = list.length; --i >= 0;) {
    if (list[i].has_side_effects(compressor)) { return true }
  }
  return false
}

export function reset_block_variables (compressor: Compressor, node: AST_Block | AST_IterationStatement) {
  if (node.block_scope) {
    node.block_scope.variables.forEach((def: SymbolDef) => {
      reset_def(compressor, def)
    })
  }
}

export function reset_def (compressor: Compressor, def: SymbolDef) {
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
  } else if (is_ast_symbol_const(def.orig[0]) || !compressor.exposed(def)) {
    def.fixed = def.init
  } else {
    def.fixed = false
  }
}

export function is_identifier_atom (node: AST_Node | undefined): boolean {
  return is_ast_infinity(node) ||
        is_ast_na_n(node) ||
        is_ast_undefined(node)
}

export function walk_body (node: AST_Node, visitor: TreeWalker): void {
  const body = node.body
  for (let i = 0, len = body.length; i < len; i++) {
    body[i].walk(visitor)
  }
}

export function is_lhs (node: AST_Node, parent: AST_Node) {
  if (is_ast_unary(parent) && unary_side_effects.has(parent.operator)) return parent.expression
  if (is_ast_assign(parent) && parent.left === node) return node
}

export const list_overhead = (array: any[]) => array.length && array.length - 1

export function do_list (list: any[], tw: TreeTransformer) {
  return MAP(list, function (node: AST_Node) {
    return node.transform(tw, true)
  })
}

// we shouldn't compress (1,func)(something) to
// func(something) because that changes the meaning of
// the func (becomes lexical instead of global).
export function maintain_this_binding (parent: AST_Node, orig: AST_Node, val: AST_Node) {
  if (is_ast_unary_prefix(parent) && parent.operator == 'delete' ||
        is_ast_call(parent) && parent.expression === orig &&
            (is_ast_prop_access(val) || is_ast_symbol_ref(val) && val.name == 'eval')) {
    return make_sequence(orig, [
      make_node('AST_Number', orig, { value: 0 }),
      val
    ])
  }
  return val
}

export function is_lhs_read_only (lhs: any): boolean {
  if (is_ast_this(lhs)) return true
  if (is_ast_symbol_ref(lhs)) return is_ast_symbol_lambda(lhs.definition?.().orig[0])
  if (is_ast_prop_access(lhs)) {
    lhs = lhs.expression
    if (is_ast_symbol_ref(lhs)) {
      if (lhs.is_immutable()) return false
      lhs = lhs.fixed_value()
    }
    if (!lhs) return true
    if (is_ast_reg_exp(lhs)) return false
    if (is_ast_constant(lhs)) return true
    return is_lhs_read_only(lhs)
  }
  return false
}

export function is_func_expr (node: any): node is AST_Arrow | AST_Function {
  return is_ast_arrow(node) || is_ast_function(node)
}

export function is_ref_of (ref: any, type: typeof AST_Node) {
  if (!(is_ast_symbol_ref(ref))) return false
  const orig = ref.definition?.().orig
  for (let i = orig.length; --i >= 0;) {
    if (orig[i] instanceof type) return true
  }
}

export function is_modified (compressor: Compressor, tw: TreeWalker, node: AST_Node, value: any, level: number, immutable?: undefined): boolean {
  const parent = tw.parent(level)
  const lhs = is_lhs(node, parent)
  if (lhs) return lhs as any
  if (!immutable &&
        is_ast_call(parent) &&
        parent.expression === node &&
        !(is_ast_arrow(value)) &&
        !(is_ast_class(value)) &&
        !parent.is_expr_pure?.(compressor) &&
        (!(is_ast_function(value)) ||
            !(is_ast_new(parent)) && value.contains_this?.())) {
    return true
  }
  if (is_ast_array(parent)) {
    return is_modified(compressor, tw, parent, parent, level + 1)
  }
  if (is_ast_object_key_val(parent) && node === parent.value) {
    const obj = tw.parent(level + 1)
    return is_modified(compressor, tw, obj, obj, level + 2)
  }
  if (is_ast_prop_access(parent) && parent.expression === node) {
    const prop = read_property(value, (parent as any).property)
    return !immutable && is_modified(compressor, tw, parent, prop, level + 1)
  }
  return false
}

export function can_be_evicted_from_block (node: AST_Node) {
  return !(
    is_ast_def_class(node) ||
        is_ast_defun(node) ||
        is_ast_let(node) ||
        is_ast_const(node) ||
        is_ast_export(node) ||
        is_ast_import(node)
  )
}

// tell me if a statement aborts
export function aborts (thing: any) {
  return thing?.aborts()
}

export function as_statement_array (thing: any) {
  if (thing === null) return []
  if (is_ast_block_statement(thing)) return thing.body
  if (is_ast_empty_statement(thing)) return []
  if (is_ast_statement(thing)) return [thing]
  throw new Error("Can't convert thing to statement array")
}

export function extract_declarations_from_unreachable_code (compressor: Compressor, stat: AST_Statement, target: AST_Node[]) {
  if (!(is_ast_defun(stat))) {
    compressor.warn('Dropping unreachable code [{file}:{line},{col}]', stat.start)
  }
  walk(stat, (node: AST_Node) => {
    if (is_ast_var(node)) {
      compressor.warn('Declarations in unreachable code! [{file}:{line},{col}]', node.start)
      node.remove_initializers()
      target.push(node)
      return true
    }
    if (
      is_ast_defun(node) &&
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
    if (is_ast_scope(node)) {
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
export function walk (node: AST_Node, cb: Function, to_visit: AST_Node[] = [node]) {
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

export function read_property (obj: any, key: any) {
  key = get_value(key)
  if (is_ast_node(key)) return
  let value
  if (is_ast_array(obj)) {
    const elements = obj.elements
    if (key == 'length') return make_node_from_constant(elements.length, obj)
    if (typeof key === 'number' && key in elements) value = elements[key]
  } else if (is_ast_object(obj)) {
    key = '' + key
    const props = obj.properties
    for (let i = props.length; --i >= 0;) {
      const prop = props[i]
      if (is_ast_object_key_val(prop)) {
        if (!value && prop.key === key) value = prop.value
      } else {
        return
      }
    }
  }
  return is_ast_symbol_ref(value) && value.fixed_value() || value
}

export function get_value (key: AST_Node) {
  if (is_ast_constant(key)) {
    return key.getValue()
  }
  if (is_ast_unary_prefix(key) &&
        key.operator == 'void' &&
        is_ast_constant(key.expression)) {
    return
  }
  return key
}

export function make_node_from_constant (val: any, orig: AST_Node) {
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

export function has_break_or_continue (loop: AST_Node, parent?: AST_Node) {
  let found = false
  const tw = new TreeWalker(function (node: AST_Node) {
    if (found || is_ast_scope(node)) return true
    if (is_ast_loop_control(node) && tw.loopcontrol_target(node) === loop) {
      return (found = true)
    }
  })
  if (is_ast_labeled_statement(parent)) tw.push(parent)
  tw.push(loop)
  loop.body.walk(tw)
  return found
}

// Drop side-effect-free elements from an array of expressions.
// Returns an array of expressions with side-effects or null
// if all elements were dropped. Note: original array may be
// returned if nothing changed.
export function trim (nodes: any[], compressor: Compressor, first_in_statement?: Function | boolean) {
  const len = nodes.length
  if (!len) return null
  const ret: any[] = []; let changed = false
  for (let i = 0; i < len; i++) {
    const node = nodes[i].drop_side_effect_free(compressor, first_in_statement)
    changed = (node !== nodes[i]) || changed
    if (node) {
      ret.push(node)
      first_in_statement = false
    }
  }
  return changed ? ret.length ? ret : null : nodes
}

export function print_property_name (key: string, quote: string, output: OutputStream) {
  if (output.option('quote_keys')) {
    return output.print_string(key)
  }
  if ('' + +key == key && Number(key) >= 0) {
    if (output.option('keep_numbers')) {
      return output.print(key)
    }
    return output.print(make_num(Number(key)))
  }
  const print_string = RESERVED_WORDS.has(key)
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

/* #__INLINE__ */
export const key_size = (key: any) =>
  typeof key === 'string' ? key.length : 0

/* #__INLINE__ */
export const static_size = (is_static: boolean) => is_static ? 7 : 0

/* #__INLINE__ */
export const def_size = (size: number, def: AST_Definitions) => size + list_overhead(def.definitions)

/* #__INLINE__ */
export const lambda_modifiers = (func: any) =>
  (func.is_generator ? 1 : 0) + (func.async ? 6 : 0)

export function is_undeclared_ref (node: any): node is AST_SymbolRef {
  return is_ast_symbol_ref(node) && node.definition?.().undeclared
}

export function safe_to_flatten (value: any, compressor: Compressor) {
  if (is_ast_symbol_ref(value)) {
    value = value.fixed_value()
  }
  if (!value) return false
  if (!(is_ast_lambda(value) || is_ast_class(value))) return true
  if (!(is_ast_lambda(value) && value.contains_this())) return true
  return is_ast_new(compressor.parent())
}

export function is_empty (thing: any) {
  if (thing === null) return true
  if (is_ast_empty_statement(thing)) return true
  if (is_ast_block_statement(thing)) return thing.body.length == 0
  return false
}

export function display_body (body: any[], is_toplevel: boolean, output: OutputStream, allow_directives: boolean) {
  const last = body.length - 1
  output.in_directive = allow_directives
  body.forEach(function (stmt, i) {
    if (output.in_directive && !(is_ast_directive(stmt) ||
            is_ast_empty_statement(stmt) ||
            (is_ast_simple_statement(stmt) && is_ast_string(stmt.body))
    )) {
      output.in_directive = false
    }
    if (!(is_ast_empty_statement(stmt))) {
      output.indent()
      stmt.print(output)
      if (!(i == last && is_toplevel)) {
        output.newline()
        if (is_toplevel) output.newline()
      }
    }
    if (output.in_directive &&
            is_ast_simple_statement(stmt) &&
            is_ast_string(stmt.body)
    ) {
      output.in_directive = false
    }
  })
  output.in_directive = false
}

export function parenthesize_for_noin (node: AST_Node, output: OutputStream, noin: boolean) {
  let parens = false
  // need to take some precautions here:
  //    https://github.com/mishoo/UglifyJS2/issues/60
  if (noin) {
    parens = walk(node, (node: AST_Node) => {
      if (is_ast_scope(node)) return true
      if (is_ast_binary(node) && node.operator == 'in') {
        return walk_abort // makes walk() return true
      }
      return undefined
    })
  }
  node.print(output, parens)
}

export const suppress = (node: AST_Node) => walk(node, (node: AST_Node) => {
  if (!(is_ast_symbol(node))) return
  const d = node.definition?.()
  if (!d) return
  if (is_ast_symbol_ref(node)) d.references.push(node)
  d.fixed = false
})

export function redefined_catch_def (def: SymbolDef) {
  if (is_ast_symbol_catch(def.orig[0]) &&
        def.scope.is_block_scope()
  ) {
    return def.scope.get_defun_scope().variables.get(def.name)
  }
}

/* -----[ code generators ]----- */

/* -----[ utils ]----- */

export function skip_string (node: AST_Node) {
  if (is_ast_string(node)) {
    base54.consider(node.value, -1)
  } else if (is_ast_conditional(node)) {
    skip_string(node.consequent)
    skip_string(node.alternative)
  } else if (is_ast_sequence(node)) {
    skip_string(node.tail_node?.())
  }
}

export function next_mangled (scope: AST_Scope, options: any) {
  const ext = scope.enclosed
  while (true) {
    const m = base54(++scope.cname)
    if (RESERVED_WORDS.has(m)) continue // skip over "do"

    // https://github.com/mishoo/UglifyJS2/issues/242 -- do not
    // shadow a name reserved from mangling.
    if (options.reserved?.has(m)) continue

    // Functions with short names might collide with base54 output
    // and therefore cause collisions when keep_fnames is true.
    if (unmangleable_names?.has(m)) continue

    // we must ensure that the mangled name does not shadow a name
    // from some parent scope that is referenced in this or in
    // inner scopes.
    let shouldContinue = false
    for (let i = ext.length; --i >= 0;) {
      const def = ext[i]
      const name = def.mangled_name || (def.unmangleable(options) && def.name)
      if (m == name) {
        shouldContinue = true
        break
      }
    }
    if (shouldContinue) continue
    return m
  }
}

export function reset_variables (tw: TreeWalker, compressor: Compressor, node: AST_Accessor | AST_Toplevel) {
  node.variables.forEach(function (def: SymbolDef) {
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

export function safe_to_assign (tw: TreeWalker, def: SymbolDef, scope: AST_Scope, value: any) {
  if (def.fixed === undefined) return true
  let def_safe_ids: any
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
  if (is_ast_defun(def.fixed)) {
    return is_ast_node(value) && def.fixed.parent_scope === scope
  }
  return def.orig.every((sym: AST_Symbol) => {
    return !(is_ast_symbol_const(sym) || is_ast_symbol_defun(sym) || is_ast_symbol_lambda(sym))
  })
}

export function safe_to_read (tw: TreeWalker, def: SymbolDef) {
  if (def.single_use == 'm') return false
  if (tw.safe_ids[def.id]) {
    if (def.fixed == null) {
      const orig = def.orig[0]
      if (is_ast_symbol_funarg(orig) || orig.name == 'arguments') return false
      def.fixed = make_node('AST_Undefined', orig)
    }
    return true
  }
  return is_ast_defun(def.fixed)
}

export function ref_once (tw: TreeWalker, compressor: Compressor, def: SymbolDef) {
  return compressor.option('unused') &&
        !def.scope.pinned() &&
        def.references.length - def.recursive_refs == 1 &&
        tw.loop_ids.get(def.id) === tw.in_loop
}

export function is_immutable (value: any) {
  if (!value) return false
  return value.is_constant() || is_ast_lambda(value) || is_ast_this(value)
}

export function mark_escaped (tw: TreeWalker, d: any, scope: AST_Scope, node: AST_Node, value: any, level: number, depth: number) {
  const parent = tw.parent(level)
  if (value) {
    if (value.is_constant()) return
    if (is_ast_class_expression(value)) return
  }
  if (is_ast_assign(parent) && parent.operator == '=' && node === parent.right ||
        is_ast_call(parent) && (node !== parent.expression || is_ast_new(parent)) ||
        is_ast_exit(parent) && node === parent.value && node.scope !== d.scope ||
        is_ast_var_def(parent) && node === parent.value ||
        is_ast_yield(parent) && node === parent.value && node.scope !== d.scope) {
    if (depth > 1 && !(value?.is_constant_expression(scope))) depth = 1
    if (!d.escaped || d.escaped > depth) d.escaped = depth
    return
  } else if (is_ast_array(parent) ||
        is_ast_await(parent) ||
        is_ast_binary(parent) && lazy_op.has(parent.operator) ||
        is_ast_conditional(parent) && node !== parent.condition ||
        is_ast_expansion(parent) ||
        is_ast_sequence(parent) && node === parent.tail_node?.()) {
    mark_escaped(tw, d, scope, parent, parent, level + 1, depth)
  } else if (is_ast_object_key_val(parent) && node === parent.value) {
    const obj = tw.parent(level + 1)
    mark_escaped(tw, d, scope, obj, obj, level + 2, depth)
  } else if (is_ast_prop_access(parent) && node === parent.expression) {
    value = read_property(value, parent.property)
    mark_escaped(tw, d, scope, parent, value, level + 1, depth + 1)
    if (value) return
  }
  if (level > 0) return
  if (is_ast_sequence(parent) && node !== parent.tail_node?.()) return
  if (is_ast_simple_statement(parent)) return
  d.direct_access = true
}

export function recursive_ref (compressor: TreeWalker, def: SymbolDef) {
  let node
  for (let i = 0; (node = compressor.parent(i)); i++) {
    if (
      is_ast_lambda(node) ||
            is_ast_class(node)
    ) {
      const name = node.name
      if (name && name.definition?.() === def) break
    }
  }
  return node
}

export function to_node (value: any, orig: AST_Node): AST_Node {
  if (is_ast_node(value)) return make_node(value.constructor.name as any, orig, value)
  if (Array.isArray(value)) {
    return make_node('AST_Array', orig, {
      elements: value.map(function (value) {
        return to_node(value, orig)
      })
    })
  }
  if (value && typeof value === 'object') {
    const props: any[] = []
    for (const key in value) {
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
export function basic_negation (exp: AST_Node) {
  return make_node('AST_UnaryPrefix', exp, {
    operator: '!',
    expression: exp
  })
}

export function best (orig: AST_Node, alt: AST_Node, first_in_statement: Function | boolean) {
  const negated = basic_negation(orig)
  if (first_in_statement) {
    const stat = make_node('AST_SimpleStatement', alt, {
      body: alt
    })
    return best_of_expression(negated, stat) === stat ? alt : negated
  }
  return best_of_expression(negated, alt)
}

/* -----[ boolean/negation helpers ]----- */

export function is_iife_call (node: AST_Node): boolean {
  // Used to determine whether the node can benefit from negation.
  // Not the case with arrow functions (you need an extra set of parens).
  if (node.TYPE != 'Call') return false
  return is_ast_function(node.expression) || (node.expression != null && is_iife_call(node.expression))
}

export function is_object (node: AST_Node) {
  return is_ast_array(node) || is_ast_lambda(node) || is_ast_object(node) || is_ast_class(node)
}

export function within_array_or_object_literal (compressor: Compressor) {
  let node; let level = 0
  while ((node = compressor.parent(level++))) {
    if (is_ast_statement(node)) return false
    if (is_ast_array(node) || is_ast_object_key_val(node) || is_ast_object(node)) {
      return true
    }
  }
  return false
}

export function is_nullish (node: AST_Node): boolean {
  let fixed
  return (
    is_ast_null(node) ||
        is_undefined(node) ||
        (is_ast_symbol_ref(node) && is_ast_node((fixed = node.definition?.().fixed)) && is_nullish(fixed))
  ) as any
}

export function is_nullish_check (check: any, check_subject: AST_Node, compressor: Compressor) {
  if (check_subject.may_throw(compressor)) return false

  let nullish_side

  // foo == null
  if (
    is_ast_binary(check) &&
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
  if (is_ast_binary(check) && check.operator === '||') {
    let null_cmp
    let undefined_cmp

    const find_comparison = (cmp: AST_Node) => {
      if (!(
        is_ast_binary(cmp) &&
                (cmp.operator === '===' || cmp.operator === '==')
      )) {
        return false
      }

      let found = 0
      let defined_side

      if (is_ast_null(cmp.left)) {
        found++
        null_cmp = cmp
        defined_side = cmp.right
      }
      if (is_ast_null(cmp.right)) {
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

      if (!defined_side?.equivalent_to(check_subject)) {
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
export function retain_top_func (fn: AST_Node, compressor: Compressor) {
  return compressor.top_retain &&
        is_ast_defun(fn) &&
        has_flag(fn, TOP) &&
        fn.name &&
        compressor.top_retain(fn.name)
}

export function find_scope (tw: TreeWalker) {
  for (let i = 0; ;i++) {
    const p = tw.parent(i)
    if (is_ast_toplevel(p)) return p
    if (is_ast_lambda(p)) return p
    if (p.block_scope) return p.block_scope
  }
}

export function find_variable (compressor: Compressor, name: any) {
  let scope: any
  let i = 0
  while ((scope = compressor.parent(i++))) {
    if (is_ast_scope(scope)) break
    if (is_ast_catch(scope) && scope.argname) {
      scope = (scope.argname as any).definition?.().scope
      break
    }
  }
  return scope.find_variable(name)
}

export function scope_encloses_variables_in_this_scope (scope: AST_Scope, pulled_scope: AST_Scope) {
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

export function is_atomic (lhs: AST_Node, self: AST_Node) {
  return is_ast_symbol_ref(lhs) || lhs.TYPE === self.TYPE
}

export function is_reachable (self: AST_Node, defs: SymbolDef[]) {
  const find_ref = (node: AST_Node) => {
    if (is_ast_symbol_ref(node) && member(node.definition?.(), defs)) {
      return walk_abort
    }
  }

  return walk_parent(self, (node: AST_Node, info: any) => {
    if (is_ast_scope(node) && node !== self) {
      const parent = info.parent()
      if (is_ast_call(parent) && parent.expression === node) return
      if (walk(node, find_ref)) {
        return walk_abort
      }
      return true
    }
  })
}

// Returns whether the leftmost item in the expression is an object
export function left_is_object (node: AST_Node): boolean {
  if (is_ast_object(node)) return true
  if (is_ast_sequence(node)) return left_is_object(node.expressions[0])
  if (node.TYPE === 'Call') return node.expression != null && left_is_object(node.expression)
  if (is_ast_prefixed_template_string(node)) return left_is_object(node.prefix)
  if (is_ast_dot(node) || is_ast_sub(node)) return left_is_object(node.expression)
  if (is_ast_conditional(node)) return left_is_object(node.condition)
  if (is_ast_binary(node)) return left_is_object(node.left)
  if (is_ast_unary_postfix(node)) return left_is_object(node.expression)
  return false
}

export function to_moz_block (node: AST_Node) {
  return {
    type: 'BlockStatement',
    body: node.body.map(to_moz)
  }
}

export function to_moz_scope (type: string, node: AST_Node): MozillaAst {
  const body = node.body.map(to_moz)
  if (is_ast_simple_statement(node.body[0]) && is_ast_string((node.body[0]).body)) {
    body.unshift(to_moz(new AST_EmptyStatement(node.body[0])))
  }
  return {
    type: type,
    body: body
  }
}

export function To_Moz_FunctionExpression (M: AST_Lambda, parent: any): MozillaAstFunctionExpression {
  const is_generator = parent.is_generator !== undefined
    ? parent.is_generator : M.is_generator
  return {
    type: 'FunctionExpression',
    id: M.name ? to_moz(M.name) : null,
    params: M.argnames.map(to_moz),
    generator: is_generator,
    async: M.async,
    body: to_moz_scope('BlockStatement', M)
  }
}

export const base54 = (() => {
  const leading = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_'.split('')
  const digits = '0123456789'.split('')
  let chars: string[]
  let frequency: Map<string, number>
  function reset () {
    frequency = new Map()
    leading.forEach(function (ch) {
      frequency.set(ch, 0)
    })
    digits.forEach(function (ch) {
      frequency.set(ch, 0)
    })
  }
  base54.consider = function (str: string, delta: number) {
    for (let i = str.length; --i >= 0;) {
      frequency.set(str[i], (frequency.get(str[i]) ?? NaN) + delta) // TODO: check type
    }
  }
  function compare (a: string, b: string) {
    return (frequency.get(b) ?? NaN) - (frequency.get(a) ?? NaN)
  }
  base54.sort = function () {
    chars = mergeSort(leading, compare).concat(mergeSort(digits, compare))
  }
  base54.reset = reset
  reset()
  function base54 (num: number) {
    let ret = ''; let base = 54
    num++
    do {
      num--
      ret += chars[num % base]
      num = Math.floor(num / base)
      base = 64
    } while (num > 0)
    return ret
  }
  return base54
})()

export function in_function_defs (id: any) {
  return function_defs?.has(id)
}

const shallow_cmp = (node1: AST_Node | null, node2: AST_Node | null) => {
  return (
    node1 === null && node2 === null ||
        node1?.TYPE === node2?.TYPE && node1?.shallow_cmp(node2)
  )
}

export const equivalent_to = (tree1: any, tree2: any) => {
  if (!shallow_cmp(tree1, tree2)) return false
  const walk_1_state = [tree1]
  const walk_2_state = [tree2]

  const walk_1_push = walk_1_state.push.bind(walk_1_state)
  const walk_2_push = walk_2_state.push.bind(walk_2_state)

  while (walk_1_state.length && walk_2_state.length) {
    const node_1 = walk_1_state.pop()
    const node_2 = walk_2_state.pop()

    if (!shallow_cmp(node_1, node_2)) return false

    node_1._children_backwards(walk_1_push)
    node_2._children_backwards(walk_2_push)

    if (walk_1_state.length !== walk_2_state.length) {
      // Different number of children
      return false
    }
  }

  return walk_1_state.length == 0 && walk_2_state.length == 0
}

export function is_ast_accessor (node: any): node is AST_Accessor {
  return node instanceof AST_Node && node.isAst('AST_Accessor')
}

export function is_ast_arrow (node: any): node is AST_Arrow {
  return node instanceof AST_Node && node.isAst('AST_Arrow')
}

export function is_ast_defun (node: any): node is AST_Defun {
  return node instanceof AST_Node && node.isAst('AST_Defun')
}

export function is_ast_function (node: any): node is AST_Function {
  return node instanceof AST_Node && node.isAst('AST_Function')
}

export function is_ast_class_expression (node: any): node is AST_ClassExpression {
  return node instanceof AST_Node && node.isAst('AST_ClassExpression')
}

export function is_ast_def_class (node: any): node is AST_DefClass {
  return node instanceof AST_Node && node.isAst('AST_DefClass')
}

export function is_ast_toplevel (node: any): node is AST_Toplevel {
  return node instanceof AST_Node && node.isAst('AST_Toplevel')
}

export function is_ast_lambda (node: any): node is AST_Lambda {
  return node instanceof AST_Node && node.isAst('AST_Lambda')
}

export function is_ast_class (node: any): node is AST_Class {
  return node instanceof AST_Node && node.isAst('AST_Class')
}

export function is_ast_scope (node: any): node is AST_Scope {
  return node instanceof AST_Node && node.isAst('AST_Scope')
}

export function is_ast_conditional (node: any): node is AST_Conditional {
  return node instanceof AST_Node && node.isAst('AST_Conditional')
}

export function is_ast_symbol_export (node: any): node is AST_SymbolExport {
  return node instanceof AST_Node && node.isAst('AST_SymbolExport')
}

export function is_ast_symbol_ref (node: any): node is AST_SymbolRef {
  return node instanceof AST_Node && node.isAst('AST_SymbolRef')
}

export function is_ast_false (node: any): node is AST_False {
  return node instanceof AST_Node && node.isAst('AST_False')
}

export function is_ast_true (node: any): node is AST_True {
  return node instanceof AST_Node && node.isAst('AST_True')
}

export function is_ast_super (node: any): node is AST_Super {
  return node instanceof AST_Node && node.isAst('AST_Super')
}

export function is_ast_finally (node: any): node is AST_Finally {
  return node instanceof AST_Node && node.isAst('AST_Finally')
}

export function is_ast_catch (node: any): node is AST_Catch {
  return node instanceof AST_Node && node.isAst('AST_Catch')
}

export function is_ast_switch (node: any): node is AST_Switch {
  return node instanceof AST_Node && node.isAst('AST_Switch')
}

export function is_ast_try (node: any): node is AST_Try {
  return node instanceof AST_Node && node.isAst('AST_Try')
}

export function is_ast_unary (node: any): node is AST_Unary {
  return node instanceof AST_Node && node.isAst('AST_Unary')
}

export function is_ast_unary_prefix (node: any): node is AST_UnaryPrefix {
  return node instanceof AST_Node && node.isAst('AST_UnaryPrefix')
}

export function is_ast_unary_postfix (node: any): node is AST_UnaryPostfix {
  return node instanceof AST_Node && node.isAst('AST_UnaryPostfix')
}

export function is_ast_var_def (node: any): node is AST_VarDef {
  return node instanceof AST_Node && node.isAst('AST_VarDef')
}

export function is_ast_name_mapping (node: any): node is AST_NameMapping {
  return node instanceof AST_Node && node.isAst('AST_NameMapping')
}

export function is_ast_import (node: any): node is AST_Import {
  return node instanceof AST_Node && node.isAst('AST_Import')
}

export function is_ast_await (node: any): node is AST_Await {
  return node instanceof AST_Node && node.isAst('AST_Await')
}

export function is_ast_yield (node: any): node is AST_Yield {
  return node instanceof AST_Node && node.isAst('AST_Yield')
}

export function is_ast_undefined (node: any): node is AST_Undefined {
  return node instanceof AST_Node && node.isAst('AST_Undefined')
}

export function is_ast_boolean (node: any): node is AST_Boolean {
  return node instanceof AST_Node && node.isAst('AST_Boolean')
}

export function is_ast_infinity (node: any): node is AST_Infinity {
  return node instanceof AST_Node && node.isAst('AST_Infinity')
}

export function is_ast_na_n (node: any): node is AST_NaN {
  return node instanceof AST_Node && node.isAst('AST_NaN')
}

export function is_ast_for_of (node: any): node is AST_ForOf {
  return node instanceof AST_Node && node.isAst('AST_ForOf')
}

export function is_ast_for_in (node: any): node is AST_ForIn {
  return node instanceof AST_Node && node.isAst('AST_ForIn')
}

export function is_ast_for (node: any): node is AST_For {
  return node instanceof AST_Node && node.isAst('AST_For')
}

export function is_ast_sequence (node: any): node is AST_Sequence {
  return node instanceof AST_Node && node.isAst('AST_Sequence')
}

export function is_ast_block_statement (node: any): node is AST_BlockStatement {
  return node instanceof AST_Node && node.isAst('AST_BlockStatement')
}

export function is_ast_var (node: any): node is AST_Var {
  return node instanceof AST_Node && node.isAst('AST_Var')
}

export function is_ast_let (node: any): node is AST_Let {
  return node instanceof AST_Node && node.isAst('AST_Let')
}

export function is_ast_const (node: any): node is AST_Const {
  return node instanceof AST_Node && node.isAst('AST_Const')
}

export function is_ast_if (node: any): node is AST_If {
  return node instanceof AST_Node && node.isAst('AST_If')
}

export function is_ast_export (node: any): node is AST_Export {
  return node instanceof AST_Node && node.isAst('AST_Export')
}

export function is_ast_definitions (node: any): node is AST_Definitions {
  return node instanceof AST_Node && node.isAst('AST_Definitions')
}

export function is_ast_template_string (node: any): node is AST_TemplateString {
  return node instanceof AST_Node && node.isAst('AST_TemplateString')
}

export function is_ast_destructuring (node: any): node is AST_Destructuring {
  return node instanceof AST_Node && node.isAst('AST_Destructuring')
}

export function is_ast_dot (node: any): node is AST_Dot {
  return node instanceof AST_Node && node.isAst('AST_Dot')
}

export function is_ast_sub (node: any): node is AST_Sub {
  return node instanceof AST_Node && node.isAst('AST_Sub')
}

export function is_ast_prop_access (node: any): node is AST_PropAccess {
  return node instanceof AST_Node && node.isAst('AST_PropAccess')
}

export function is_ast_concise_method (node: any): node is AST_ConciseMethod {
  return node instanceof AST_Node && node.isAst('AST_ConciseMethod')
}

export function is_ast_class_property (node: any): node is AST_ClassProperty {
  return node instanceof AST_Node && node.isAst('AST_ClassProperty')
}

export function is_ast_object_getter (node: any): node is AST_ObjectGetter {
  return node instanceof AST_Node && node.isAst('AST_ObjectGetter')
}

export function is_ast_object_setter (node: any): node is AST_ObjectSetter {
  return node instanceof AST_Node && node.isAst('AST_ObjectSetter')
}

export function is_ast_object_key_val (node: any): node is AST_ObjectKeyVal {
  return node instanceof AST_Node && node.isAst('AST_ObjectKeyVal')
}

export function is_ast_prefixed_template_string (node: any): node is AST_PrefixedTemplateString {
  return node instanceof AST_Node && node.isAst('AST_PrefixedTemplateString')
}

export function is_ast_object_property (node: any): node is AST_ObjectProperty {
  return node instanceof AST_Node && node.isAst('AST_ObjectProperty')
}

export function is_ast_object (node: any): node is AST_Object {
  return node instanceof AST_Node && node.isAst('AST_Object')
}

export function is_ast_array (node: any): node is AST_Array {
  return node instanceof AST_Node && node.isAst('AST_Array')
}

export function is_ast_symbol_export_foreign (node: any): node is AST_SymbolExportForeign {
  return node instanceof AST_Node && node.isAst('AST_SymbolExportForeign')
}

export function is_ast_label_ref (node: any): node is AST_LabelRef {
  return node instanceof AST_Node && node.isAst('AST_LabelRef')
}

export function is_ast_this (node: any): node is AST_This {
  return node instanceof AST_Node && node.isAst('AST_This')
}

export function is_ast_label (node: any): node is AST_Label {
  return node instanceof AST_Node && node.isAst('AST_Label')
}

export function is_ast_symbol_import_foreign (node: any): node is AST_SymbolImportForeign {
  return node instanceof AST_Node && node.isAst('AST_SymbolImportForeign')
}

export function is_ast_symbol_import (node: any): node is AST_SymbolImport {
  return node instanceof AST_Node && node.isAst('AST_SymbolImport')
}

export function is_ast_symbol_catch (node: any): node is AST_SymbolCatch {
  return node instanceof AST_Node && node.isAst('AST_SymbolCatch')
}

export function is_ast_symbol_class (node: any): node is AST_SymbolClass {
  return node instanceof AST_Node && node.isAst('AST_SymbolClass')
}

export function is_ast_symbol_def_class (node: any): node is AST_SymbolDefClass {
  return node instanceof AST_Node && node.isAst('AST_SymbolDefClass')
}

export function is_ast_symbol_lambda (node: any): node is AST_SymbolLambda {
  return node instanceof AST_Node && node.isAst('AST_SymbolLambda')
}

export function is_ast_symbol_class_property (node: any): node is AST_SymbolClassProperty {
  return node instanceof AST_Node && node.isAst('AST_SymbolClassProperty')
}

export function is_ast_symbol_method (node: any): node is AST_SymbolMethod {
  return node instanceof AST_Node && node.isAst('AST_SymbolMethod')
}

export function is_ast_symbol_defun (node: any): node is AST_SymbolDefun {
  return node instanceof AST_Node && node.isAst('AST_SymbolDefun')
}

export function is_ast_symbol_funarg (node: any): node is AST_SymbolFunarg {
  return node instanceof AST_Node && node.isAst('AST_SymbolFunarg')
}

export function is_ast_symbol_let (node: any): node is AST_SymbolLet {
  return node instanceof AST_Node && node.isAst('AST_SymbolLet')
}

export function is_ast_symbol_const (node: any): node is AST_SymbolConst {
  return node instanceof AST_Node && node.isAst('AST_SymbolConst')
}

export function is_ast_symbol_block_declaration (node: any): node is AST_SymbolBlockDeclaration {
  return node instanceof AST_Node && node.isAst('AST_SymbolBlockDeclaration')
}

export function is_ast_symbol_var (node: any): node is AST_SymbolVar {
  return node instanceof AST_Node && node.isAst('AST_SymbolVar')
}

export function is_ast_symbol_declaration (node: any): node is AST_SymbolDeclaration {
  return node instanceof AST_Node && node.isAst('AST_SymbolDeclaration')
}

export function is_ast_symbol (node: any): node is AST_Symbol {
  return node instanceof AST_Node && node.isAst('AST_Symbol')
}

export function is_ast_default (node: any): node is AST_Default {
  return node instanceof AST_Node && node.isAst('AST_Default')
}

export function is_ast_case (node: any): node is AST_Case {
  return node instanceof AST_Node && node.isAst('AST_Case')
}

export function is_ast_node (node: any): node is AST_Node {
  return node instanceof AST_Node && node.isAst('AST_Node')
}

export function is_ast_statement (node: any): node is AST_Statement {
  return node instanceof AST_Node && node.isAst('AST_Statement')
}

export function is_ast_debugger (node: any): node is AST_Debugger {
  return node instanceof AST_Node && node.isAst('AST_Debugger')
}

export function is_ast_directive (node: any): node is AST_Directive {
  return node instanceof AST_Node && node.isAst('AST_Directive')
}

export function is_ast_simple_statement (node: any): node is AST_SimpleStatement {
  return node instanceof AST_Node && node.isAst('AST_SimpleStatement')
}

export function is_ast_empty_statement (node: any): node is AST_EmptyStatement {
  return node instanceof AST_Node && node.isAst('AST_EmptyStatement')
}

export function is_ast_new_target (node: any): node is AST_NewTarget {
  return node instanceof AST_Node && node.isAst('AST_NewTarget')
}

export function is_ast_expansion (node: any): node is AST_Expansion {
  return node instanceof AST_Node && node.isAst('AST_Expansion')
}

export function is_ast_template_segment (node: any): node is AST_TemplateSegment {
  return node instanceof AST_Node && node.isAst('AST_TemplateSegment')
}

export function is_ast_constant (node: any): node is AST_Constant {
  return node instanceof AST_Node && node.isAst('AST_Constant')
}

export function is_ast_string (node: any): node is AST_String {
  return node instanceof AST_Node && node.isAst('AST_String')
}

export function is_ast_number (node: any): node is AST_Number {
  return node instanceof AST_Node && node.isAst('AST_Number')
}

export function is_ast_big_int (node: any): node is AST_BigInt {
  return node instanceof AST_Node && node.isAst('AST_BigInt')
}

export function is_ast_reg_exp (node: any): node is AST_RegExp {
  return node instanceof AST_Node && node.isAst('AST_RegExp')
}

export function is_ast_atom (node: any): node is AST_Atom {
  return node instanceof AST_Node && node.isAst('AST_Atom')
}

export function is_ast_null (node: any): node is AST_Null {
  return node instanceof AST_Node && node.isAst('AST_Null')
}

export function is_ast_hole (node: any): node is AST_Hole {
  return node instanceof AST_Node && node.isAst('AST_Hole')
}

export function is_ast_jump (node: any): node is AST_Jump {
  return node instanceof AST_Node && node.isAst('AST_Jump')
}

export function is_ast_exit (node: any): node is AST_Exit {
  return node instanceof AST_Node && node.isAst('AST_Exit')
}

export function is_ast_loop_control (node: any): node is AST_LoopControl {
  return node instanceof AST_Node && node.isAst('AST_LoopControl')
}

export function is_ast_return (node: any): node is AST_Return {
  return node instanceof AST_Node && node.isAst('AST_Return')
}

export function is_ast_statement_with_body (node: any): node is AST_StatementWithBody {
  return node instanceof AST_Node && node.isAst('AST_StatementWithBody')
}

export function is_ast_throw (node: any): node is AST_Throw {
  return node instanceof AST_Node && node.isAst('AST_Throw')
}

export function is_ast_block (node: any): node is AST_Block {
  return node instanceof AST_Node && node.isAst('AST_Block')
}

export function is_ast_break (node: any): node is AST_Break {
  return node instanceof AST_Node && node.isAst('AST_Break')
}

export function is_ast_labeled_statement (node: any): node is AST_LabeledStatement {
  return node instanceof AST_Node && node.isAst('AST_LabeledStatement')
}

export function is_ast_iteration_statement (node: any): node is AST_IterationStatement {
  return node instanceof AST_Node && node.isAst('AST_IterationStatement')
}

export function is_ast_with (node: any): node is AST_With {
  return node instanceof AST_Node && node.isAst('AST_With')
}

export function is_ast_d_w_loop (node: any): node is AST_DWLoop {
  return node instanceof AST_Node && node.isAst('AST_DWLoop')
}

export function is_ast_continue (node: any): node is AST_Continue {
  return node instanceof AST_Node && node.isAst('AST_Continue')
}

export function is_ast_while (node: any): node is AST_While {
  return node instanceof AST_Node && node.isAst('AST_While')
}

export function is_ast_do (node: any): node is AST_Do {
  return node instanceof AST_Node && node.isAst('AST_Do')
}

export function is_ast_switch_branch (node: any): node is AST_SwitchBranch {
  return node instanceof AST_Node && node.isAst('AST_SwitchBranch')
}

export function is_ast_call (node: any): node is AST_Call {
  return node instanceof AST_Node && node.isAst('AST_Call')
}

export function is_ast_new (node: any): node is AST_New {
  return node instanceof AST_Node && node.isAst('AST_New')
}

export function is_ast_binary (node: any): node is AST_Binary {
  return node instanceof AST_Node && node.isAst('AST_Binary')
}

export function is_ast_assign (node: any): node is AST_Assign {
  return node instanceof AST_Node && node.isAst('AST_Assign')
}

export function is_ast_default_assign (node: any): node is AST_DefaultAssign {
  return node instanceof AST_Node && node.isAst('AST_DefaultAssign')
}
