import AST_Atom, { AST_Atom_Props } from './atom'
import { MozillaAst } from '../types'
export default class AST_Hole extends AST_Atom {
  to_fun_args (croak: Function): any {
    return this
  }

  value = (function () {}())

  to_mozilla_ast (): MozillaAst { return null }

  _size = () => 0 // comma is taken into account

  _codegen () { }
  static documentation = 'A hole in an array'

  static PROPS = AST_Atom.PROPS
}

export interface AST_Hole_Props extends AST_Atom_Props {
}
