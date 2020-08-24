import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Lambda from './lambda'
import {
  opt_AST_Lambda,
  basic_negation,
  init_scope_vars,
  list_overhead,
  lambda_modifiers,
  left_is_object,
  print_braced,
  to_moz, is_ast_prop_access, is_ast_binary, is_ast_assign, is_ast_unary, is_ast_call, is_ast_symbol, is_ast_return
} from '../utils'

export default class AST_Arrow extends AST_Lambda {
  _optimize (compressor: Compressor) {
    return opt_AST_Lambda(this, compressor)
  }

  drop_side_effect_free () { return null }
  negate () {
    return basic_negation(this)
  }

  _dot_throw () { return false }
  init_scope_vars (...args) {
    init_scope_vars.apply(this, args)
    this.uses_arguments = false
  }

  _size (info?: any): number {
    let args_and_arrow = 2 + list_overhead(this.argnames)

    if (
      !(
        this.argnames.length === 1 &&
                is_ast_symbol(this.argnames[0])
      )
    ) {
      args_and_arrow += 2
    }

    return lambda_modifiers(this) + args_and_arrow + (Array.isArray(this.body) ? list_overhead(this.body) : this.body._size())
  }

  _to_mozilla_ast (parent: AST_Node): any {
    const body = {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
    return {
      type: 'ArrowFunctionExpression',
      params: this.argnames.map(to_moz),
      async: this.async,
      body: body
    }
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    return is_ast_prop_access(p) && p.expression === this
  }

  _do_print (this: any, output: OutputStream) {
    const self = this
    const parent = output.parent()
    const needs_parens = (is_ast_binary(parent) && !(is_ast_assign(parent))) ||
            is_ast_unary(parent) ||
            (is_ast_call(parent) && self === parent.expression)
    if (needs_parens) { output.print('(') }
    if (self.async) {
      output.print('async')
      output.space()
    }
    if (self.argnames.length === 1 && is_ast_symbol(self.argnames[0])) {
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
            is_ast_return(first_statement)
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

  static documentation = 'An ES6 Arrow function ((a) => b)'

  static PROPS = AST_Lambda.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
