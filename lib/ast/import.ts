import AST_String from './string'
import AST_SymbolImport from './symbol-import'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { list_overhead, do_list, to_moz } from '../utils'
import AST_NameMapping from './name-mapping'
import TreeTransformer from '../tree-transformer'

export default class AST_Import extends AST_Node {
  imported_name: AST_SymbolImport
  module_name: AST_String
  imported_names: AST_NameMapping[]

  _optimize (compressor: Compressor) {
    return this
  }

  aborts () { return null }
  walkInner () {
    const result = []
    if (this.imported_name) {
      result.push(this.imported_name)
    }
    if (this.imported_names) {
      this.imported_names.forEach(function (name_import) {
        result.push(name_import)
      })
    }
    result.push(this.module_name)
    return result
  }

  _children_backwards (push: Function) {
    push(this.module_name)
    if (this.imported_names) {
      let i = this.imported_names.length
      while (i--) push(this.imported_names[i])
    }
    if (this.imported_name) push(this.imported_name)
  }

  _size (): number {
    // import
    let size = 6

    if (this.imported_name) size += 1

    // from
    if (this.imported_name || this.imported_names) size += 5

    // braces, and the commas
    if (this.imported_names) {
      size += 2 + list_overhead(this.imported_names)
    }

    return size
  }

  shallow_cmp_props: any = {
    imported_name: 'exist',
    imported_names: 'exist'
  }

  _transform (tw: TreeTransformer) {
    if (this.imported_name) this.imported_name = this.imported_name.transform(tw)
    if (this.imported_names) do_list(this.imported_names, tw)
    this.module_name = this.module_name.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    const specifiers: any[] = []
    if (this.imported_name) {
      specifiers.push({
        type: 'ImportDefaultSpecifier',
        local: to_moz(this.imported_name)
      })
    }
    if (this.imported_names && this.imported_names[0].foreign_name.name === '*') {
      specifiers.push({
        type: 'ImportNamespaceSpecifier',
        local: to_moz(this.imported_names[0].name)
      })
    } else if (this.imported_names) {
      this.imported_names.forEach(function (name_mapping) {
        specifiers.push({
          type: 'ImportSpecifier',
          local: to_moz(name_mapping.name),
          imported: to_moz(name_mapping.foreign_name)
        })
      })
    }
    return {
      type: 'ImportDeclaration',
      specifiers: specifiers,
      source: to_moz(this.module_name)
    }
  }

  _codegen (output: OutputStream) {
    output.print('import')
    output.space()
    if (this.imported_name) {
      this.imported_name.print(output)
    }
    if (this.imported_name && this.imported_names) {
      output.print(',')
      output.space()
    }
    if (this.imported_names) {
      if (this.imported_names.length === 1 && this.imported_names[0].foreign_name.name === '*') {
        this.imported_names[0].print(output)
      } else {
        output.print('{')
        this.imported_names.forEach((name_import, i) => {
          output.space()
          name_import.print(output)
          if (i < this.imported_names.length - 1) {
            output.print(',')
          }
        })
        output.space()
        output.print('}')
      }
    }
    if (this.imported_name || this.imported_names) {
      output.space()
      output.print('from')
      output.space()
    }
    this.module_name.print(output)
    output.semicolon()
  }

  static documentation = 'An `import` statement'
  static propdoc = {
    imported_name: "[AST_SymbolImport] The name of the variable holding the module's default export.",
    imported_names: '[AST_NameMapping*] The names of non-default imported variables',
    module_name: '[AST_String] String literal describing where this module came from'
  }

  static PROPS = AST_Node.PROPS.concat(['imported_name', 'imported_names', 'module_name'])
  constructor (args?: AST_Import_Props) {
    super(args)
    this.imported_name = args.imported_name
    this.imported_names = args.imported_names
    this.module_name = args.module_name
  }
}

export interface AST_Import_Props extends AST_Node_Props {
  imported_name?: AST_SymbolImport | undefined
  imported_names?: AST_NameMapping[] | undefined
  module_name?: AST_String | undefined
}
