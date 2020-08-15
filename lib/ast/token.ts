import AST from './_base'
import { AST_Token_Props, AST_Token_Interface } from '../../types/ast'

export default class AST_Token extends AST implements AST_Token_Interface {
  value?: string
  type?: string
  pos: number
  line: number
  col: number
  nlb?: boolean
  file: string
  raw: string
  quote: string
  endpos: number | null
  endline: number | null
  endcol: number | null
  comments_before?: Comment[]
  comments_after?: Comment[]
  end?: any

  static PROPS = ['type', 'value', 'line', 'col', 'pos', 'endline', 'endcol', 'endpos', 'nlb', 'comments_before', 'comments_after', 'file', 'raw', 'quote', 'end']

  isAst (type: string) {
    return type === 'AST_Token'
  }

  constructor (args?: AST_Token_Props) {
    super()

    if (args) {
      this.type = args.type
      this.value = args.value
      this.line = args.line
      this.col = args.col
      this.pos = args.pos
      this.endline = args.endline
      this.endpos = args.endpos
      this.nlb = args.nlb
      this.comments_before = args.comments_before
      this.comments_after = args.comments_after
      this.file = args.file
      this.raw = args.raw
      this.quote = args.quote
      this.end = args.end
    }
  }
}
