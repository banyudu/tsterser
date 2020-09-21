import AST_Atom, { AST_Atom_Props } from './atom'
import { MozillaAst } from '../types'
export default class AST_Hole extends AST_Atom {
  public to_fun_args (_croak: Function): any {
    return this
  }

  value = (function () {}())

  public to_mozilla_ast (): MozillaAst { return null as any }

  _size = () => 0 // comma is taken into account

  protected _codegen () { }
  static documentation = 'A hole in an array'

  static PROPS = AST_Atom.PROPS
}

export interface AST_Hole_Props extends AST_Atom_Props {
}
