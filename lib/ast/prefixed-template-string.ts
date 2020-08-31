import AST_PropAccess from './prop-access'
import AST_SymbolRef from './symbol-ref'
import AST_TemplateString from './template-string'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Node from './node'
import { to_moz, is_ast_lambda, is_ast_binary, is_ast_conditional, is_ast_sequence, is_ast_unary, is_ast_dot, is_ast_object } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_PrefixedTemplateString extends AST_Node {
  template_string: AST_TemplateString
  prefix: AST_SymbolRef|AST_PropAccess

  _optimize (compressor: Compressor) {
    return this
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.prefix._walk(visitor)
      this.template_string._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.template_string)
    push(this.prefix)
  }

  shallow_cmp_props: any = {}
  _transform (this: AST_PrefixedTemplateString, tw: TreeWalker) {
    this.prefix = this.prefix.transform(tw)
    this.template_string = this.template_string.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'TaggedTemplateExpression',
      tag: to_moz(this.prefix),
      quasi: to_moz(this.template_string)
    }
  }

  _codegen (self: AST_PrefixedTemplateString, output: OutputStream) {
    const tag = self.prefix
    const parenthesize_tag = is_ast_lambda(tag) ||
            is_ast_binary(tag) ||
            is_ast_conditional(tag) ||
            is_ast_sequence(tag) ||
            is_ast_unary(tag) ||
            is_ast_dot(tag) && is_ast_object(tag.expression)
    if (parenthesize_tag) output.print('(')
    self.prefix.print(output)
    if (parenthesize_tag) output.print(')')
    self.template_string.print(output)
  }

  static documentation = 'A templatestring with a prefix, such as String.raw`foobarbaz`'
  static propdoc = {
    template_string: '[AST_TemplateString] The template string',
    prefix: '[AST_SymbolRef|AST_PropAccess] The prefix, which can be a symbol such as `foo` or a dotted expression such as `String.raw`.'
  }

  static PROPS = AST_Node.PROPS.concat(['template_string', 'prefix'])
  constructor (args?) {
    super(args)
    this.template_string = args.template_string
    this.prefix = args.prefix
  }
}
