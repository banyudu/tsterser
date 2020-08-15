export interface IToken_Props {
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

export interface IToken extends IToken_Props { }

export interface INode_Props {
  start?: IToken
  end?: IToken
}

export interface INode extends INode_Props {
  is_constant_expression: Function
  _eval: Function
  drop_side_effect_free: Function
  may_throw: Function
  has_side_effects: Function
  is_string: Function
  _dot_throw: Function
  is_number: Function
  isAst: <T extends INode>(type: string) => this is T
  is_boolean: Function
  walk: Function
  is_constant: Function
  is_call_pure: Function
  expression: INode
  name?: any
  evaluate: Function
}

export interface IArray_Props extends INode_Props {
  elements: INode[]
}

export interface IArray extends INode {
  elements: INode[]
}

export interface IAwait_Props extends INode_Props {
  expression: INode
}

export interface IAwait extends INode, INode_Props { }

export interface IBinary_Props extends INode_Props {
  operator: string
  left: INode
  right: INode
}

export interface IBinary extends INode, IBinary_Props {}

export interface ISequence_Props extends INode_Props {
  expressions: INode[]
  tail_node: Function
}

export interface ISequence extends INode, ISequence_Props {}

export interface IUnary_Props extends INode_Props {
  operator: string
  expression: INode
}
export interface IUnary extends INode, IUnary_Props {}

export interface IPropAccess_Props extends INode_Props {
  expression: INode
  property: INode | string
}
export interface IPropAccess extends INode, IPropAccess_Props {}

export interface ISymbol_Props extends INode_Props {
  scope: IScope
  name?: any
  thedef: SymbolDef_Interface
  unmangleable: Function
}
export interface ISymbol extends ISymbol_Props, INode {}

export interface IStatement_Props extends INode_Props{
  body: INode[] | INode
}
export interface IStatement extends IStatement_Props, INode {}

export interface IBlock_Props extends IStatement_Props{
  body: INode[]
  block_scope: IScope | null
}
export interface IBlock extends IBlock_Props, Omit<IStatement, 'body'> {}

export interface IScope_Props extends IBlock_Props{
  variables: Map<string, SymbolDef_Interface>
  functions: any
  uses_with: boolean
  uses_eval: boolean
  parent_scope: IScope | null
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
export interface IScope extends IScope_Props, IBlock { }

export interface SymbolDef_Interface {
  name: string
  orig: ISymbolRef[]
  init: ISymbolRef
  eliminated: number
  scope: IScope
  references: ISymbolRef[]
  replaced: number
  global: boolean
  export: number
  mangled_name: null | string
  undeclared: boolean
  id: number
  unmangleable: Function
}

export interface ISymbolRef_Props extends ISymbol_Props {
  reference: Function
  is_immutable: Function
  is_declared: Function
}
export interface ISymbolRef extends ISymbol_Props, ISymbol {
  definition: Function
}

export interface ICall_Props extends INode_Props {
  expression: INode
  args: INode[]
  _annotations?: number
}
export interface ICall extends ICall_Props, INode {
  is_expr_pure: Function
}

export interface IDot_Props extends IPropAccess_Props {
  quote: string
}
export interface IDot extends IDot_Props, IPropAccess { }

export interface ILambda_Props extends IScope_Props {
  name: ISymbolDeclaration | INode | null
  // argnames: ArgType[]
  argnames: any[]
  uses_arguments: boolean
  is_generator: boolean
  async: boolean
  pinned?: Function
  make_var_name: Function
}
export interface ILambda extends ILambda_Props, Omit<IScope, 'name'> {}

export interface ISymbolDeclaration_Props extends ISymbol_Props {
  init: INode | null
  names: INode[]
  is_array: INode[]
  mark_enclosed: Function
  reference: Function
}
export interface ISymbolDeclaration extends ISymbolDeclaration_Props, ISymbol {}
