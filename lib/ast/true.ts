import AST_Boolean from './boolean'

export default class AST_True extends AST_Boolean {
  is_boolean () { return true }
  value = true
  _size = () => 4
  static documentation = 'The `true` atom'

  static PROPS = AST_Boolean.PROPS
}
