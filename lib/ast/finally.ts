import { OutputStream } from '../output'
import AST_Block, { AST_Block_Props } from './block'
import { list_overhead, print_braced } from '../utils'

export default class AST_Finally extends AST_Block {
  argname: any
  shallow_cmp_props: any = {}
  _size (): number {
    return 7 + list_overhead(this.body)
  }

  _codegen (output: OutputStream) {
    output.print('finally')
    output.space()
    print_braced(this, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A `finally` node; only makes sense as part of a `try` statement'

  static PROPS = AST_Block.PROPS.concat(['argname'])
  constructor (args: AST_Finally_Props) {
    super(args)
    this.argname = args.argname
  }
}

export interface AST_Finally_Props extends AST_Block_Props {
  argname?: any | undefined
}
