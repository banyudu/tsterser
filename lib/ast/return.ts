import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Exit, { AST_Exit_Props } from './exit'
import Compressor from '../compressor'
import { is_undefined, to_moz } from '../utils'
import { MozillaAst } from '../types'

export default class AST_Return extends AST_Exit {
  protected _optimize (compressor: Compressor): any {
    if (this.value && is_undefined(this.value, compressor)) {
      this.value = null
    }
    return this
  }

  public may_throw (compressor: Compressor): boolean {
    return !!this.value?.may_throw(compressor)
  }

  public _size () {
    return this.value ? 7 : 6
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'ReturnStatement',
      argument: this.value ? to_moz(this.value) : null
    }
  }

  protected _codegen (output: OutputStream) {
    this._do_print(output, 'return')
  }

  public static documentation: 'A `return` statement'

  public static PROPS =AST_Exit.PROPS
}

export interface AST_Return_Props extends AST_Exit_Props {
}
