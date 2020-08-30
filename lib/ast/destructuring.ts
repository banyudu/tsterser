import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Node from './node'
import TreeWalker from '../tree-walker'
import { do_list, to_moz, is_ast_object_key_val, is_ast_symbol, is_ast_hole, is_ast_symbol_declaration } from '../utils'
import SymbolDef from '../symbol-def'

/* -----[ DESTRUCTURING ]----- */
export default class AST_Destructuring extends AST_Node {
  is_array: boolean
  names: AST_Node[]

  to_fun_args (croak: Function): any {
    this.names = this.names.map(item => item.to_fun_args(croak))
    return this
  }

  _optimize (compressor: Compressor) {
    if (compressor.option('pure_getters') == true &&
          compressor.option('unused') &&
          !this.is_array &&
          Array.isArray(this.names) &&
          !is_destructuring_export_decl(compressor)) {
      const keep: any[] = []
      for (let i = 0; i < this.names.length; i++) {
        const elem = this.names[i]
        if (!(is_ast_object_key_val(elem) &&
                  typeof elem.key === 'string' &&
                  is_ast_symbol_declaration(elem.value) &&
                  !should_retain(compressor, elem.value.definition?.()))) {
          keep.push(elem)
        }
      }
      if (keep.length != this.names.length) {
        this.names = keep
      }
    }
    return this

    function is_destructuring_export_decl (compressor: Compressor) {
      const ancestors = [/^VarDef$/, /^(Const|Let|Var)$/, /^Export$/]
      for (let a = 0, p = 0, len = ancestors.length; a < len; p++) {
        const parent = compressor.parent(p)
        if (!parent) return false
        if (a === 0 && parent.TYPE == 'Destructuring') continue
        if (!ancestors[a].test(parent.TYPE)) {
          return false
        }
        a++
      }
      return true
    }

    function should_retain (compressor: Compressor, def: SymbolDef) {
      if (def.references.length) return true
      if (!def.global) return false
      if (compressor.toplevel.vars) {
        if (compressor.top_retain) {
          return compressor.top_retain(def)
        }
        return false
      }
      return true
    }
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.names.forEach(function (name: any) {
        name._walk(visitor)
      })
    })
  }

  _children_backwards (push: Function) {
    let i = this.names.length
    while (i--) push(this.names[i])
  }

  all_symbols () {
    const out: any[] = []
    this.walk(new TreeWalker(function (node: AST_Node) {
      if (is_ast_symbol(node)) {
        out.push(node)
      }
    }))
    return out
  }

  _size = () => 2
  shallow_cmp_props: any = { is_array: 'eq' }
  _transform (self: AST_Destructuring, tw: TreeWalker) {
    self.names = do_list(self.names, tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    if (this.is_array) {
      return {
        type: 'ArrayPattern',
        elements: this.names.map(to_moz)
      }
    }
    return {
      type: 'ObjectPattern',
      properties: this.names.map(to_moz)
    }
  }

  _codegen (self: AST_Destructuring, output: OutputStream) {
    output.print(self.is_array ? '[' : '{')
    const len = self.names.length
    self.names.forEach(function (name, i) {
      if (i > 0) output.comma()
      name.print(output)
      // If the final element is a hole, we need to make sure it
      // doesn't look like a trailing comma, by inserting an actual
      // trailing comma.
      if (i == len - 1 && is_ast_hole(name)) output.comma()
    })
    output.print(self.is_array ? ']' : '}')
  }

  static documentation = 'A destructuring of several names. Used in destructuring assignment and with destructuring function argument names'
  static propdoc = {
    names: '[AST_Node*] Array of properties or elements',
    is_array: '[boolean] Whether the destructuring represents an object or array'
  }

  static PROPS = AST_Node.PROPS.concat(['names', 'is_array'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.names = args.names
    this.is_array = args.is_array
  }
}
