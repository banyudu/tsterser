import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import { string_template } from '../utils'
import Compressor from '../compressor'
import AST_Scope from './scope'

export default class AST_Statement extends AST_Node {
  public body: any
  public block_scope?: AST_Scope

  public _eval (_compressor: Compressor): any {
    throw new Error(string_template('Cannot evaluate a statement [{file}:{line},{col}]', this.start))
  }

  protected aborts (): any { return null }
  public negate (_compressor: Compressor, _first_in_statement: Function | boolean): AST_Node {
    throw new Error('Cannot negate a statement')
  }

  public clone (deep: boolean = false): AST_Node {
    const clone = this._clone(deep)
    if (this.block_scope) {
      // TODO this is sometimes undefined during compression.
      // But it should always have a value!
      clone.block_scope = this.block_scope.clone()
    }
    return clone
  }

  protected _codegen (output: OutputStream) {
    (this.body).print(output)
    output.semicolon()
  }

  public static documentation = 'Base class of all statements'

  public static PROPS =AST_Node.PROPS
}

export interface AST_Statement_Props extends AST_Node_Props {
}
