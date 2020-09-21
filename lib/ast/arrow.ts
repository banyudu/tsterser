import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Lambda, { AST_Lambda_Props } from './lambda'
import {
  basic_negation,
  list_overhead,
  lambda_modifiers,
  left_is_object,
  to_moz, is_ast_prop_access, is_ast_binary, is_ast_assign, is_ast_unary, is_ast_call, is_ast_symbol, is_ast_return
} from '../utils'
import AST_Scope from './scope'
import Compressor from '../compressor'

export default class AST_Arrow extends AST_Lambda {
  public drop_side_effect_free (): any { return null }
  public negate (_compressor: Compressor, _first_in_statement: Function | boolean): AST_Node {
    return basic_negation(this)
  }

  public _dot_throw () { return false }
  protected init_scope_vars (parent_scope: AST_Scope) {
    this._init_scope_vars(parent_scope)
    this.uses_arguments = false
  }

  public _size (_info?: any): number {
    let args_and_arrow = 2 + list_overhead(this.argnames)

    if (!(this.argnames.length === 1 && is_ast_symbol(this.argnames[0]))) {
      args_and_arrow += 2
    }

    // return lambda_modifiers(this) + args_and_arrow + (Array.isArray(this.body) ? list_overhead(this.body) : (this.body as any)._size())
    return lambda_modifiers(this) + args_and_arrow + list_overhead(this.body)
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
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

  protected needs_parens (output: OutputStream): boolean {
    const p = output.parent()
    return is_ast_prop_access(p) && p.expression === this
  }

  public _do_print (output: OutputStream) {
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
      this.print_braced(output)
    }
    if (needs_parens) { output.print(')') }
  }

  static documentation = 'An ES6 Arrow function ((a) => b)'

  static PROPS = AST_Lambda.PROPS
}

export interface AST_Arrow_Props extends AST_Lambda_Props {
}
