import AST_Lambda from './lambda'
import {
  opt_AST_Lambda,
  basic_negation,
  init_scope_vars,
  return_null,
  list_overhead,
  return_false,
  lambda_modifiers,
  left_is_object,
  print_braced,
  to_moz
} from '../utils'

export default class AST_Arrow extends AST_Lambda {
  _optimize (compressor) {
    return opt_AST_Lambda(this, compressor)
  }

  drop_side_effect_free = return_null
  negate () {
    return basic_negation(this)
  }

  _dot_throw = return_false
  init_scope_vars = function () {
    init_scope_vars.apply(this, arguments)
    this.uses_arguments = false
  }

  _size = function (info?: any): number {
    let args_and_arrow = 2 + list_overhead(this.argnames)

    if (
      !(
        this.argnames.length === 1 &&
                this.argnames[0]?.isAst?.('AST_Symbol')
      )
    ) {
      args_and_arrow += 2
    }

    return lambda_modifiers(this) + args_and_arrow + (Array.isArray(this.body) ? list_overhead(this.body) : this.body._size())
  }

  _to_mozilla_ast (parent): any {
    var body = {
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

  needs_parens (output: any) {
    var p = output.parent()
    return p?.isAst?.('AST_PropAccess') && p.expression === this
  }

  _do_print (this: any, output: any) {
    var self = this
    var parent = output.parent()
    var needs_parens = (parent?.isAst?.('AST_Binary') && !(parent?.isAst?.('AST_Assign'))) ||
            parent?.isAst?.('AST_Unary') ||
            (parent?.isAst?.('AST_Call') && self === parent.expression)
    if (needs_parens) { output.print('(') }
    if (self.async) {
      output.print('async')
      output.space()
    }
    if (self.argnames.length === 1 && self.argnames[0]?.isAst?.('AST_Symbol')) {
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
            first_statement?.isAst?.('AST_Return')
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
