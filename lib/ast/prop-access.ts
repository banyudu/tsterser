import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import { is_undeclared_ref, HOP, make_node, make_sequence, to_moz, walk, safe_to_flatten, is_ast_node, is_ast_object, is_ast_object_key_val, is_ast_new, is_ast_scope, is_ast_dot, is_ast_concise_method, is_ast_call, is_ast_accessor, is_ast_symbol_method } from '../utils'
import { static_values, global_objs, walk_abort } from '../constants'

export default class AST_PropAccess extends AST_Node {
  expression: any
  property: any

  _needs_parens (child: AST_Node) {
    return this.expression === child
  }

  _eval (compressor: Compressor, depth: number) {
    if (compressor.option('unsafe')) {
      let key = this.property
      if (is_ast_node(key)) {
        key = key._eval?.(compressor, depth)
        if (key === this.property) return this
      }
      const exp = this.expression
      let val
      if (is_undeclared_ref(exp)) {
        let aa
        let first_arg = exp.name === 'hasOwnProperty' &&
                  key === 'call' &&
                  (aa = compressor.parent() && compressor.parent().args) &&
                  (aa?.[0]?.evaluate(compressor))

        first_arg = is_ast_dot(first_arg) ? first_arg.expression : first_arg

        if (first_arg == null || first_arg.thedef?.undeclared) {
          return this.clone()
        }
        const static_value = static_values.get(exp.name)
        if (!static_value || !static_value.has(key)) return this
        val = global_objs[exp.name]
      } else {
        val = exp._eval(compressor, depth + 1)
        if (!val || val === exp || !HOP(val, key)) return this
        if (typeof val === 'function') {
          switch (key) {
            case 'name':
              return val.node.name ? val.node.name.name : ''
            case 'length':
              return val.node.argnames.length
            default:
              return this
          }
        }
      }
      return val[key]
    }
    return this
  }

  flatten_object (key, compressor: Compressor) {
    if (!compressor.option('properties')) return
    const arrows = compressor.option('unsafe_arrows') && compressor.option('ecma') >= 2015
    const expr = this.expression
    if (is_ast_object(expr)) {
      const props: any = expr.properties
      for (let i = props.length; --i >= 0;) {
        const prop = props[i]
        if ('' + (is_ast_concise_method(prop) ? prop.key.name : prop.key) == key) {
          if (!props.every((prop) => {
            return is_ast_object_key_val(prop) ||
                          arrows && is_ast_concise_method(prop) && !prop.is_generator
          })) break
          if (!safe_to_flatten(prop.value, compressor)) break
          return make_node('AST_Sub', this, {
            expression: make_node('AST_Array', expr, {
              elements: props.map(function (prop) {
                let v = prop.value
                if (is_ast_accessor(v)) v = make_node('AST_Function', v, v)
                const k = prop.key
                if (is_ast_node(k) && !(is_ast_symbol_method(k))) {
                  return make_sequence(prop, [k, v])
                }
                return v
              })
            }),
            property: make_node('AST_Number', this, {
              value: i
            })
          })
        }
      }
    }
  }

  shallow_cmp_props: any = {}
  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'MemberExpression',
      object: to_moz(this.expression),
      computed: false,
      property: { type: 'Identifier', name: this.property }
    }
  }

  needs_parens (output: OutputStream) {
    const p = output.parent()
    if (is_ast_new(p) && p.expression === this) {
      // i.e. new (foo.bar().baz)
      //
      // if there's one call into this subtree, then we need
      // parens around it too, otherwise the call will be
      // interpreted as passing the arguments to the upper New
      // expression.
      return walk(this, (node: AST_Node) => {
        if (is_ast_scope(node)) return true
        if (is_ast_call(node)) {
          return walk_abort // makes walk() return true.
        }
        return undefined
      })
    }
    return undefined
  }

  static documentation = 'Base class for property access expressions, i.e. `a.foo` or `a["foo"]`'
  static propdoc = {
    expression: '[AST_Node] the “container” expression',
    property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
  } as any

  static PROPS = AST_Node.PROPS.concat(['expression', 'property'])
  constructor (args?: AST_PropAccess_Props) {
    super(args)
    this.expression = args.expression
    this.property = args.property
  }
}

export interface AST_PropAccess_Props extends AST_Node_Props {
  expression?: any | undefined
  property?: any | undefined
}
