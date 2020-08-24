import AST_Node from './node'
import AST_DefaultAssign from './default-assign'
import Compressor from '../compressor'
import AST_Binary from './binary'
import AST_Lambda from './lambda'
import AST_Scope from './scope'
import TreeWalker from '../tree-walker'

import {
  is_reachable,
  make_node,
  safe_to_assign,
  mark,
  is_modified,
  to_moz,
  mark_escaped,
  suppress,
  needsParens,
  is_ast_symbol_ref,
  is_ast_try,
  is_ast_prop_access,
  is_ast_destructuring,
  is_ast_exit,
  is_ast_binary,
  is_ast_node,
  is_ast_sequence
} from '../utils'

import { ASSIGN_OPS, set_flag, WRITE_ONLY, binary, ASSIGN_OPS_COMMUTATIVE } from '../constants'

export default class AST_Assign extends AST_Binary {
  to_fun_args (croak: Function): any {
    const insert_default = (ex) => {
      if (this.right) {
        return new AST_DefaultAssign({
          start: ex.start,
          left: ex,
          operator: '=',
          right: this.right,
          end: this.right.end
        })
      }
      return ex
    }
    return insert_default(this.left.to_fun_args(croak))
  }

  _optimize (compressor: Compressor) {
    let self: any = this
    let def
    if (compressor.option('dead_code') &&
          is_ast_symbol_ref(self.left) &&
          (def = self.left.definition?.()).scope === compressor.find_parent(AST_Lambda)) {
      let level = 0; let node; let parent = self
      do {
        node = parent
        parent = compressor.parent(level++)
        if (is_ast_exit(parent)) {
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
      } while (is_ast_binary(parent) && parent.right === node ||
              is_ast_sequence(parent) && parent.tail_node() === node)
    }
    self = self.lift_sequences(compressor)
    if (self.operator == '=' && is_ast_symbol_ref(self.left) && is_ast_binary(self.right)) {
      // x = expr1 OP expr2
      if (is_ast_symbol_ref(self.right.left) &&
              self.right.left.name == self.left.name &&
              ASSIGN_OPS.has(self.right.operator)) {
        // x = x - 2  --->  x -= 2
        self.operator = self.right.operator + '='
        self.right = self.right.right
      } else if (is_ast_symbol_ref(self.right.right) &&
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
      const right = self.right
      self.right = make_node('AST_Null', right)
      const may_throw = node.may_throw(compressor)
      self.right = right
      const scope = self.left.definition?.().scope
      let parent
      while ((parent = compressor.parent(level++)) !== scope) {
        if (is_ast_try(parent)) {
          if (parent.bfinally) return true
          if (may_throw && parent.bcatch) return true
        }
      }
    }
  }

  drop_side_effect_free (compressor: Compressor) {
    let left = this.left
    if (left.has_side_effects(compressor) ||
          compressor.has_directive('use strict') &&
              is_ast_prop_access(left) &&
              left.expression.is_constant()) {
      return this
    }
    set_flag(this, WRITE_ONLY)
    while (is_ast_prop_access(left)) {
      left = left.expression
    }
    if (left.is_constant_expression(compressor.find_parent(AST_Scope))) {
      return this.right.drop_side_effect_free(compressor)
    }
    return this
  }

  may_throw (compressor: Compressor) {
    if (this.right.may_throw(compressor)) return true
    if (!compressor.has_directive('use strict') &&
          this.operator == '=' &&
          is_ast_symbol_ref(this.left)) {
      return false
    }
    return this.left.may_throw(compressor)
  }

  has_side_effects () { return true }
  is_string (compressor: Compressor) {
    return (this.operator == '=' || this.operator == '+=') && this.right.is_string(compressor)
  }

  is_number (compressor: Compressor) {
    return binary.has(this.operator.slice(0, -1)) ||
          this.operator == '=' && this.right.is_number(compressor)
  }

  is_boolean () {
    return this.operator == '=' && this.right.is_boolean()
  }

  reduce_vars (tw: TreeWalker, descend, compressor: Compressor) {
    const node = this
    if (is_ast_destructuring(node.left)) {
      suppress(node.left)
      return
    }
    const sym = node.left
    if (!(is_ast_symbol_ref(sym))) return
    const def = sym.definition?.()
    const safe = safe_to_assign(tw, def, sym.scope, node.right)
    def.assignments++
    if (!safe) return
    const fixed = def.fixed
    if (!fixed && node.operator != '=') return
    const eq = node.operator == '='
    const value = eq ? node.right : node
    if (is_modified(compressor, tw, node, value, 0)) return
    def.references.push(sym)
    if (!eq) def.chained = true
    def.fixed = eq ? function () {
      return node.right
    } : function () {
      return make_node('AST_Binary', node, {
        operator: node.operator.slice(0, -1),
        left: is_ast_node(fixed) ? fixed : fixed(),
        right: node.right
      })
    }
    mark(tw, def, false)
    node.right.walk(tw)
    mark(tw, def, true)
    mark_escaped(tw, def, sym.scope, node, value, 0, 1)
    return true
  }

  _dot_throw (compressor: Compressor) {
    return this.operator == '=' &&
          this.right._dot_throw(compressor)
  }

  _to_mozilla_ast (parent: AST_Node): any {
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
