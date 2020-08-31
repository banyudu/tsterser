import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Block from './block'
import { tighten_body, can_be_evicted_from_block, block_aborts, to_moz, make_node, blockStateMentCodeGen, is_ast_if, is_ast_const, is_ast_let, is_ast_class } from '../utils'

export default class AST_BlockStatement extends AST_Block {
  _optimize (compressor: Compressor) {
    tighten_body(this.body, compressor)
    switch (this.body.length) {
      case 1:
        if (!compressor.has_directive('use strict') &&
              is_ast_if(compressor.parent()) &&
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
  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'BlockStatement',
      body: this.body.map(to_moz)
    }
  }

  _codegen (output: OutputStream) {
    blockStateMentCodeGen(this, output)
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A block statement'

  static PROPS = AST_Block.PROPS
}

function can_be_extracted_from_if_block (node: AST_Node) {
  return !(
    is_ast_const(node) ||
        is_ast_let(node) ||
        is_ast_class(node)
  )
}
