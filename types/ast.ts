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
  drop_side_effect_free: Function
  may_throw: Function
  has_side_effects: Function
  is_string: Function
  _dot_throw: Function
  is_number: Function
  isAst: <T extends AST_Node_Interface>(type: string) => this is T
  is_boolean: Function
  walk: Function
  is_constant: Function
}

export interface AST_Array_Props extends AST_Node_Props {
  elements: AST_Node_Interface[]
}

export interface AST_Array_Interface extends AST_Node_Interface {
  elements: AST_Node_Interface[]
}

export interface AST_Await_Props extends AST_Node_Props {
  expression: AST_Node_Interface
}

export interface AST_Await_Interface extends AST_Node_Interface, AST_Node_Props { }

export interface AST_Binary_Props extends AST_Node_Props {
  operator: string
  left: AST_Node_Interface
  right: AST_Node_Interface
}

export interface AST_Binary_Interface extends AST_Node_Interface, AST_Binary_Props {}

export interface AST_Sequence_Props extends AST_Node_Props {
  expressions: AST_Node_Interface[]
  tail_node: Function
}

export interface AST_Sequence_Interface extends AST_Node_Interface, AST_Sequence_Props {}

export interface AST_Unary_Props extends AST_Node_Props {
  operator: string
  expression: AST_Node_Interface
}
export interface AST_Unary_Interface extends AST_Node_Interface, AST_Unary_Props {}

export interface AST_PropAccess_Props extends AST_Node_Props {
  expression: AST_Node_Interface
  property: AST_Node_Interface | string
}
export interface AST_PropAccess_Interface extends AST_Node_Interface, AST_Unary_Props {}

export interface AST_Symbol_Props extends AST_Node_Props {
  scope: AST_Scope_Interface
  name: string
  thedef: SymbolDef_Interface
  unmangleable: Function
}
export interface AST_Symbol_Interface extends AST_Symbol_Props, AST_Node_Interface {}

export interface AST_Statement_Props extends AST_Node_Props{
  body: AST_Node_Interface[] | AST_Node_Interface
}
export interface AST_Statement_Interface extends AST_Statement_Props, AST_Node_Interface {}

export interface AST_Block_Props extends AST_Statement_Props{
  body: AST_Node_Interface[]
  block_scope: AST_Scope_Interface | null
}
export interface AST_Block_Interface extends AST_Block_Props, Omit<AST_Statement_Interface, 'body'> {}

export interface AST_Scope_Props extends AST_Block_Props{
  variables: Map<string, SymbolDef_Interface>
  functions: any
  uses_with: boolean
  uses_eval: boolean
  parent_scope: AST_Scope_Interface | null
  enclosed: any
  cname: any
  init_scope_vars: Function
  hoist_properties: Function
  hoist_declarations: Function
  drop_unused: Function
  find_variable: Function
  is_block_scope: Function
  get_defun_scope: Function
  def_variable: Function
  add_var_name: Function
  _block_scope: boolean
  _var_name_cache: Set<string> | null
  _added_var_names: Set<string> | null
}
export interface AST_Scope_Interface extends AST_Scope_Props, AST_Block_Interface { }

export interface SymbolDef_Interface {
  name: string
  orig: AST_SymbolRef_Interface[]
  init: AST_SymbolRef_Interface
  eliminated: number
  scope: AST_Scope_Interface
  references: AST_SymbolRef_Interface[]
  replaced: number
  global: boolean
  export: number
  mangled_name: null | string
  undeclared: boolean
  id: number
  unmangleable: Function
}

export interface AST_SymbolRef_Props extends AST_Symbol_Props {
  reference: Function
  is_immutable: Function
  is_declared: Function
}
export interface AST_SymbolRef_Interface extends AST_Symbol_Props, AST_Symbol_Interface {
  definition: Function
}
