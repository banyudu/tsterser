import AST_Statement from './statement'
import { directives } from '../constants'
import { AST_EmptyStatement } from './'
import { make_node, mkshallow } from '../utils'

export default class AST_Directive extends AST_Statement {
  value: any
  quote: any
  _optimize (self, compressor) {
    if (compressor.option('directives') &&
          (!directives.has(self.value) || compressor.has_directive(self.value) !== self)) {
      return make_node(AST_EmptyStatement, self)
    }
    return self
  }

  shallow_cmp = mkshallow({ value: 'eq' })
  _size = function (): number {
    // TODO string encoding stuff
    return 2 + this.value.length
  }

  _to_mozilla_ast = function To_Moz_Directive (M) {
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'Literal',
        value: M.value,
        raw: M.print_to_string()
      },
      directive: M.value
    }
  }

  _codegen (self, output) {
    output.print_string(self.value, self.quote)
    output.semicolon()
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'Represents a directive, like "use strict";'
  static propdoc = {
    value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
    quote: '[string] the original quote character'
  } as any

  CTOR = this.constructor
  TYPE = 'Statement'
  static PROPS = AST_Statement.PROPS.concat(['value', 'quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.value = args.value
    this.quote = args.quote
  }
}
