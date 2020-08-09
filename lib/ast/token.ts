export default class AST_Token {
  static PROPS = ['type', 'value', 'line', 'col', 'pos', 'endline', 'endcol', 'endpos', 'nlb', 'comments_before', 'comments_after', 'file', 'raw', 'quote', 'end']
  TYPE = 'Token'

  constructor (args: any = {}) {
    if (args) {
      AST_Token.PROPS.map((item) => (this[item] = args[item]))
    }
  }
}
