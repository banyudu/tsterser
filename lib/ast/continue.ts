import AST_Node from './node'
import { OutputStream } from '../output'
import AST_LoopControl, { AST_LoopControl_Props } from './loop-control'
import { to_moz } from '../utils'

export default class AST_Continue extends AST_LoopControl {
  public _size () {
    return this.label ? 9 : 8
  }

  public _to_mozilla_ast (_parent: AST_Node): any {
    return {
      type: 'ContinueStatement',
      label: this.label ? to_moz(this.label) : null
    }
  }

  protected _codegen (output: OutputStream) {
    this._do_print(output, 'continue')
  }

  public static documentation = 'A `continue` statement'

  public static PROPS =AST_LoopControl.PROPS
}

export interface AST_Continue_Props extends AST_LoopControl_Props {
}
