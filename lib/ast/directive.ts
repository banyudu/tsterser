import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Statement from './statement'
import { directives } from '../constants'
import { make_node } from '../utils'

export default class AST_Directive extends AST_Statement {
  value: any
  quote: any
  _optimize (compressor: Compressor) {
    if (compressor.option('directives') &&
          (!directives.has(this.value) || compressor.has_directive(this.value) !== this)) {
      return make_node('AST_EmptyStatement', this)
    }
    return this
  }

  shallow_cmp_props: any = { value: 'eq' }
  _size (): number {
    // TODO string encoding stuff
    return 2 + this.value.length
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: this.value,
        raw: this.print_to_string()
      },
      directive: this.value
    }
  }

  _codegen (self: AST_Directive, output: OutputStream) {
    output.print_string(self.value, self.quote)
    output.semicolon()
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'Represents a directive, like "use strict";'
  static propdoc = {
    value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
    quote: '[string] the original quote character'
  } as any

  static PROPS = AST_Statement.PROPS.concat(['value', 'quote'])
  constructor (args?) {
    super(args)
    this.value = args.value
    this.quote = args.quote
  }
}
