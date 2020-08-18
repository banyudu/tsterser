import AST_Lambda from './lambda'
import {
  opt_AST_Lambda,
  walk,
  return_false,
  basic_negation,
  list_overhead,
  lambda_modifiers,
  first_in_statement,
  return_null,
  next_mangled,
  To_Moz_FunctionExpression,
  make_node
} from '../utils'
import { walk_abort } from '../constants'

export default class AST_Function extends AST_Lambda {
  name: any

  _optimize (compressor) {
    const self = opt_AST_Lambda(this, compressor)
    if (compressor.option('unsafe_arrows') &&
          compressor.option('ecma') >= 2015 &&
          !self.name &&
          !self.is_generator &&
          !self.uses_arguments &&
          !self.pinned()) {
      const has_special_symbol = walk(self, (node: any) => {
        if (node?.isAst?.('AST_This')) return walk_abort
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

    var tricky_def = def.orig[0]?.isAst?.('AST_SymbolFunarg') && this.name && this.name.definition()

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
      if (p?.isAst?.('AST_Call') && p.expression === this) {
        return true
      }
    }

    if (output.option('wrap_func_args')) {
      var p = output.parent()
      if (p?.isAst?.('AST_Call') && p.args.includes(this)) {
        return true
      }
    }

    return false
  }

  static documentation = 'A function expression'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
