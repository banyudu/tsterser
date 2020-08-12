import AST_Symbol from './symbol'

export default class AST_SymbolMethod extends AST_Symbol {
  static documentation = 'Symbol in an object defining a method'

  _to_mozilla_ast (parent): any {
    if (parent.quote) {
      return {
        type: 'Literal',
        value: this.name
      }
    }
    var def = this.definition()
    return {
      type: 'Identifier',
      name: def ? def.mangled_name || def.name : this.name
    }
  }

  static PROPS = AST_Symbol.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
