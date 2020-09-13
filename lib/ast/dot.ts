import AST_Node from './node'
import { OutputStream } from '../output'
import AST_PropAccess, { AST_PropAccess_Props } from './prop-access'
import Compressor from '../compressor'
import { is_lhs, make_node, best_of, is_strict, is_undeclared_ref, has_annotation, make_node_from_constant, is_ast_dot, is_ast_function, is_ast_array, is_ast_number, is_ast_call, is_ast_reg_exp } from '../utils'
import { native_fns, _NOINLINE } from '../constants'
import { RESERVED_WORDS, is_identifier_string } from '../parse'
import TreeTransformer from '../tree-transformer'

export default class AST_Dot extends AST_PropAccess {
  quote?: string
  property: string

  _prepend_comments_check (node: AST_Node) {
    return this.expression === node
  }

  _optimize (compressor: Compressor): any {
    if (this.property == 'arguments' || this.property == 'caller') {
      compressor.warn('Function.prototype.{prop} not supported [{file}:{line},{col}]', {
        prop: this.property,
        file: this.start.file,
        line: this.start.line,
        col: this.start.col
      })
    }
    const parent = compressor.parent()
    if (is_lhs(this, parent)) return this
    if (compressor.option('unsafe_proto') &&
          is_ast_dot(this.expression) &&
          this.expression.property == 'prototype') {
      const exp = this.expression.expression
      if (is_undeclared_ref(exp)) {
        switch (exp.name) {
          case 'Array':
            this.expression = make_node('AST_Array', this.expression, {
              elements: []
            })
            break
          case 'Function':
            this.expression = make_node('AST_Function', this.expression, {
              argnames: [],
              body: []
            })
            break
          case 'Number':
            this.expression = make_node('AST_Number', this.expression, {
              value: 0
            })
            break
          case 'Object':
            this.expression = make_node('AST_Object', this.expression, {
              properties: []
            })
            break
          case 'RegExp':
            this.expression = make_node('AST_RegExp', this.expression, {
              value: { source: 't', flags: '' }
            })
            break
          case 'String':
            this.expression = make_node('AST_String', this.expression, {
              value: ''
            })
            break
        }
      }
    }
    if (!(is_ast_call(parent)) || !has_annotation(parent, _NOINLINE)) {
      const sub = this.flatten_object(this.property, compressor)
      if (sub) return sub.optimize(compressor)
    }
    let ev = this.evaluate(compressor)
    if (ev !== this) {
      ev = make_node_from_constant(ev, this).optimize(compressor)
      return best_of(compressor, ev, this)
    }
    return this
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean): any {
    if (this.expression.may_throw_on_access(compressor)) return this
    return this.expression.drop_side_effect_free(compressor, first_in_statement)
  }

  may_throw (compressor: Compressor) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.expression.may_throw_on_access(compressor) ||
          this.expression.has_side_effects(compressor)
  }

  _find_defs (compressor: Compressor, suffix: string) {
    return this.expression._find_defs(compressor, '.' + this.property + suffix)
  }

  _dot_throw (compressor: Compressor) {
    if (!is_strict(compressor)) return false
    if (is_ast_function(this.expression) && this.property == 'prototype') return false
    return true
  }

  is_call_pure (compressor: Compressor) {
    if (!compressor.option('unsafe')) return
    const expr = this.expression
    let map
    if (is_ast_array(expr)) {
      map = native_fns.get('Array')
    } else if (expr.is_boolean()) {
      map = native_fns.get('Boolean')
    } else if (expr.is_number(compressor)) {
      map = native_fns.get('Number')
    } else if (is_ast_reg_exp(expr)) {
      map = native_fns.get('RegExp')
    } else if (expr.is_string(compressor)) {
      map = native_fns.get('String')
    } else if (!this.may_throw_on_access(compressor)) {
      map = native_fns.get('Object')
    }
    return map?.has(this.property)
  }

  walkInner () {
    const result: AST_Node[] = []
    result.push(this.expression)
    return result
  }

  _children_backwards (push: Function) {
    push(this.expression)
  }

  _size (): number {
    return this.property.length + 1
  }

  shallow_cmp_props: any = { property: 'eq' }
  _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
  }

  _codegen (output: OutputStream) {
    const expr = this.expression
    expr.print(output)
    const prop: string = this.property
    const print_computed = RESERVED_WORDS.has(prop)
      ? output.option('ie8')
      : !is_identifier_string(prop, (output.option('ecma') as unknown as number) >= 2015)
    if (print_computed) {
      output.print('[')
      output.add_mapping(this.end)
      output.print_string(prop)
      output.print(']')
    } else {
      if (is_ast_number(expr) && expr.getValue() >= 0) {
        if (!/[xa-f.)]/i.test(output.last())) {
          output.print('.')
        }
      }
      output.print('.')
      // the name after dot would be mapped about here.
      output.add_mapping(this.end)
      output.print_name(prop)
    }
  }

  static documentation = 'A dotted property access expression'
  static propdoc = {
    quote: '[string] the original quote character when transformed from AST_Sub'
  }

  static PROPS = AST_PropAccess.PROPS.concat(['quote'])
  constructor (args: AST_Dot_Props) {
    super(args)
    this.quote = args.quote
    this.property = args.property
  }
}

export interface AST_Dot_Props extends AST_PropAccess_Props {
  quote?: string | undefined
  property: string
}
