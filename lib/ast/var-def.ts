import AST_SymbolVar from './symbol-var'
import AST_SymbolLet from './symbol-let'
import AST_SymbolConst from './symbol-const'
import AST_Destructuring from './destructuring'
import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import { suppress, safe_to_assign, mark, to_moz, parenthesize_for_noin, is_ast_destructuring, is_ast_for, is_ast_for_in } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_VarDef extends AST_Node {
  name: AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar
  value: AST_Node | undefined
  eliminated: number
  replaced: number

  may_throw (compressor: Compressor) {
    if (!this.value) return false
    return this.value.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.value as any
  }

  reduce_vars (tw: TreeWalker, descend: Function) {
    const node = this
    if (is_ast_destructuring(node.name)) {
      suppress(node.name)
      return
    }
    const d = node.name.definition?.()
    if (node.value) {
      if (safe_to_assign(tw, d, node.name.scope, node.value)) {
        d.fixed = function () {
          return node.value
        }
        tw.loop_ids.set(d.id, tw.in_loop)
        mark(tw, d, false)
        descend()
        mark(tw, d, true)
        return true
      } else {
        d.fixed = false
      }
    }
  }

  walkInner = (visitor: TreeWalker) => {
    this.name._walk(visitor)
    if (this.value) this.value._walk(visitor)
  }

  _children_backwards (push: Function) {
    if (this.value) push(this.value)
    push(this.name)
  }

  _size (): number {
    return this.value ? 1 : 0
  }

  shallow_cmp_props: any = {
    value: 'exist'
  }

  _transform (tw: TreeTransformer) {
    this.name = this.name.transform(tw)
    if (this.value) this.value = this.value.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'VariableDeclarator',
      id: to_moz(this.name),
      init: to_moz(this.value)
    }
  }

  _codegen (output: OutputStream) {
    this.name.print(output)
    if (this.value) {
      output.space()
      output.print('=')
      output.space()
      const p = output.parent(1)
      const noin = is_ast_for(p) || is_ast_for_in(p)
      parenthesize_for_noin(this.value, output, noin)
    }
  }

  static documentation = 'A variable declaration; only appears in a AST_Definitions node'
  static propdoc = {
    name: '[AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar] name of the variable',
    value: "[AST_Node?] initializer, or null of there's no initializer"
  }

  static PROPS = AST_Node.PROPS.concat(['name', 'value'])
  constructor (args?: AST_VarDef_Props) {
    super(args)
    this.name = args.name
    this.value = args.value
  }
}

export interface AST_VarDef_Props extends AST_Node_Props {
  name?: AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar | undefined
  value?: AST_Node | undefined | undefined
}
