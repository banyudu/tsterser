import AST_Atom from './atom'
import { make_node, To_Moz_Literal } from '../utils'

export default class AST_Boolean extends AST_Atom {
  _optimize (self, compressor) {
    if (compressor.in_boolean_context()) {
      return make_node('AST_Number', self, {
        value: +self.value
      })
    }
    var p = compressor.parent()
    if (compressor.option('booleans_as_integers')) {
      if (p?.isAst?.('AST_Binary') && (p.operator == '===' || p.operator == '!==')) {
        p.operator = p.operator.replace(/=$/, '')
      }
      return make_node('AST_Number', self, {
        value: +self.value
      })
    }
    if (compressor.option('booleans')) {
      if (p?.isAst?.('AST_Binary') && (p.operator == '==' ||
                                          p.operator == '!=')) {
        compressor.warn('Non-strict equality against boolean: {operator} {value} [{file}:{line},{col}]', {
          operator: p.operator,
          value: self.value,
          file: p.start.file,
          line: p.start.line,
          col: p.start.col
        })
        return make_node('AST_Number', self, {
          value: +self.value
        })
      }
      return make_node('AST_UnaryPrefix', self, {
        operator: '!',
        expression: make_node('AST_Number', self, {
          value: 1 - self.value
        })
      })
    }
    return self
  }

  _to_mozilla_ast (parent): any {
    return To_Moz_Literal(this)
  }

  static documentation = 'Base class for booleans'

  static PROPS = AST_Atom.PROPS
}
