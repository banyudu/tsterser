import AST_SymbolImport from './symbol-import'
import AST_SymbolExport from './symbol-export'
import AST_SymbolImportForeign from './symbol-import-foreign'
import AST_SymbolExportForeign from './symbol-export-foreign'
import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { is_ast_import } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_NameMapping extends AST_Node {
  public name: AST_SymbolExport | AST_SymbolImport
  public foreign_name: AST_SymbolExportForeign | AST_SymbolImportForeign

  protected walkInner () {
    const result: AST_Node[] = []
    result.push(this.foreign_name)
    result.push(this.name)
    return result
  }

  public _children_backwards (push: Function) {
    push(this.name)
    push(this.foreign_name)
  }

  public _size (): number {
    // foreign name isn't mangled
    return this.name ? 4 : 0
  }

  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.foreign_name = this.foreign_name.transform(tw)
    this.name = this.name.transform(tw)
  }

  protected _codegen (output: OutputStream) {
    const is_import = is_ast_import(output.parent())
    const definition = this.name.definition()
    const names_are_different =
            (definition?.mangled_name || this.name.name) !==
            this.foreign_name.name
    if (names_are_different) {
      if (is_import) {
        output.print(this.foreign_name.name)
      } else {
        this.name.print(output)
      }
      output.space()
      output.print('as')
      output.space()
      if (is_import) {
        this.name.print(output)
      } else {
        output.print(this.foreign_name.name)
      }
    } else {
      this.name.print(output)
    }
  }

  public static documentation = 'The part of the export/import statement that declare names from a module.'
  public static propdoc ={
    foreign_name: '[AST_SymbolExportForeign|AST_SymbolImportForeign] The name being exported/imported (as specified in the module)',
    name: '[AST_SymbolExport|AST_SymbolImport] The name as it is visible to this module.'
  }

  public static PROPS =AST_Node.PROPS.concat(['foreign_name', 'name'])
  public constructor (args: AST_NameMapping_Props) {
    super(args)
    this.foreign_name = args.foreign_name
    this.name = args.name
  }
}

export interface AST_NameMapping_Props extends AST_Node_Props {
  foreign_name: AST_SymbolExportForeign | AST_SymbolImportForeign
  name: AST_SymbolExport | AST_SymbolImport
}
