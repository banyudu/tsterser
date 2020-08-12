import AST_Block from './block'
import AST_If from './if'
import AST_Const from './const'
import AST_Let from './let'
import { tighten_body, can_be_evicted_from_block, block_aborts, to_moz, make_node, blockStateMentCodeGen } from '../utils'

export default class AST_BlockStatement extends AST_Block {
  _optimize (self, compressor) {
    tighten_body(self.body, compressor)
    switch (self.body.length) {
      case 1:
        if (!compressor.has_directive('use strict') &&
              compressor.parent() instanceof AST_If &&
              can_be_extracted_from_if_block(self.body[0]) ||
              can_be_evicted_from_block(self.body[0])) {
          return self.body[0]
        }
        break
      case 0: return make_node('AST_EmptyStatement', self)
    }
    return self
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

  TYPE = 'BlockStatement'
  static PROPS = AST_Block.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}

function can_be_extracted_from_if_block (node: any) {
  return !(
    node instanceof AST_Const ||
        node instanceof AST_Let ||
        node?.isAst?.('AST_Class')
  )
}
