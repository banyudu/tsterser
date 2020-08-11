import AST_StatementWithBody from './statement-with-body'
import { push, pop, mkshallow, to_moz, make_node, noop } from '../utils'
import TreeWalker from '../tree-walker'
import AST_Break from './break'
import AST_LoopControl from './loop-control'

export default class AST_LabeledStatement extends AST_StatementWithBody {
  label: any
  _optimize (self, compressor) {
    if (self.body instanceof AST_Break &&
          compressor.loopcontrol_target(self.body) === self.body) {
      return make_node('AST_EmptyStatement', self)
    }
    return self.label.references.length == 0 ? self.body : self
  }

  may_throw (compressor: any) {
    return this.body.may_throw(compressor)
  }

  has_side_effects (compressor: any) {
    return this.body.has_side_effects(compressor)
  }

  reduce_vars (tw) {
    push(tw)
    this.body.walk(tw)
    pop(tw)
    return true
  }

  _walk (visitor: any) {
    return visitor._visit(this, function () {
      this.label._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    push(this.label)
  }

  clone (deep: boolean) {
    var node = this._clone(deep)
    if (deep) {
      var label = node.label
      var def = this.label
      node.walk(new TreeWalker(function (node: any) {
        if (node instanceof AST_LoopControl &&
                    node.label && node.label.thedef === def) {
          node.label.thedef = label
          label.references.push(node)
        }
      }))
    }
    return node
  }

  _size = () => 2
  shallow_cmp = mkshallow({ 'label.name': 'eq' })
  _transform (self, tw: any) {
    self.label = self.label.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'LabeledStatement',
      label: to_moz(this.label),
      body: to_moz(this.body)
    }
  }

  _codegen (self, output) {
    self.label.print(output)
    output.colon();
    (self.body).print(output)
  }

  add_source_map = noop
  static documentation: 'Statement with a label'
  static propdoc = {
    label: '[AST_Label] a label definition'
  } as any

  TYPE = 'LabeledStatement'
  static PROPS = AST_StatementWithBody.PROPS.concat(['label'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.label = args.label
  }
}
