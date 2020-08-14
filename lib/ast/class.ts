import AST_Scope from './scope'
import {
  make_sequence,
  anyMayThrow,
  anySideEffect,
  return_this,
  all_refs_local,
  push,
  pop,
  return_false,
  do_list,
  mkshallow,
  to_moz
} from '../utils'
import { clear_flag, INLINED } from '../constants'

export default class AST_Class extends AST_Scope {
  extends: any
  properties: any
  name: any

  _optimize = function (self) {
    // HACK to avoid compress failure.
    // AST_Class is not really an AST_Scope/AST_Block as it lacks a body.
    return self
  }

  drop_side_effect_free = function (compressor: any) {
    const with_effects: any[] = []
    const trimmed_extends = this.extends && this.extends.drop_side_effect_free(compressor)
    if (trimmed_extends) with_effects.push(trimmed_extends)
    for (const prop of this.properties) {
      const trimmed_prop = prop.drop_side_effect_free(compressor)
      if (trimmed_prop) with_effects.push(trimmed_prop)
    }
    if (!with_effects.length) return null
    return make_sequence(this, with_effects)
  }

  may_throw = function (compressor: any) {
    if (this.extends && this.extends.may_throw(compressor)) return true
    return anyMayThrow(this.properties, compressor)
  }

  has_side_effects = function (compressor) {
    if (this.extends && this.extends.has_side_effects(compressor)) {
      return true
    }
    return anySideEffect(this.properties, compressor)
  }

  _eval = return_this
  is_constant_expression = function (scope) {
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

  reduce_vars = function (tw, descend) {
    clear_flag(this, INLINED)
    push(tw)
    descend()
    pop(tw)
    return true
  }

  is_block_scope = return_false
  _walk = function (visitor: any) {
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

  _size = function (): number {
    return (
      (this.name ? 8 : 7) +
            (this.extends ? 8 : 0)
    )
  }

  _transform (self, tw: any) {
    if (self.name) self.name = self.name.transform(tw)
    if (self.extends) self.extends = self.extends.transform(tw)
    self.properties = do_list(self.properties, tw)
  }

  shallow_cmp = mkshallow({
    name: 'exist',
    extends: 'exist'
  })

  _to_mozilla_ast (parent) {
    var type = this?.isAst?.('AST_ClassExpression') ? 'ClassExpression' : 'ClassDeclaration'
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

  _codegen = function (self, output) {
    output.print('class')
    output.space()
    if (self.name) {
      self.name.print(output)
      output.space()
    }
    if (self.extends) {
      var parens = (
        !(self.extends?.isAst?.('AST_SymbolRef')) &&
                !(self.extends?.isAst?.('AST_PropAccess')) &&
                !(self.extends?.isAst?.('AST_ClassExpression')) &&
                !(self.extends?.isAst?.('AST_Function'))
      )
      output.print('extends')
      if (parens) {
        output.print('(')
      } else {
        output.space()
      }
      self.extends.print(output)
      if (parens) {
        output.print(')')
      } else {
        output.space()
      }
    }
    if (self.properties.length > 0) {
      output.with_block(function () {
        self.properties.forEach(function (prop, i) {
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

  add_source_map = function (output) { output.add_mapping(this.start) }
  static propdoc = {
    name: '[AST_SymbolClass|AST_SymbolDefClass?] optional class name.',
    extends: '[AST_Node]? optional parent class',
    properties: '[AST_ObjectProperty*] array of properties'
  }

  static documentation = 'An ES6 class'

  static PROPS = AST_Scope.PROPS.concat(['name', 'extends', 'properties'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.name = args.name
    this.extends = args.extends
    this.properties = args.properties
  }
}
