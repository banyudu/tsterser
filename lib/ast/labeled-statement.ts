import AST_Node from './node'
import { OutputStream } from '../output'
import AST_StatementWithBody, { AST_StatementWithBody_Props } from './statement-with-body'
import Compressor from '../compressor'
import { push, pop, to_moz, make_node, is_ast_break, is_ast_loop_control } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_LabeledStatement extends AST_StatementWithBody {
  label: any

  get_loopcontrol_target (node: AST_Node) {
    if (node.label && this.label.name == node.label.name) {
      return this.body
    }
  }

  _optimize (compressor: Compressor): any {
    if (is_ast_break(this.body) &&
          compressor.loopcontrol_target(this.body) === this.body) {
      return make_node('AST_EmptyStatement', this)
    }
    return this.label.references.length == 0 ? this.body : this
  }

  may_throw (compressor: Compressor) {
    return this.body.may_throw(compressor)
  }

  has_side_effects (compressor?: Compressor) {
    return this.body.has_side_effects(compressor)
  }

  reduce_vars (tw: TreeWalker) {
    push(tw)
    this.body.walk(tw)
    pop(tw)
    return true
  }

  walkInner () {
    const result: AST_Node[] = []
    result.push(this.label)
    result.push(this.body)
    return result
  }

  _children_backwards (push: Function) {
    push(this.body)
    push(this.label)
  }

  clone (deep: boolean) {
    const node = this._clone(deep)
    if (deep) {
      const label = node.label
      const def = this.label
      node.walk(new TreeWalker(function (node: AST_Node) {
        if (is_ast_loop_control(node) &&
                    node.label && node.label.thedef === def) {
          node.label.thedef = label
          label.references.push(node)
        }
      }))
    }
    return node
  }

  _size = () => 2
  shallow_cmp_props: any = { 'label.name': 'eq' }
  _transform (tw: TreeTransformer) {
    this.label = this.label.transform(tw)
    this.body = (this.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'LabeledStatement',
      label: to_moz(this.label),
      body: to_moz(this.body)
    }
  }

  _codegen (output: OutputStream) {
    this.label.print(output)
    output.colon();
    (this.body).print(output)
  }

  add_source_map () { }
  static documentation: 'Statement with a label'
  static propdoc = {
    label: '[AST_Label] a label definition'
  } as any

  static PROPS = AST_StatementWithBody.PROPS.concat(['label'])
  constructor (args: AST_LabeledStatement_Props) {
    super(args)
    this.label = args.label
  }
}

export interface AST_LabeledStatement_Props extends AST_StatementWithBody_Props {
  label?: any | undefined
}
