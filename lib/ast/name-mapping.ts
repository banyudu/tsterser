import AST_SymbolImport from './symbol-import'
import AST_SymbolExport from './symbol-export'
import AST_SymbolImportForeign from './symbol-import-foreign'
import AST_SymbolExportForeign from './symbol-export-foreign'
import { OutputStream } from '../output'
import AST_Node from './node'
import { is_ast_import } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_NameMapping extends AST_Node {
  name: AST_SymbolExport|AST_SymbolImport
  foreign_name: AST_SymbolExportForeign|AST_SymbolImportForeign

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      this.foreign_name._walk(visitor)
      this.name._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.name)
    push(this.foreign_name)
  }

  _size (): number {
    // foreign name isn't mangled
    return this.name ? 4 : 0
  }

  shallow_cmp_props: any = {}
  _transform (self: AST_NameMapping, tw: TreeWalker) {
    self.foreign_name = self.foreign_name.transform(tw)
    self.name = self.name.transform(tw)
  }

  _codegen (self: AST_NameMapping, output: OutputStream) {
    const is_import = is_ast_import(output.parent())
    const definition = self.name.definition()
    const names_are_different =
            (definition?.mangled_name || self.name.name) !==
            self.foreign_name.name
    if (names_are_different) {
      if (is_import) {
        output.print(self.foreign_name.name)
      } else {
        self.name.print(output)
      }
      output.space()
      output.print('as')
      output.space()
      if (is_import) {
        self.name.print(output)
      } else {
        output.print(self.foreign_name.name)
      }
    } else {
      self.name.print(output)
    }
  }

  static documentation = 'The part of the export/import statement that declare names from a module.'
  static propdoc = {
    foreign_name: '[AST_SymbolExportForeign|AST_SymbolImportForeign] The name being exported/imported (as specified in the module)',
    name: '[AST_SymbolExport|AST_SymbolImport] The name as it is visible to this module.'
  }

  static PROPS = AST_Node.PROPS.concat(['foreign_name', 'name'])
  constructor (args?) {
    super(args)
    this.foreign_name = args.foreign_name
    this.name = args.name
  }
}
