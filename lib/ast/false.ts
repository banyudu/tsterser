import AST_Boolean from './boolean'

export default class AST_False extends AST_Boolean {
  is_boolean () { return true }
  value = false
  _size = () => 5
  static documentation = 'The `false` atom'

  static PROPS = AST_Boolean.PROPS
}
