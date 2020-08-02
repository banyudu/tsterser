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

function make_node (ctor: any, orig?: any, props?: any) {
  if (!props) props = {}
  if (orig) {
    if (!props.start) props.start = orig.start
    if (!props.end) props.end = orig.end
  }
  return new ctor(props)
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
