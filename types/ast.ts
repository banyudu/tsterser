export interface AST_Token_Props {
  value?: string
  type?: string
  pos: number
  line: number
  col: number
  nlb?: boolean
  file: string
  raw: string
  quote?: string
  endpos: number | null
  endline: number | null
  endcol: number | null
  comments_before?: Comment[]
  comments_after?: Comment[]
  end?: any
}

export interface AST_Token_Interface extends AST_Token_Props { }

export interface AST_Node_Props {
  start?: AST_Token_Interface
  end?: AST_Token_Interface
}

export interface AST_Node_Interface extends AST_Node_Props {
  is_constant_expression: Function
  _eval: Function
}

export interface AST_Array_Props extends AST_Node_Props {
  elements: AST_Node_Interface[]
}

export interface AST_Array_Interface extends AST_Node_Interface {
  elements: AST_Node_Interface[]
}
