import AST_Boolean from './boolean'
import { return_true } from '../utils'

export default class AST_True extends AST_Boolean {
  is_boolean = return_true
  value = true
  _size = () => 4
  static documentation = 'The `true` atom'

  static PROPS = AST_Boolean.PROPS
}
