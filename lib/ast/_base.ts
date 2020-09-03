export default class AST {
  isAst (type: string) {
    return false
  }

  get TYPE () {
    return this.constructor.name.substr(4)
  }

  static get TYPE () {
    return this.constructor.name.substr(4)
  }
}
