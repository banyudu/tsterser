import AST_DWLoop from './dw-loop'
import { make_node, pass_through, to_moz, push, pop, make_block, reset_block_variables, has_break_or_continue } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Do extends AST_DWLoop {
  _optimize (self, compressor) {
    if (!compressor.option('loops')) return self
    var cond = self.condition.tail_node().evaluate(compressor)
    if (!(cond?.isAst?.('AST_Node'))) {
      if (cond) {
        return make_node('AST_For', self, {
          body: make_node('AST_BlockStatement', self.body, {
            body: [
              self.body,
              make_node('AST_SimpleStatement', self.condition, {
                body: self.condition
              })
            ]
          })
        }).optimize(compressor)
      }
      if (!has_break_or_continue(self, compressor.parent())) {
        return make_node('AST_BlockStatement', self.body, {
          body: [
            self.body,
            make_node('AST_SimpleStatement', self.condition, {
              body: self.condition
            })
          ]
        }).optimize(compressor)
      }
    }
    return self
  }

  reduce_vars (tw: TreeWalker, descend, compressor: any) {
    reset_block_variables(compressor, this)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    this.body.walk(tw)
    if (has_break_or_continue(this)) {
      pop(tw)
      push(tw)
    }
    this.condition.walk(tw)
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.body._walk(visitor)
      this.condition._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.condition)
    push(this.body)
  }

  _size = () => 9
  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.body = (self.body).transform(tw)
    self.condition = self.condition.transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'DoWhileStatement',
      test: to_moz(this.condition),
      body: to_moz(this.body)
    }
  }

  _codegen (self, output) {
    output.print('do')
    output.space()
    make_block(self.body, output)
    output.space()
    output.print('while')
    output.space()
    output.with_parens(function () {
      self.condition.print(output)
    })
    output.semicolon()
  }

  static documentation = 'A `do` statement'

  static PROPS = AST_DWLoop.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
