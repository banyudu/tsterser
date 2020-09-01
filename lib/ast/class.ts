import AST_SymbolClass from './symbol-class'
import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Scope, { AST_Scope_Props } from './scope'
import Compressor from '../compressor'
import { make_sequence, anyMayThrow, anySideEffect, all_refs_local, push, pop, do_list, to_moz, is_ast_class_expression, is_ast_symbol_ref, is_ast_prop_access, is_ast_function } from '../utils'
import { clear_flag, INLINED } from '../constants'
import TreeWalker from '../tree-walker'
import { AST_ObjectProperty, AST_SymbolDefClass } from '.'
import { TreeTransformer } from '../../main'

export default class AST_Class extends AST_Scope {
  extends: AST_Node
  properties: AST_ObjectProperty[]
  name: AST_SymbolClass|AST_SymbolDefClass | undefined

  _optimize (compressor: Compressor) {
    // HACK to avoid compress failure.
    // AST_Class is not really an AST_Scope/AST_Block as it lacks a body.
    return this
  }

  drop_side_effect_free (compressor: Compressor) {
    const with_effects: any[] = []
    const trimmed_extends = this.extends?.drop_side_effect_free(compressor)
    if (trimmed_extends) with_effects.push(trimmed_extends)
    for (const prop of this.properties) {
      const trimmed_prop = prop.drop_side_effect_free(compressor)
      if (trimmed_prop) with_effects.push(trimmed_prop)
    }
    if (!with_effects.length) return null
    return make_sequence(this, with_effects)
  }

  may_throw (compressor: Compressor) {
    if (this.extends?.may_throw(compressor)) return true
    return anyMayThrow(this.properties, compressor)
  }

  has_side_effects (compressor: Compressor) {
    if (this.extends?.has_side_effects(compressor)) {
      return true
    }
    return anySideEffect(this.properties, compressor)
  }

  _eval () { return this }
  is_constant_expression (scope: AST_Scope) {
    if (this.extends && !this.extends.is_constant_expression(scope)) {
      return false
    }

    for (const prop of this.properties) {
      if (prop.computed_key() && !prop.key.is_constant_expression(scope)) {
        return false
      }
      if (prop.static && prop.value && !prop.value.is_constant_expression(scope)) {
        return false
      }
    }

    return all_refs_local.call(this, scope)
  }

  reduce_vars (tw: TreeWalker, descend: Function) {
    clear_flag(this, INLINED)
    push(tw)
    descend()
    pop(tw)
    return true
  }

  is_block_scope () { return false }
  _walk (visitor: any) {
    return visitor._visit(this, function (this: any) {
      if (this.name) {
        this.name._walk(visitor)
      }
      if (this.extends) {
        this.extends._walk(visitor)
      }
      this.properties.forEach((prop) => prop._walk(visitor))
    })
  }

  _children_backwards (push: Function) {
    let i = this.properties.length
    while (i--) push(this.properties[i])
    if (this.extends) push(this.extends)
    if (this.name) push(this.name)
  }

  _size (): number {
    return (
      (this.name ? 8 : 7) +
                (this.extends ? 8 : 0)
    )
  }

  _transform (tw: TreeTransformer) {
    if (this.name) this.name = this.name.transform(tw)
    if (this.extends) this.extends = this.extends.transform(tw)
    this.properties = do_list(this.properties, tw)
  }

  shallow_cmp_props: any = {
    name: 'exist',
    extends: 'exist'
  }

  _to_mozilla_ast (parent: AST_Node) {
    const type = is_ast_class_expression(this) ? 'ClassExpression' : 'ClassDeclaration'
    return {
      type: type,
      superClass: to_moz(this.extends),
      id: this.name ? to_moz(this.name) : null,
      body: {
        type: 'ClassBody',
        body: this.properties.map(to_moz)
      }
    }
  }

  _codegen (output: OutputStream) {
    output.print('class')
    output.space()
    if (this.name) {
      this.name.print(output)
      output.space()
    }
    if (this.extends) {
      const parens = (
        !(is_ast_symbol_ref(this.extends)) &&
                    !(is_ast_prop_access(this.extends)) &&
                    !(is_ast_class_expression(this.extends)) &&
                    !(is_ast_function(this.extends))
      )
      output.print('extends')
      if (parens) {
        output.print('(')
      } else {
        output.space()
      }
      this.extends.print(output)
      if (parens) {
        output.print(')')
      } else {
        output.space()
      }
    }
    if (this.properties.length > 0) {
      output.with_block(() => {
        this.properties.forEach(function (prop, i) {
          if (i) {
            output.newline()
          }
          output.indent()
          prop.print(output)
        })
        output.newline()
      })
    } else output.print('{}')
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static propdoc = {
    name: '[AST_SymbolClass|AST_SymbolDefClass?] optional class name.',
    extends: '[AST_Node]? optional parent class',
    properties: '[AST_ObjectProperty*] array of properties'
  }

  static documentation = 'An ES6 class'

  static PROPS = AST_Scope.PROPS.concat(['name', 'extends', 'properties'])
  constructor (args?: AST_Class_Props) {
    super(args)
    this.name = args.name
    this.extends = args.extends
    this.properties = args.properties
  }
}

export interface AST_Class_Props extends AST_Scope_Props {
  name?: AST_SymbolClass|AST_SymbolDefClass | undefined | undefined
  extends?: AST_Node | undefined
  properties?: AST_ObjectProperty[] | undefined
}
