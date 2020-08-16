import AST_PropAccess from './prop-access'
import { is_lhs, make_node, best_of, is_strict, is_undeclared_ref, has_annotation, make_node_from_constant, mkshallow } from '../utils'
import { native_fns, _NOINLINE } from '../constants'
import { RESERVED_WORDS, is_identifier_string } from '../parse'

export default class AST_Dot extends AST_PropAccess {
  quote: any

  _prepend_comments_check (node) {
    return this.expression === node
  }

  _optimize (self, compressor) {
    if (self.property == 'arguments' || self.property == 'caller') {
      compressor.warn('Function.prototype.{prop} not supported [{file}:{line},{col}]', {
        prop: self.property,
        file: self.start.file,
        line: self.start.line,
        col: self.start.col
      })
    }
    const parent = compressor.parent()
    if (is_lhs(self, parent)) return self
    if (compressor.option('unsafe_proto') &&
          self.expression?.isAst?.('AST_Dot') &&
          self.expression.property == 'prototype') {
      var exp = self.expression.expression
      if (is_undeclared_ref(exp)) {
        switch (exp.name) {
          case 'Array':
            self.expression = make_node('AST_Array', self.expression, {
              elements: []
            })
            break
          case 'Function':
            self.expression = make_node('AST_Function', self.expression, {
              argnames: [],
              body: []
            })
            break
          case 'Number':
            self.expression = make_node('AST_Number', self.expression, {
              value: 0
            })
            break
          case 'Object':
            self.expression = make_node('AST_Object', self.expression, {
              properties: []
            })
            break
          case 'RegExp':
            self.expression = make_node('AST_RegExp', self.expression, {
              value: { source: 't', flags: '' }
            })
            break
          case 'String':
            self.expression = make_node('AST_String', self.expression, {
              value: ''
            })
            break
        }
      }
    }
    if (!(parent?.isAst?.('AST_Call')) || !has_annotation(parent, _NOINLINE)) {
      const sub = self.flatten_object(self.property, compressor)
      if (sub) return sub.optimize(compressor)
    }
    let ev = self.evaluate(compressor)
    if (ev !== self) {
      ev = make_node_from_constant(ev, self).optimize(compressor)
      return best_of(compressor, ev, self)
    }
    return self
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    if (this.expression.may_throw_on_access(compressor)) return this
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  may_throw (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.has_side_effects(compressor)
  }

  _find_defs (compressor: any, suffix) {
    return this.expression._find_defs(compressor, '.' + this.property + suffix)
  }

  _dot_throw (compressor: any) {
    if (!is_strict(compressor)) return false
    if (this.expression?.isAst?.('AST_Function') && this.property == 'prototype') return false
    return true
  }

  is_call_pure (compressor: any) {
    if (!compressor.option('unsafe')) return
    const expr = this.expression
    let map
    if (expr?.isAst?.('AST_Array')) {
      map = native_fns.get('Array')
    } else if (expr.is_boolean()) {
      map = native_fns.get('Boolean')
    } else if (expr.is_number(compressor)) {
      map = native_fns.get('Number')
    } else if (expr?.isAst?.('AST_RegExp')) {
      map = native_fns.get('RegExp')
    } else if (expr.is_string(compressor)) {
      map = native_fns.get('String')
    } else if (!this.may_throw_on_access(compressor)) {
      map = native_fns.get('Object')
    }
    return map && map.has(this.property)
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size (): number {
    return this.property.length + 1
  }

  shallow_cmp = mkshallow({ property: 'eq' })
  _transform (self, tw: any) {
    self.expression = self.expression.transform(tw)
  }

  _codegen (self, output) {
    var expr = self.expression
    expr.print(output)
    var prop: string = self.property as string
    var print_computed = RESERVED_WORDS.has(prop)
      ? output.option('ie8')
      : !is_identifier_string(prop, (output.option('ecma') as unknown as number) >= 2015)
    if (print_computed) {
      output.print('[')
      output.add_mapping(self.end)
      output.print_string(prop)
      output.print(']')
    } else {
      if (expr?.isAst?.('AST_Number') && expr.getValue() >= 0) {
        if (!/[xa-f.)]/i.test(output.last())) {
          output.print('.')
        }
      }
      output.print('.')
      // the name after dot would be mapped about here.
      output.add_mapping(self.end)
      output.print_name(prop)
    }
  }

  static documentation = 'A dotted property access expression'
  static propdoc = {
    quote: '[string] the original quote character when transformed from AST_Sub'
  }

  static PROPS = AST_PropAccess.PROPS.concat(['quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
  }
}
