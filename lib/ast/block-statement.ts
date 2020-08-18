import AST_Block from './block'
import { tighten_body, can_be_evicted_from_block, block_aborts, to_moz, make_node, blockStateMentCodeGen } from '../utils'

export default class AST_BlockStatement extends AST_Block {
  _optimize (compressor) {
    tighten_body(this.body, compressor)
    switch (this.body.length) {
      case 1:
        if (!compressor.has_directive('use strict') &&
              compressor.parent()?.isAst?.('AST_If') &&
              can_be_extracted_from_if_block(this.body[0]) ||
              can_be_evicted_from_block(this.body[0])) {
          return this.body[0]
        }
        break
      case 0: return make_node('AST_EmptyStatement', this)
    }
    return this
  }

  aborts = block_aborts
  _to_mozilla_ast (parent): any {
    return {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
  }

  _codegen = blockStateMentCodeGen
  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A block statement'

  static PROPS = AST_Block.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

function can_be_extracted_from_if_block (node: any) {
  return !(
    node?.isAst?.('AST_Const') ||
        node?.isAst?.('AST_Let') ||
        node?.isAst?.('AST_Class')
  )
}
