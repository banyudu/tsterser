import AST_IterationStatement from './iteration-statement'
import Compressor from '../compressor'
import { suppress, reset_block_variables, push, pop, to_moz, pass_through } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_ForIn extends AST_IterationStatement {
  object: any
  reduce_vars (tw: TreeWalker, descend, compressor: Compressor) {
    reset_block_variables(compressor, this)
    suppress(this.init)
    this.object.walk(tw)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    this.body.walk(tw)
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.init._walk(visitor)
      this.object._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    if (this.object) push(this.object)
    if (this.init) push(this.init)
  }

  _size = () => 8
  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    self.init = self.init?.transform(tw) || null
    self.object = self.object.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'ForInStatement',
      left: to_moz(this.init),
      right: to_moz(this.object),
      body: to_moz(this.body)
    }
  }

  _codegen (self, output) {
    output.print('for')
    if (self.await) {
      output.space()
      output.print('await')
    }
    output.space()
    output.with_parens(function () {
            self.init?.print(output)
            output.space()
            output.print(self?.isAst?.('AST_ForOf') ? 'of' : 'in')
            output.space()
            self.object.print(output)
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `for ... in` statement'
  static propdoc = {
    init: '[AST_Node] the `for/in` initialization code',
    object: "[AST_Node] the object that we're looping through"
  } as any

  static PROPS = AST_IterationStatement.PROPS.concat(['init', 'object'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.init = args.init
    this.object = args.object
  }
}
