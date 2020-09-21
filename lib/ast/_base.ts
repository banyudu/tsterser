export default class AST {
  public isAst (_type: string) {
    return false
  }

  public get TYPE () {
    return this.constructor.name.substr(4)
  }

  public static get TYPE () {
    return this.constructor.name.substr(4)
  }
}
