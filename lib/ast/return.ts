import AST_Exit from './exit'
import { is_undefined, to_moz } from '../utils'

export default class AST_Return extends AST_Exit {
  _optimize (_self, compressor) {
    if (this.value && is_undefined(this.value, compressor)) {
      this.value = null
    }
    return this
  }

  may_throw (compressor: any) {
    return this.value && this.value.may_throw(compressor)
  }

  _size () {
    return this.value ? 7 : 6
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ReturnStatement',
      argument: to_moz(this.value)
    }
  }

  _codegen (self, output) {
    self._do_print(output, 'return')
  }

  static documentation: 'A `return` statement'

  static PROPS = AST_Exit.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
