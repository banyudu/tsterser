import AST_Atom, { AST_Atom_Props } from './atom'
import { MozillaAst } from '../types'
export default class AST_Hole extends AST_Atom {
  public to_fun_args (_croak: Function): any {
    return this
  }

  public value = (function () {}())

  public to_mozilla_ast (): MozillaAst { return null as any }

  public _size = () => 0 // comma is taken into account

  protected _codegen () { }
  public static documentation = 'A hole in an array'

  public static PROPS =AST_Atom.PROPS
}

export interface AST_Hole_Props extends AST_Atom_Props {
}
