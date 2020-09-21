import AST from './_base'
import { Comment } from '../types'

export default class AST_Token extends AST {
  value?: string
  type?: string
  pos: number
  line: number
  col: number
  nlb?: boolean
  file: string = ''
  raw?: string
  quote: string = ''
  endpos: number | null = null
  endline: number | null = null
  endcol: number | null = null
  comments_before: Comment[] = []
  comments_after: Comment[] = []
  end?: any

  static PROPS = ['type', 'value', 'line', 'col', 'pos', 'endline', 'endcol', 'endpos', 'nlb', 'comments_before', 'comments_after', 'file', 'raw', 'quote', 'end']

  public isAst (type: string) {
    return type === 'AST_Token'
  }

  constructor (args: AST_Token_Props) {
    super()

    this.type = args.type
    this.value = args.value
    this.line = args.line
    this.col = args.col
    this.pos = args.pos
    this.endline = args.endline
    this.endpos = args.endpos
    this.nlb = args.nlb
    this.comments_before = args.comments_before ?? []
    this.comments_after = args.comments_after ?? []
    this.file = args.file
    this.raw = args.raw
    this.quote = args.quote ?? ''
    this.end = args.end
  }
}

export interface AST_Token_Props {
  type?: string | undefined
  value?: string | undefined
  line: number
  col: number
  pos: number
  endline: number
  endpos: number
  nlb?: boolean | undefined
  comments_before?: Comment[] | undefined
  comments_after?: Comment[] | undefined
  file: string
  raw: string
  quote?: string | undefined
  end?: any
  endcol: number
}
