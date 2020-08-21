import AST_Statement from './statement'
import { to_moz, mkshallow, do_list, list_overhead, is_ast_definitions, is_ast_defun, is_ast_function, is_ast_class } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Export extends AST_Statement {
  is_default: any
  module_name: any
  exported_value: any
  exported_definition: any
  exported_names: any

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this: any) {
      if (this.exported_definition) {
        this.exported_definition._walk(visitor)
      }
      if (this.exported_value) {
        this.exported_value._walk(visitor)
      }
      if (this.exported_names) {
        this.exported_names.forEach(function (name_export) {
          name_export._walk(visitor)
        })
      }
      if (this.module_name) {
        this.module_name._walk(visitor)
      }
    })
  }

  _children_backwards (push: Function) {
    if (this.module_name) push(this.module_name)
    if (this.exported_names) {
      let i = this.exported_names.length
      while (i--) push(this.exported_names[i])
    }
    if (this.exported_value) push(this.exported_value)
    if (this.exported_definition) push(this.exported_definition)
  }

  _size (): number {
    let size = 7 + (this.is_default ? 8 : 0)

    if (this.exported_value) {
      size += this.exported_value._size()
    }

    if (this.exported_names) {
      // Braces and commas
      size += 2 + list_overhead(this.exported_names)
    }

    if (this.module_name) {
      // "from "
      size += 5
    }

    return size
  }

  shallow_cmp = mkshallow({
    exported_definition: 'exist',
    exported_value: 'exist',
    exported_names: 'exist',
    module_name: 'eq',
    is_default: 'eq'
  })

  _transform (self, tw: TreeWalker) {
    if (self.exported_definition) self.exported_definition = self.exported_definition.transform(tw)
    if (self.exported_value) self.exported_value = self.exported_value.transform(tw)
    if (self.exported_names) do_list(self.exported_names, tw)
    if (self.module_name) self.module_name = self.module_name.transform(tw)
  }

  _to_mozilla_ast (parent) {
    if (this.exported_names) {
      if (this.exported_names[0].name.name === '*') {
        return {
          type: 'ExportAllDeclaration',
          source: to_moz(this.module_name)
        }
      }
      return {
        type: 'ExportNamedDeclaration',
        specifiers: this.exported_names.map(function (name_mapping) {
          return {
            type: 'ExportSpecifier',
            exported: to_moz(name_mapping.foreign_name),
            local: to_moz(name_mapping.name)
          }
        }),
        declaration: to_moz(this.exported_definition),
        source: to_moz(this.module_name)
      }
    }
    return {
      type: this.is_default ? 'ExportDefaultDeclaration' : 'ExportNamedDeclaration',
      declaration: to_moz(this.exported_value || this.exported_definition)
    }
  }

  _codegen (self, output) {
    output.print('export')
    output.space()
    if (self.is_default) {
      output.print('default')
      output.space()
    }
    if (self.exported_names) {
      if (self.exported_names.length === 1 && self.exported_names[0].name.name === '*') {
        self.exported_names[0].print(output)
      } else {
        output.print('{')
        self.exported_names.forEach(function (name_export, i) {
          output.space()
          name_export.print(output)
          if (i < self.exported_names.length - 1) {
            output.print(',')
          }
        })
        output.space()
        output.print('}')
      }
    } else if (self.exported_value) {
      self.exported_value.print(output)
    } else if (self.exported_definition) {
      self.exported_definition.print(output)
      if (is_ast_definitions(self.exported_definition)) return
    }
    if (self.module_name) {
      output.space()
      output.print('from')
      output.space()
      self.module_name.print(output)
    }
    if (self.exported_value &&
                !(is_ast_defun(self.exported_value) ||
                    is_ast_function(self.exported_value) ||
                    is_ast_class(self.exported_value)) ||
            self.module_name ||
            self.exported_names
    ) {
      output.semicolon()
    }
  }

  static documentation = 'An `export` statement'
  static propdoc = {
    exported_definition: '[AST_Defun|AST_Definitions|AST_DefClass?] An exported definition',
    exported_value: '[AST_Node?] An exported value',
    exported_names: '[AST_NameMapping*?] List of exported names',
    module_name: '[AST_String?] Name of the file to load exports from',
    is_default: '[Boolean] Whether this is the default exported value of this module'
  }

  static PROPS = AST_Statement.PROPS.concat(['exported_definition', 'exported_value', 'is_default', 'exported_names', 'module_name'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.exported_definition = args.exported_definition
    this.exported_value = args.exported_value
    this.is_default = args.is_default
    this.exported_names = args.exported_names
    this.module_name = args.module_name
  }
}
