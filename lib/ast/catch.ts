import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Block from './block'
import { walk_body, list_overhead, do_list, to_moz, to_moz_block, print_braced } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_Catch extends AST_Block {
  argname: any

  _walk (visitor: any) {
    return visitor._visit(this, function (this) {
      if (this.argname) this.argname._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    if (this.argname) push(this.argname)
  }

  _size (): number {
    let size = 7 + list_overhead(this.body)
    if (this.argname) {
      size += 2
    }
    return size
  }

  shallow_cmp_props: any = {
    argname: 'exist'
  }

  _transform (self: AST_Catch, tw: TreeWalker) {
    if (self.argname) self.argname = self.argname.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    return {
      type: 'CatchClause',
      param: to_moz(this.argname),
      guard: null,
      body: to_moz_block(this)
    }
  }

  _codegen (self: AST_Catch, output: OutputStream) {
    output.print('catch')
    if (self.argname) {
      output.space()
      output.with_parens(function () {
        self.argname.print(output)
      })
    }
    output.space()
    print_braced(self, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A `catch` node; only makes sense as part of a `try` statement'
  static propdoc = {
    argname: '[AST_SymbolCatch|AST_Destructuring|AST_Expansion|AST_DefaultAssign] symbol for the exception'
  }

  static PROPS = AST_Block.PROPS.concat(['argname'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.argname = args.argname
  }
}
