import AST_VarDef from './var-def'
import AST_Node from './node'
import AST_SymbolRef from './symbol-ref'
import { OutputStream } from '../output'
import AST_Statement, { AST_Statement_Props } from './statement'
import Compressor from '../compressor'
import { make_node, anyMayThrow, anySideEffect, make_sequence, walk, do_list, to_moz, is_ast_destructuring, is_ast_symbol_declaration, is_ast_for, is_ast_for_in } from '../utils'
import TreeTransformer from '../tree-transformer'
import { MozillaAst } from '../types'

export default class AST_Definitions extends AST_Statement {
  public definitions: AST_VarDef[]

  protected _optimize (_compressor: Compressor): any {
    if (this.definitions.length == 0) { return make_node('AST_EmptyStatement', this) }
    return this
  }

  public may_throw (compressor: Compressor) {
    return anyMayThrow(this.definitions, compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return anySideEffect(this.definitions, compressor)
  }

  public to_assignments (compressor: Compressor) {
    const reduce_vars = compressor.option('reduce_vars')
    const assignments = this.definitions.reduce(function (a: any[], def) {
      if (def.value && !(is_ast_destructuring(def.name))) {
        const name = make_node('AST_SymbolRef', def.name, def.name) as AST_SymbolRef
        a.push(make_node('AST_Assign', def, {
          operator: '=',
          left: name,
          right: def.value
        }))
        if (reduce_vars) name.definition().fixed = false
      } else if (def.value) {
        // Because it's a destructuring, do not turn into an assignment.
        const varDef = make_node('AST_VarDef', def, {
          name: def.name,
          value: def.value
        })
        const var_ = make_node('AST_Var', def, {
          definitions: [varDef]
        })
        a.push(var_)
      }
      def = (def.name as any).definition?.()
      def.eliminated++
      def.replaced--
      return a
    }, [])
    if (assignments.length == 0) return null
    return make_sequence(this, assignments)
  }

  public remove_initializers () {
    const decls: any[] = []
    this.definitions.forEach(function (def: AST_VarDef) {
      if (is_ast_symbol_declaration(def.name)) {
        def.value = null
        decls.push(def)
      } else {
        walk(def.name, (node: AST_Node) => {
          if (is_ast_symbol_declaration(node)) {
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

  protected walkInner () {
    const result: AST_Node[] = []
    const definitions = this.definitions
    for (let i = 0, len = definitions.length; i < len; i++) {
      result.push(definitions[i])
    }
    return result
  }

  public _children_backwards (push: Function) {
    let i = this.definitions.length
    while (i--) push(this.definitions[i])
  }

  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.definitions = do_list(this.definitions, tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'VariableDeclaration',
      kind: 'var',
      declarations: this.definitions.map(to_moz)
    }
  }

  public _do_print (output: OutputStream, kind: string) {
    output.print(kind)
    output.space()
    this.definitions.forEach(function (def: AST_VarDef, i) {
      if (i) output.comma()
      def.print(output)
    })
    const p = output.parent()
    const in_for = is_ast_for(p) || is_ast_for_in(p)
    const output_semicolon = !in_for || (p && p.init !== this)
    if (output_semicolon) { output.semicolon() }
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'Base class for `var` or `const` nodes (variable declarations/initializations)'
  public static propdoc ={
    definitions: '[AST_VarDef*] array of variable definitions'
  }

  public static PROPS =AST_Statement.PROPS.concat(['definitions'])
  public constructor (args: AST_Definitions_Props) {
    super(args)
    this.definitions = args.definitions
  }
}

export interface AST_Definitions_Props extends AST_Statement_Props {
  definitions: AST_VarDef[]
}
