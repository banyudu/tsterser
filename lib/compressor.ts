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
  defaults,
  HOP,
  return_true,
  walk,
  string_template, is_ast_symbol_defun, is_ast_scope
} from './utils'
import AST_Node from './ast/node'
import AST_Toplevel from './ast/toplevel'
import { parse } from './parse'

import { SQUEEZED, has_flag, set_flag } from './constants'
import TreeWalker from './tree-walker'

export default class Compressor extends TreeWalker {
  options: any
  pure_funcs: any
  top_retain: ((def: any) => any) | undefined
  toplevel: { funcs: any, vars: any }
  sequences_limit: number
  warnings_produced: AnyObject
  evaluated_regexps: Map<any, any>
  constructor (options: any, false_by_default?: boolean) {
    super()
    if (options.defaults !== undefined && !options.defaults) false_by_default = true
    this.options = defaults(options, {
      arguments: false,
      arrows: !false_by_default,
      booleans: !false_by_default,
      booleans_as_integers: false,
      collapse_vars: !false_by_default,
      comparisons: !false_by_default,
      computed_props: !false_by_default,
      conditionals: !false_by_default,
      dead_code: !false_by_default,
      defaults: true,
      directives: !false_by_default,
      drop_console: false,
      drop_debugger: !false_by_default,
      ecma: 5,
      evaluate: !false_by_default,
      expression: false,
      global_defs: false,
      hoist_funs: false,
      hoist_props: !false_by_default,
      hoist_vars: false,
      ie8: false,
      if_return: !false_by_default,
      inline: !false_by_default,
      join_vars: !false_by_default,
      keep_classnames: false,
      keep_fargs: true,
      keep_fnames: false,
      keep_infinity: false,
      loops: !false_by_default,
      module: false,
      negate_iife: !false_by_default,
      passes: 1,
      properties: !false_by_default,
      pure_getters: !false_by_default && 'strict',
      pure_funcs: null,
      reduce_funcs: null, // legacy
      reduce_vars: !false_by_default,
      sequences: !false_by_default,
      side_effects: !false_by_default,
      switches: !false_by_default,
      top_retain: null,
      toplevel: !!(options && options.top_retain),
      typeofs: !false_by_default,
      unsafe: false,
      unsafe_arrows: false,
      unsafe_comps: false,
      unsafe_Function: false,
      unsafe_math: false,
      unsafe_symbols: false,
      unsafe_methods: false,
      unsafe_proto: false,
      unsafe_regexp: false,
      unsafe_undefined: false,
      unused: !false_by_default,
      warnings: false
    }, true)
    const global_defs = this.options.global_defs as AnyObject
    if (typeof global_defs === 'object') {
      for (const key in global_defs) {
        if (key[0] === '@' && HOP(global_defs, key)) {
          global_defs[key.slice(1)] = parse(global_defs[key], {
            expression: true
          })
        }
      }
    }
    if (this.options.inline === true) this.options.inline = 3
    const pure_funcs = this.options.pure_funcs
    if (typeof pure_funcs === 'function') {
      this.pure_funcs = pure_funcs
    } else {
      this.pure_funcs = pure_funcs ? function (node: AST_Node) {
        return !pure_funcs?.includes(node.expression.print_to_string())
      } : return_true
    }
    let top_retain = this.options.top_retain
    if (top_retain instanceof RegExp) {
      this.top_retain = function (def) {
        return (top_retain as RegExp).test(def.name)
      }
    } else if (typeof top_retain === 'function') {
      this.top_retain = top_retain
    } else if (top_retain) {
      if (typeof top_retain === 'string') {
        top_retain = top_retain.split(/,/)
      }
      this.top_retain = function (def) {
        return (top_retain as string[]).includes(def.name)
      }
    }
    if (this.options.module) {
      this.directives['use strict'] = true
      this.options.toplevel = true
    }
    const toplevel = this.options.toplevel
    this.toplevel = typeof toplevel === 'string' ? {
      funcs: toplevel.includes('funcs'),
      vars: toplevel.includes('vars')
    } : {
      funcs: toplevel,
      vars: toplevel
    }
    const sequences = this.options.sequences
    this.sequences_limit = sequences == 1 ? 800 : sequences as number | 0
    this.warnings_produced = {}
    this.evaluated_regexps = new Map()
  }

