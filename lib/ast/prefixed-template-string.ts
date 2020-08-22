import AST_Node from './node'
import { pass_through, to_moz, is_ast_lambda, is_ast_binary, is_ast_conditional, is_ast_sequence, is_ast_unary, is_ast_dot, is_ast_object } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_PrefixedTemplateString extends AST_Node {
  template_string: any
  prefix: any

  _optimize (compressor) {
    return this
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function () {
      this.prefix._walk(visitor)
      this.template_string._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.template_string)
    push(this.prefix)
  }

  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    self.prefix = self.prefix.transform(tw)
    self.template_string = self.template_string.transform(tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'TaggedTemplateExpression',
      tag: to_moz(this.prefix),
      quasi: to_moz(this.template_string)
    }
  }

  _codegen (self, output) {
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
  constructor (args?) { // eslint-disable-line
    super(args)
    this.template_string = args.template_string
    this.prefix = args.prefix
  }
}
