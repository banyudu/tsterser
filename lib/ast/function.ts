import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Lambda, { AST_Lambda_Props } from './lambda'
import Compressor from '../compressor'
import {
  walk,
  basic_negation,
  list_overhead,
  lambda_modifiers,
  first_in_statement,
  next_mangled,
  To_Moz_FunctionExpression,
  make_node, is_ast_this, is_ast_symbol_funarg, is_ast_call
} from '../utils'
import { walk_abort } from '../constants'
import SymbolDef from '../symbol-def'
import { MozillaAst } from '../types'

export default class AST_Function extends AST_Lambda {
  public name: any

  protected _optimize (compressor: Compressor): any {
    const self = super._optimize(compressor)
    if (compressor.option('unsafe_arrows') &&
          Number(compressor.option('ecma')) >= 2015 &&
          !self.name &&
          !self.is_generator &&
          !self.uses_arguments &&
          !self.pinned()) {
      const has_special_symbol = walk(self, (node: AST_Node) => {
        if (is_ast_this(node)) return walk_abort
        return undefined
      })
      if (!has_special_symbol) return make_node('AST_Arrow', self, self).optimize(compressor)
    }
    return self
  }

  public drop_side_effect_free (): AST_Function { return null as any }

  public _eval (compressor: Compressor) {
    if (compressor.option('unsafe')) {
      const fn: any = function () {}
      fn.node = this
      fn.toString = function () {
        return this.node.print_to_string()
      }
      return fn
    }
    return this
  }

  public negate (_compressor: Compressor, _first_in_statement: Function | boolean): AST_Node {
    return basic_negation(this)
  }

  public _dot_throw () { return false }
  protected next_mangled (options: any, def: SymbolDef) {
    // #179, #326
    // in Safari strict mode, something like (function x(x){...}) is a syntax error;
    // a function expression's argument cannot shadow the function expression's name

    const tricky_def = is_ast_symbol_funarg(def.orig[0]) && this.name && this.name.definition()

    // the function's mangled_name is null when keep_fnames is true
    const tricky_name = tricky_def ? tricky_def.mangled_name || tricky_def.name : null

    while (true) {
      const name = next_mangled(this as any, options)
      if (!tricky_name || tricky_name != name) { return name }
    }
  }

  public _size (info: any) {
    const first: any = !!first_in_statement(info)
    return (first * 2) + lambda_modifiers(this) + 12 + list_overhead(this.argnames) + list_overhead(this.body)
  }

  public _to_mozilla_ast (parent: AST_Node): MozillaAst {
    return To_Moz_FunctionExpression(this, parent)
  }

  // a function expression needs parens around it when it's provably
  // the first token to appear in a statement.
  protected needs_parens (output: OutputStream): boolean {
    if (!output.has_parens() && first_in_statement(output)) {
      return true
    }

    if (output.option('webkit')) {
      const p = output.parent()
      if (p?._needs_parens(this)) { return true }
    }

    if (output.option('wrap_iife')) {
      const p = output.parent()
      if (is_ast_call(p) && p.expression === this) {
        return true
      }
    }

    if (output.option('wrap_func_args')) {
      const p = output.parent()
      if (is_ast_call(p) && p.args.includes(this)) {
        return true
      }
    }

    return false
  }

  public static documentation = 'A function expression'

  public static PROPS =AST_Lambda.PROPS
}

export interface AST_Function_Props extends AST_Lambda_Props {
}
