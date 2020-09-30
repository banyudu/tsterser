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

import { defaults, base54, push_uniq, is_ast_object_key_val, is_ast_sequence, is_ast_object_property, is_ast_string, is_ast_sub, is_ast_dot, is_ast_conditional, is_ast_call } from './utils'
import TreeWalker from './tree-walker'
import { domprops } from '../tools/domprops'
import TreeTransformer from './tree-transformer'
import { AST_Node } from './ast'
import { ManglePropertiesOptions } from './types'

function find_builtins (reserved: Set<string | undefined>) {
  domprops.forEach(add)

  // Compatibility fix for some standard defined globals not defined on every js environment
  const new_globals = ['Symbol', 'Map', 'Promise', 'Proxy', 'Reflect', 'Set', 'WeakMap', 'WeakSet']
  const objects: any = {}
  const global_ref: AnyObject = typeof global === 'object' ? global : self

  new_globals.forEach(function (new_global) {
    objects[new_global] = global_ref[new_global] || (() => {})
  });

  [
    'null',
    'true',
    'false',
    'NaN',
    'Infinity',
    '-Infinity',
    'undefined'
  ].forEach(add);
  [Object, Array, Function, Number,
    String, Boolean, Error, Math,
    Date, RegExp, objects.Symbol, ArrayBuffer,
    DataView, decodeURI, decodeURIComponent,
    encodeURI, encodeURIComponent, eval, EvalError, // eslint-disable-line no-eval
    Float32Array, Float64Array, Int8Array, Int16Array,
    Int32Array, isFinite, isNaN, JSON, objects.Map, parseFloat,
    parseInt, objects.Promise, objects.Proxy, RangeError, ReferenceError,
    objects.Reflect, objects.Set, SyntaxError, TypeError, Uint8Array,
    Uint8ClampedArray, Uint16Array, Uint32Array, URIError,
    objects.WeakMap, objects.WeakSet
  ].forEach(function (ctor) {
    Object.getOwnPropertyNames(ctor).map(add)
    if (ctor.prototype) {
      Object.getOwnPropertyNames(ctor.prototype).map(add)
    }
  })
  function add (name: string) {
    reserved.add(name)
  }
}

export function reserve_quoted_keys (ast: AST_Node, reserved: string[]) {
  function add (name: string) {
    push_uniq(reserved, name)
  }

  ast.walk(new TreeWalker(function (node: AST_Node) {
    if (is_ast_object_key_val(node) && node.quote) {
      add(node.key)
    } else if (is_ast_object_property(node) && node.quote) {
      add((node.key as any).name)
    } else if (is_ast_sub(node)) {
      addStrings(node.property, add)
    }
  }))
}

function addStrings (node: AST_Node, add: Function) {
  node.walk(new TreeWalker(function (node: AST_Node) {
    node.addStrings(add)
    return true
  }))
}

