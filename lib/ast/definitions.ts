import AST_Statement from './statement'
import Compressor from '../compressor'
import { make_node, anyMayThrow, anySideEffect, make_sequence, walk, do_list, to_moz, pass_through } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Definitions extends AST_Statement {
  definitions: any[]

  _optimize (compressor) {
    if (this.definitions.length == 0) { return make_node('AST_EmptyStatement', this) }
    return this
  }

  may_throw (compressor: Compressor) {
    return anyMayThrow(this.definitions, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.definitions, compressor)
  }

  to_assignments (compressor: Compressor) {
    var reduce_vars = compressor.option('reduce_vars')
    var assignments = this.definitions.reduce(function (a, def) {
      if (def.value && !(def.name?.isAst?.('AST_Destructuring'))) {
        var name = make_node('AST_SymbolRef', def.name, def.name)
        a.push(make_node('AST_Assign', def, {
          operator: '=',
          left: name,
          right: def.value
        }))
        if (reduce_vars) name.definition().fixed = false
      } else if (def.value) {
        // Because it's a destructuring, do not turn into an assignment.
        var varDef = make_node('AST_VarDef', def, {
          name: def.name,
          value: def.value
        })
        var var_ = make_node('AST_Var', def, {
          definitions: [varDef]
        })
        a.push(var_)
      }
      def = def.name.definition?.()
      def.eliminated++
      def.replaced--
      return a
    }, [])
    if (assignments.length == 0) return null
    return make_sequence(this, assignments)
  }

  remove_initializers () {
    var decls: any[] = []
    this.definitions.forEach(function (def) {
      if (def.name?.isAst?.('AST_SymbolDeclaration')) {
        def.value = null
        decls.push(def)
      } else {
        walk(def.name, (node: any) => {
          if (node?.isAst?.('AST_SymbolDeclaration')) {
            decls.push(make_node('AST_VarDef', def, {
              name: node,
              value: null
            }))
          }
        })
      }
    })
    this.definitions = decls
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function () {
      var definitions = this.definitions
      for (var i = 0, len = definitions.length; i < len; i++) {
        definitions[i]._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    let i = this.definitions.length
    while (i--) push(this.definitions[i])
  }

  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    self.definitions = do_list(self.definitions, tw)
  }

  _to_mozilla_ast (parent) {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: this.definitions.map(to_moz)
    }
  }

  _do_print (this: any, output: any, kind: string) {
    output.print(kind)
    output.space()
    this.definitions.forEach(function (def, i) {
      if (i) output.comma()
      def.print(output)
    })
    var p = output.parent()
    var in_for = p?.isAst?.('AST_For') || p?.isAst?.('AST_ForIn')
    var output_semicolon = !in_for || p && p.init !== this
    if (output_semicolon) { output.semicolon() }
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'Base class for `var` or `const` nodes (variable declarations/initializations)'
  static propdoc = {
    definitions: '[AST_VarDef*] array of variable definitions'
  }

  static PROPS = AST_Statement.PROPS.concat(['definitions'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.definitions = args.definitions
  }
}
