import AST_Symbol, { AST_Symbol_Props } from './symbol'

export default class AST_SymbolMethod extends AST_Symbol {
  static documentation = 'Symbol in an object defining a method'

  public _to_mozilla_ast (parent: any): any {
    if (parent.quote) {
      return {
        type: 'Literal',
        value: this.name
      }
    }
    const def = this.definition()
    return {
      type: 'Identifier',
      name: def ? def.mangled_name || def.name : this.name
    }
  }

  static PROPS = AST_Symbol.PROPS
}

export interface AST_SymbolMethod_Props extends AST_Symbol_Props {
}
