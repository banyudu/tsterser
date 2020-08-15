import AST_Binary from './binary'
import AST_Lambda from './lambda'
import AST_Scope from './scope'

import {
  is_reachable,
  make_node,
  return_true,
  safe_to_assign,
  mark,
  is_modified,
  to_moz,
  mark_escaped,
  suppress,
  needsParens
} from '../utils'

import { ASSIGN_OPS, set_flag, WRITE_ONLY, binary, ASSIGN_OPS_COMMUTATIVE } from '../constants'

import {
  IPropAccess,
  ISymbolRef
} from '../../types/ast'

export default class AST_Assign extends AST_Binary {
  _optimize (self, compressor) {
    var def
    if (compressor.option('dead_code') &&
          self.left?.isAst?.('AST_SymbolRef') &&
          (def = self.left.definition?.()).scope === compressor.find_parent(AST_Lambda)) {
      var level = 0; var node; var parent = self
      do {
        node = parent
        parent = compressor.parent(level++)
        if (parent?.isAst?.('AST_Exit')) {
          if (in_try(level, parent)) break
          if (is_reachable(def.scope, [def])) break
          if (self.operator == '=') return self.right
          def.fixed = false
          return make_node('AST_Binary', self, {
            operator: self.operator.slice(0, -1),
            left: self.left,
            right: self.right
          }).optimize(compressor)
        }
      } while (parent?.isAst?.('AST_Binary') && parent.right === node ||
              parent?.isAst?.('AST_Sequence') && parent.tail_node() === node)
    }
    self = self.lift_sequences(compressor)
    if (self.operator == '=' && self.left?.isAst?.('AST_SymbolRef') && self.right?.isAst?.('AST_Binary')) {
      // x = expr1 OP expr2
      if (self.right.left?.isAst?.('AST_SymbolRef') &&
              self.right.left.name == self.left.name &&
              ASSIGN_OPS.has(self.right.operator)) {
        // x = x - 2  --->  x -= 2
        self.operator = self.right.operator + '='
        self.right = self.right.right
      } else if (self.right.right?.isAst?.('AST_SymbolRef') &&
              self.right.right.name == self.left.name &&
              ASSIGN_OPS_COMMUTATIVE.has(self.right.operator) &&
              !self.right.left.has_side_effects(compressor)) {
        // x = 2 & x  --->  x &= 2
        self.operator = self.right.operator + '='
        self.right = self.right.left
      }
    }
    return self

    function in_try (level, node) {
      var right = self.right
      self.right = make_node('AST_Null', right)
      var may_throw = node.may_throw(compressor)
      self.right = right
      var scope = self.left.definition?.().scope
      var parent
      while ((parent = compressor.parent(level++)) !== scope) {
        if (parent?.isAst?.('AST_Try')) {
          if (parent.bfinally) return true
          if (may_throw && parent.bcatch) return true
        }
      }
    }
  }

  drop_side_effect_free (compressor: any) {
    var left = this.left
    if (left.has_side_effects(compressor) ||
          compressor.has_directive('use strict') &&
              left?.isAst?.<IPropAccess>('AST_PropAccess') &&
              left.expression.is_constant()) {
      return this
    }
    set_flag(this, WRITE_ONLY)
    while (left?.isAst?.<IPropAccess>('AST_PropAccess')) {
      left = left.expression
    }
    if (left.is_constant_expression(compressor.find_parent(AST_Scope))) {
      return this.right.drop_side_effect_free(compressor)
    }
    return this
  }

  may_throw (compressor: any) {
    if (this.right.may_throw(compressor)) return true
    if (!compressor.has_directive('use strict') &&
          this.operator == '=' &&
          this.left?.isAst?.('AST_SymbolRef')) {
      return false
    }
    return this.left.may_throw(compressor)
  }

  has_side_effects = return_true
  is_string (compressor: any) {
    return (this.operator == '=' || this.operator == '+=') && this.right.is_string(compressor)
  }

  is_number (compressor: any) {
    return binary.has(this.operator.slice(0, -1)) ||
          this.operator == '=' && this.right.is_number(compressor)
  }

  is_boolean () {
    return this.operator == '=' && this.right.is_boolean()
  }

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    var node = this
    if (node.left?.isAst?.('AST_Destructuring')) {
      suppress(node.left)
      return
    }
    var sym = node.left
    if (!(sym?.isAst?.<ISymbolRef>('AST_SymbolRef'))) return
    var def = sym.definition?.()
    var safe = safe_to_assign(tw, def, sym.scope, node.right)
    def.assignments++
    if (!safe) return
    var fixed = def.fixed
    if (!fixed && node.operator != '=') return
    var eq = node.operator == '='
    var value = eq ? node.right : node
    if (is_modified(compressor, tw, node, value, 0)) return
    def.references.push(sym)
    if (!eq) def.chained = true
    def.fixed = eq ? function () {
      return node.right
    } : function () {
      return make_node('AST_Binary', node, {
        operator: node.operator.slice(0, -1),
        left: fixed?.isAst?.('AST_Node') ? fixed : fixed(),
        right: node.right
      })
    }
    mark(tw, def, false)
    node.right.walk(tw)
    mark(tw, def, true)
    mark_escaped(tw, def, sym.scope, node, value, 0, 1)
    return true
  }

  _dot_throw (compressor: any) {
    return this.operator == '=' &&
          this.right._dot_throw(compressor)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'AssignmentExpression',
      operator: this.operator,
      left: to_moz(this.left),
      right: to_moz(this.right)
    }
  }

  needs_parens = needsParens
  static documentation = 'An assignment expression — `a = b + 5`'

  static PROPS = AST_Binary.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
