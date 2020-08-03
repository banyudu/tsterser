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
  keep_name,
  mergeSort
} from './utils'
import {
  AST_Node,
  AST_SymbolCatch,
  AST_SymbolClass,
  AST_SymbolDefClass,
  AST_SymbolDefun,
  AST_SymbolLambda,
  AST_SymbolMethod
} from './ast'

const MASK_EXPORT_DONT_MANGLE = 1 << 0

export let function_defs: Set<any> | null = null
export const setFunctionDefs = val => {
  function_defs = val
}

class SymbolDef {
  name: any
  orig: any[]
  init: any
  eliminated: number
  assignments: number
  scope: any
  replaced: number
  global: boolean
  export: number
  mangled_name: any
  undeclared: boolean
  id: number
  static next_id: any
  chained: boolean
  direct_access: boolean
  escaped: number
  recursive_refs: number
  references: any[]
  should_replace: any
  single_use: boolean
  fixed: any
  constructor (scope: any | null, orig: { name: string }, init?: boolean) {
    this.name = orig.name
    this.orig = [orig]
    this.init = init
    this.eliminated = 0
    this.assignments = 0
    this.scope = scope
    this.replaced = 0
    this.global = false
    this.export = 0
    this.mangled_name = null
    this.undeclared = false
    this.id = SymbolDef.next_id++
    this.chained = false
    this.direct_access = false
    this.escaped = 0
    this.recursive_refs = 0
    this.references = []
    this.should_replace = undefined
    this.single_use = false
    this.fixed = false
    Object.seal(this)
  }

  fixed_value () {
    if (!this.fixed || this.fixed instanceof AST_Node) return this.fixed
    return this.fixed()
  }

  unmangleable (options: any) {
    if (!options) options = {}

    if (
      function_defs &&
            function_defs.has(this.id) &&
            keep_name(options.keep_fnames, this.orig[0].name)
    ) return true

    return this.global && !options.toplevel ||
            (this.export & MASK_EXPORT_DONT_MANGLE) ||
            this.undeclared ||
            !options.eval && this.scope.pinned() ||
            (this.orig[0] instanceof AST_SymbolLambda ||
                  this.orig[0] instanceof AST_SymbolDefun) && keep_name(options.keep_fnames, this.orig[0].name) ||
            this.orig[0] instanceof AST_SymbolMethod ||
            (this.orig[0] instanceof AST_SymbolClass ||
                  this.orig[0] instanceof AST_SymbolDefClass) && keep_name(options.keep_classnames, this.orig[0].name)
  }

  mangle (options: any) {
    const cache = options.cache && options.cache.props
    if (this.global && cache && cache.has(this.name)) {
      this.mangled_name = cache.get(this.name)
    } else if (!this.mangled_name && !this.unmangleable(options)) {
      var s = this.scope
      var sym = this.orig[0]
      if (options.ie8 && sym instanceof AST_SymbolLambda) { s = s.parent_scope }
      const redefinition = redefined_catch_def(this)
      this.mangled_name = redefinition
        ? redefinition.mangled_name || redefinition.name
        : s.next_mangled(options, this)
      if (this.global && cache) {
        cache.set(this.name, this.mangled_name)
      }
    }
  }
}

SymbolDef.next_id = 1

function redefined_catch_def (def: any) {
  if (def.orig[0] instanceof AST_SymbolCatch &&
        def.scope.is_block_scope()
  ) {
    return def.scope.get_defun_scope().variables.get(def.name)
  }
}

const base54 = (() => {
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
    for (var i = str.length; --i >= 0;) {
      frequency.set(str[i], (frequency.get(str[i])) + delta) // TODO: check type
    }
  }
  function compare (a: string, b: string) {
    return (frequency.get(b)) - (frequency.get(a))
  }
  base54.sort = function () {
    chars = mergeSort(leading, compare).concat(mergeSort(digits, compare))
  }
  base54.reset = reset
  reset()
  function base54 (num: number) {
    var ret = ''; var base = 54
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

export {
  base54,
  SymbolDef
}
