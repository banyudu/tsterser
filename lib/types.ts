export interface Comment {
  value: string
  type: 'comment1' | 'comment2' | 'comment3' | 'comment4' | 'comment5'
  pos: number
  line: number
  col: number
  nlb?: boolean
}
