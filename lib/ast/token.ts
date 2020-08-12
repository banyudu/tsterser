import AST from './_base'
export default class AST_Token extends AST {
  static PROPS = ['type', 'value', 'line', 'col', 'pos', 'endline', 'endcol', 'endpos', 'nlb', 'comments_before', 'comments_after', 'file', 'raw', 'quote', 'end']
  TYPE = 'Token'

  isAst (type: string) {
    return type === 'AST_Token'
  }

  constructor (args: any = {}) {
    super()

    if (args) {
      AST_Token.PROPS.map((item) => (this[item] = args[item]))
    }
  }
}
