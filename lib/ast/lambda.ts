import AST_Expansion from './expansion'
import AST_Destructuring from './destructuring'
import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Scope from './scope'
import AST_SymbolFunarg from './symbol-funarg'
import TreeWalker from '../tree-walker'

import { opt_AST_Lambda, To_Moz_FunctionExpression, all_refs_local, walk, do_list, print_braced, walk_body, init_scope_vars, mark_lambda, is_ast_this, is_ast_scope, is_ast_destructuring, is_ast_node, is_ast_symbol, is_ast_arrow } from '../utils'

import { walk_abort } from '../constants'
import Compressor from '../compressor'
import { AST_DefaultAssign, AST_SymbolDeclaration } from '.'

export default class AST_Lambda extends AST_Scope {
  argnames: Array<AST_SymbolFunarg|AST_Destructuring|AST_Expansion|AST_DefaultAssign>
  uses_arguments: boolean
  name: AST_SymbolDeclaration | undefined
  is_generator: boolean
  async: boolean

  _optimize (compressor: Compressor): any {
    return opt_AST_Lambda(this, compressor)
  }

  may_throw () { return false }
  has_side_effects () { return false }
  _eval (compressor: Compressor) { return this }
  is_constant_expression = all_refs_local

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    return mark_lambda.call(this, tw, descend, compressor)
  }

  contains_this () {
    return walk(this, (node: AST_Node) => {
      if (is_ast_this(node)) return walk_abort
      if (
        node !== this &&
              is_ast_scope(node) &&
              !(is_ast_arrow(node))
      ) {
        return true
      }
    })
  }

  is_block_scope () { return false }
  init_scope_vars (...args) {
    init_scope_vars.apply(this, args)
    this.uses_arguments = false
    this.def_variable(new AST_SymbolFunarg({
      name: 'arguments',
      start: this.start,
      end: this.end
    }))
  }

  args_as_names () {
    const out: any[] = []
    for (let i = 0; i < this.argnames.length; i++) {
      const arg = this.argnames[i]
      if (is_ast_destructuring(arg)) {
        out.push(...arg.all_symbols())
      } else {
        out.push(this.argnames[i])
      }
    }
    return out
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      if (this.name) this.name._walk(visitor)
      const argnames = this.argnames
      for (let i = 0, len = argnames.length; i < len; i++) {
        argnames[i]._walk(visitor)
      }
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])

    i = this.argnames.length
    while (i--) push(this.argnames[i])

    if (this.name) push(this.name)
  }

  shallow_cmp_props: any = {
    is_generator: 'eq',
    async: 'eq'
  }

  _transform (tw: TreeWalker) {
    if (this.name) this.name = this.name.transform(tw)
    this.argnames = do_list(this.argnames, tw)
    if (is_ast_node(this.body)) {
      this.body = (this.body).transform(tw)
    } else {
      this.body = do_list(this.body, tw)
    }
  }

  _to_mozilla_ast (parent: AST_Node) {
    return To_Moz_FunctionExpression(this, parent)
  }

  _do_print (this: any, output: OutputStream, nokeyword?: boolean) {
    const self = this
    if (!nokeyword) {
      if (self.async) {
        output.print('async')
        output.space()
      }
      output.print('function')
      if (self.is_generator) {
        output.star()
      }
      if (self.name) {
        output.space()
      }
    }
    if (is_ast_symbol(self.name)) {
      self.name.print(output)
    } else if (nokeyword && is_ast_node(self.name)) {
      output.with_square(function () {
                self.name?.print(output) // Computed method name
      })
    }
    output.with_parens(function () {
      self.argnames.forEach(function (arg, i) {
        if (i) output.comma()
        arg.print(output)
      })
    })
    output.space()
    print_braced(self, output, true)
  }

  _codegen (self: AST_Lambda, output: OutputStream) {
    self._do_print(output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Base class for functions'
  static propdoc = {
    name: '[AST_SymbolDeclaration?] the name of this function',
    argnames: '[AST_SymbolFunarg|AST_Destructuring|AST_Expansion|AST_DefaultAssign*] array of function arguments, destructurings, or expanding arguments',
    uses_arguments: '[boolean] tells whether this function accesses the arguments array',
    is_generator: '[boolean] is this a generator method',
    async: '[boolean] is this method async'
  }

  static PROPS = AST_Scope.PROPS.concat(['name', 'argnames', 'uses_arguments', 'is_generator', 'async'])
  constructor (args?) {
    super(args)
    this.name = args.name
    this.argnames = args.argnames
    this.uses_arguments = args.uses_arguments
    this.is_generator = args.is_generator
    this.async = args.async
  }
}