export function mangle_properties (ast: AST_Node, opt: Partial<ManglePropertiesOptions>) {
  const defaultOptions: ManglePropertiesOptions = {
    builtins: false,
    cache: null,
    debug: false,
    keep_quoted: false,
    only_cache: false,
    regex: undefined,
    reserved: undefined,
    undeclared: false
  }

  const options = defaults(opt, defaultOptions, true)

  const reserved_option = Array.isArray(options.reserved) ? options.reserved : [options.reserved]
  const reserved = new Set(reserved_option)
  if (!options.builtins) find_builtins(reserved)

  let cname = -1
  let cache: Map<string, any>
  if (options.cache) {
    cache = options.cache.props
    cache.forEach(function (mangled_name) {
      reserved.add(mangled_name)
    })
  } else {
    cache = new Map()
  }

  const regex = options.regex && new RegExp(options.regex)

  // note debug is either false (disabled), or a string of the debug suffix to use (enabled).
  // note debug may be enabled as an empty string, which is falsey. Also treat passing 'true'
  // the same as passing an empty string.
  const debug = options.debug !== false
  let debug_name_suffix: string
  if (debug) {
    debug_name_suffix = (options.debug === true ? '' : options.debug as string)
  }

  const names_to_mangle = new Set()
  const unmangleable = new Set<string>()

  const keep_quoted_strict = options.keep_quoted === 'strict'

  // step 1: find candidates to mangle
  ast.walk(new TreeWalker(function (node: AST_Node) {
    if (is_ast_object_key_val(node)) {
      if (typeof node.key === 'string' &&
                (!keep_quoted_strict || !node.quote)) {
        add(node.key)
      }
    } else if (is_ast_object_property(node)) {
      // setter or getter, since KeyVal is handled above
      const key: AST_Node = node.key as any
      if (!keep_quoted_strict || !key.end.quote) {
        add(key.name)
      }
    } else if (is_ast_dot(node)) {
      let declared = !!options.undeclared
      if (!declared) {
        let root: any = node
        while (root.expression) {
          root = root.expression
        }
        declared = !(root.thedef?.undeclared)
      }
      if (declared &&
                (!keep_quoted_strict || !node.quote)) {
        add(node.property)
      }
    } else if (is_ast_sub(node)) {
      if (!keep_quoted_strict) {
        addStrings(node.property, add)
      }
    } else if (is_ast_call(node) &&
            node.expression.print_to_string() == 'Object.defineProperty') {
      addStrings(node.args[1], add)
    }
  }))

  // step 2: transform the tree, renaming properties
  return ast.transform(new TreeTransformer(function (node: AST_Node) {
    const key: AST_Node = node.key
    if (is_ast_object_key_val(node)) {
      if (typeof node.key === 'string' &&
                (!keep_quoted_strict || !node.quote)) {
        node.key = mangle(node.key)
      }
    } else if (is_ast_object_property(node)) {
      // setter, getter, method or class field
      if (!keep_quoted_strict || !key.end.quote) {
        key.name = mangle(key.name)
      }
    } else if (is_ast_dot(node)) {
      if (!keep_quoted_strict || !node.quote) {
        node.property = mangle(node.property)
      }
    } else if (!options.keep_quoted && is_ast_sub(node)) {
      node.property = mangleStrings(node.property)
    } else if (is_ast_call(node) &&
            node.expression.print_to_string() == 'Object.defineProperty') {
      node.args[1] = mangleStrings(node.args[1])
    }
  }))

  // only function declarations after this line

  function can_mangle (name: string) {
    if (unmangleable.has(name)) return false
    if (reserved.has(name)) return false
    if (options.only_cache) {
      return cache.has(name)
    }
    if (/^-?[0-9]+(\.[0-9]+)?(e[+-][0-9]+)?$/.test(name)) return false
    return true
  }

  function should_mangle (name: string) {
    if (regex && !regex.test(name)) return false
    if (reserved.has(name)) return false
    return cache.has(name) ||
            names_to_mangle.has(name)
  }

  function add (name: string) {
    if (can_mangle(name)) { names_to_mangle.add(name) }

    if (!should_mangle(name)) {
      unmangleable.add(name)
    }
  }

  function mangle (name: string) {
    if (!should_mangle(name)) {
      return name
    }

    let mangled = cache.get(name)
    if (!mangled) {
      if (debug) {
        // debug mode: use a prefix and suffix to preserve readability, e.g. o.foo -> o._$foo$NNN_.
        const debug_mangled = '_$' + name + '$' + debug_name_suffix + '_'

        if (can_mangle(debug_mangled)) {
          mangled = debug_mangled
        }
      }

      // either debug mode is off, or it is on and we could not use the mangled name
      if (!mangled) {
        do {
          mangled = base54(++cname)
        } while (!can_mangle(mangled))
      }

      cache.set(name, mangled)
    }
    return mangled
  }

  function mangleStrings (node: AST_Node) {
    return node.transform(new TreeTransformer(function (node: AST_Node) {
      if (is_ast_sequence(node)) {
        const last = node.expressions.length - 1
        node.expressions[last] = mangleStrings(node.expressions[last])
      } else if (is_ast_string(node)) {
        node.value = mangle(node.value)
      } else if (is_ast_conditional(node)) {
        node.consequent = mangleStrings(node.consequent)
        node.alternative = mangleStrings(node.alternative)
      }
      return node
    }))
  }
}
