export default class AST {
  public isAst (_type: string) {
    return false
  }

  get TYPE () {
    return this.constructor.name.substr(4)
  }

  static get TYPE () {
    return this.constructor.name.substr(4)
  }
}
