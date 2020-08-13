import AST_Node from './node'
import TreeWalker from '../tree-walker'
import { mkshallow, do_list, to_moz } from '../utils'

/* -----[ DESTRUCTURING ]----- */
export default class AST_Destructuring extends AST_Node {
  is_array: any
  names: any[]

  _optimize (self, compressor) {
    if (compressor.option('pure_getters') == true &&
          compressor.option('unused') &&
          !self.is_array &&
          Array.isArray(self.names) &&
          !is_destructuring_export_decl(compressor)) {
      var keep: any[] = []
      for (var i = 0; i < self.names.length; i++) {
        var elem = self.names[i]
        if (!(elem?.isAst?.('AST_ObjectKeyVal') &&
                  typeof elem.key === 'string' &&
                  elem.value?.isAst?.('AST_SymbolDeclaration') &&
                  !should_retain(compressor, elem.value.definition?.()))) {
          keep.push(elem)
        }
      }
      if (keep.length != self.names.length) {
        self.names = keep
      }
    }
    return self

    function is_destructuring_export_decl (compressor) {
      var ancestors = [/^VarDef$/, /^(Const|Let|Var)$/, /^Export$/]
      for (var a = 0, p = 0, len = ancestors.length; a < len; p++) {
        var parent = compressor.parent(p)
        if (!parent) return false
        if (a === 0 && parent.TYPE == 'Destructuring') continue
        if (!ancestors[a].test(parent.TYPE)) {
          return false
        }
        a++
      }
      return true
    }

    function should_retain (compressor, def) {
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

  _walk (visitor: any) {
    return visitor._visit(this, function () {
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
    var out: any[] = []
    this.walk(new TreeWalker(function (node: any) {
      if (node?.isAst?.('AST_Symbol')) {
        out.push(node)
      }
    }))
    return out
  }

  _size = () => 2
  shallow_cmp = mkshallow({ is_array: 'eq' })
  _transform (self, tw: any) {
    self.names = do_list(self.names, tw)
  }

  _to_mozilla_ast (parent) {
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

  _codegen (self, output) {
    output.print(self.is_array ? '[' : '{')
    var len = self.names.length
    self.names.forEach(function (name, i) {
      if (i > 0) output.comma()
      name.print(output)
      // If the final element is a hole, we need to make sure it
      // doesn't look like a trailing comma, by inserting an actual
      // trailing comma.
      if (i == len - 1 && name?.isAst?.('AST_Hole')) output.comma()
    })
    output.print(self.is_array ? ']' : '}')
  }

  static documentation = 'A destructuring of several names. Used in destructuring assignment and with destructuring function argument names'
  static propdoc = {
    names: '[AST_Node*] Array of properties or elements',
    is_array: '[Boolean] Whether the destructuring represents an object or array'
  }

  static PROPS = AST_Node.PROPS.concat(['names', 'is_array'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.names = args.names
    this.is_array = args.is_array
  }
}
