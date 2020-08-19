import AST_Node from './node'
import Compressor from '../compressor'
import { is_undeclared_ref, HOP, make_node, make_sequence, pass_through, to_moz, walk, safe_to_flatten } from '../utils'
import { static_values, global_objs, walk_abort } from '../constants'

export default class AST_PropAccess extends AST_Node {
  expression: any
  property: any

  _needs_parens (child: AST_Node) {
    return this.expression === child
  }

  _eval (compressor: Compressor, depth) {
    if (compressor.option('unsafe')) {
      var key = this.property
      if (key?.isAst?.('AST_Node')) {
        key = key._eval?.(compressor, depth)
        if (key === this.property) return this
      }
      var exp = this.expression
      var val
      if (is_undeclared_ref(exp)) {
        var aa
        var first_arg = exp.name === 'hasOwnProperty' &&
                  key === 'call' &&
                  (aa = compressor.parent() && compressor.parent().args) &&
                  (aa && aa[0] &&
                  aa[0].evaluate(compressor))

        first_arg = first_arg?.isAst?.('AST_Dot') ? first_arg.expression : first_arg

        if (first_arg == null || first_arg.thedef && first_arg.thedef.undeclared) {
          return this.clone()
        }
        var static_value = static_values.get(exp.name)
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

  flatten_object (key, compressor) {
    if (!compressor.option('properties')) return
    var arrows = compressor.option('unsafe_arrows') && compressor.option('ecma') >= 2015
    var expr = this.expression
    if (expr?.isAst?.('AST_Object')) {
      var props = expr.properties
      for (var i = props.length; --i >= 0;) {
        var prop = props[i]
        if ('' + (prop?.isAst?.('AST_ConciseMethod') ? prop.key.name : prop.key) == key) {
          if (!props.every((prop) => {
            return prop?.isAst?.('AST_ObjectKeyVal') ||
                          arrows && prop?.isAst?.('AST_ConciseMethod') && !prop.is_generator
          })) break
          if (!safe_to_flatten(prop.value, compressor)) break
          return make_node('AST_Sub', this, {
            expression: make_node('AST_Array', expr, {
              elements: props.map(function (prop) {
                var v = prop.value
                if (v?.isAst?.('AST_Accessor')) v = make_node('AST_Function', v, v)
                var k = prop.key
                if (k?.isAst?.('AST_Node') && !(k?.isAst?.('AST_SymbolMethod'))) {
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

  shallow_cmp = pass_through as any
  _to_mozilla_ast (parent) {
    return {
      type: 'MemberExpression',
      object: to_moz(this.expression),
      computed: false,
      property: { type: 'Identifier', name: this.property }
    }
  }

  needs_parens (output: any) {
    var p = output.parent()
    if (p?.isAst?.('AST_New') && p.expression === this) {
      // i.e. new (foo.bar().baz)
      //
      // if there's one call into this subtree, then we need
      // parens around it too, otherwise the call will be
      // interpreted as passing the arguments to the upper New
      // expression.
      return walk(this, (node: any) => {
        if (node?.isAst?.('AST_Scope')) return true
        if (node?.isAst?.('AST_Call')) {
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
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
    this.property = args.property
  }
}
