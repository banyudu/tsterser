import AST_Jump from './jump'
import TreeWalker from '../tree-walker'

export default class AST_Exit extends AST_Jump {
  value: any

  _prepend_comments_check (node) {
    return true
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, this.value && function (this) {
      this.value._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    if (this.value) push(this.value)
  }

  _transform (self, tw: TreeWalker) {
    if (self.value) self.value = self.value.transform(tw)
  }

  _do_print (output: any, kind: string) {
    output.print(kind)
    if (this.value) {
      output.space()
      const comments = this.value.start.comments_before
      if (comments?.length && !output.printed_comments.has(comments)) {
        output.print('(')
        this.value.print(output)
        output.print(')')
      } else {
        this.value.print(output)
      }
    }
    output.semicolon()
  }

  static documentation = 'Base class for “exits” (`return` and `throw`)'
  static propdoc = {
    value: '[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return'
  }

  static PROPS = AST_Jump.PROPS.concat(['value'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.value = args.value
  }
}
