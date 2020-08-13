import AST_Boolean from './boolean'
import { return_true } from '../utils'

export default class AST_False extends AST_Boolean {
  is_boolean = return_true
  value = false
  _size = () => 5
  static documentation = 'The `false` atom'

  static PROPS = AST_Boolean.PROPS
}
