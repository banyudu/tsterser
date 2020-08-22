import AST_Atom from './atom'
import { make_node, To_Moz_Literal, is_ast_binary } from '../utils'

export default class AST_Boolean extends AST_Atom {
  _optimize (compressor) {
    if (compressor.in_boolean_context()) {
      return make_node('AST_Number', this, {
        value: +this.value
      })
    }
    const p = compressor.parent()
    if (compressor.option('booleans_as_integers')) {
      if (is_ast_binary(p) && (p.operator == '===' || p.operator == '!==')) {
        p.operator = p.operator.replace(/=$/, '')
      }
      return make_node('AST_Number', this, {
        value: +this.value
      })
    }
    if (compressor.option('booleans')) {
      if (is_ast_binary(p) && (p.operator == '==' ||
                                          p.operator == '!=')) {
        compressor.warn('Non-strict equality against boolean: {operator} {value} [{file}:{line},{col}]', {
          operator: p.operator,
          value: this.value,
          file: p.start.file,
          line: p.start.line,
          col: p.start.col
        })
        return make_node('AST_Number', this, {
          value: +this.value
        })
      }
      return make_node('AST_UnaryPrefix', this, {
        operator: '!',
        expression: make_node('AST_Number', this, {
          value: 1 - this.value
        })
      })
    }
    return this
  }

  _to_mozilla_ast (parent): any {
    return To_Moz_Literal(this)
  }

  static documentation = 'Base class for booleans'

  static PROPS = AST_Atom.PROPS
}