  option<T extends keyof any>(key: T) {
    return this.options[key]
  }

  exposed (def: any) {
    if (def.export) return true
    if (def.global) {
      for (let i = 0, len = def.orig.length; i < len; i++) {
        if (!this.toplevel[is_ast_symbol_defun(def.orig[i]) ? 'funcs' : 'vars']) { return true }
      }
    }
    return false
  }

  in_boolean_context () {
    if (!this.option('booleans')) return false
    let self = this.self()
    for (var i = 0, p; (p = this.parent(i)); i++) {
      const result = p?._in_boolean_context(self)
      if (result) {
        return true
      }
      if (p?._in_boolean_context_next(self)) {
        self = p
      } else {
        return false
      }
    }
  }

  compress (toplevel: AST_Toplevel) {
    toplevel = toplevel.resolve_defines(this)
    if (this.option('expression')) {
      toplevel.process_expression(true)
    }
    const passes = Number(this.options.passes) || 1
    let min_count = 1 / 0
    let stopping = false
    const mangle = { ie8: this.option('ie8') }
    for (let pass = 0; pass < passes; pass++) {
      toplevel.figure_out_scope(mangle)
      if (pass === 0 && this.option('drop_console')) {
        // must be run before reduce_vars and compress pass
        toplevel = toplevel.drop_console()
      }
      if (pass > 0 || this.option('reduce_vars')) {
        toplevel.reset_opt_flags(this)
      }
      toplevel = toplevel.transform(this)
      if (passes > 1) {
        let count = 0
        walk(toplevel, () => { count++ })
        this.info('pass ' + pass + ': last_count: ' + min_count + ', count: ' + count)
        if (count < min_count) {
          min_count = count
          stopping = false
        } else if (stopping) {
          break
        } else {
          stopping = true
        }
      }
    }
    if (this.option('expression')) {
      toplevel.process_expression(false)
    }
    return toplevel
  }

  info (text: string, props?: AnyObject<any>) {
    if (this.options.warnings == 'verbose') {
            AST_Node.warn?.(text, props)
    }
  }

  warn (text: string, props: AnyObject<any>) {
    if (this.options.warnings) {
      // only emit unique warnings
      const message = string_template(text, props)
      if (!(message in this.warnings_produced)) {
        this.warnings_produced[message] = true
                AST_Node.warn?.apply(AST_Node, [text, props])
      }
    }
  }

  clear_warnings () {
    this.warnings_produced = {}
  }

  before (node: AST_Node, descend: Function) {
    if (has_flag(node, SQUEEZED)) return node
    let was_scope = false
    if (is_ast_scope(node)) {
      node = node.hoist_properties(this)
      if (is_ast_scope(node)) {
        node = node.hoist_declarations(this)
      }
      was_scope = true
    }
    // Before https://github.com/mishoo/UglifyJS2/pull/1602 AST_Node.optimize()
    // would call AST_Node.transform() if a different instance of AST_Node is
    // produced after def_optimize().
    // This corrupts TreeWalker.stack, which cause AST look-ups to malfunction.
    // Migrate and defer all children's AST_Node.transform() to below, which
    // will now happen after this parent AST_Node has been properly substituted
    // thus gives a consistent AST snapshot.
    descend(node, this)
    // Existing code relies on how AST_Node.optimize() worked, and omitting the
    // following replacement call would result in degraded efficiency of both
    // output and performance.
    descend(node, this)
    const opt: any = node.optimize(this)
    if (was_scope && is_ast_scope(opt)) {
            opt.drop_unused?.(this)
            descend(opt, this)
    }
    if (opt === node) set_flag(opt, SQUEEZED)
    return opt
  }
}
