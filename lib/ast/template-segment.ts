import { OutputStream } from '../output'
import AST_Node from './node'
import { mkshallow } from '../utils'

export default class AST_TemplateSegment extends AST_Node {
  value: any
  raw: any

  drop_side_effect_free () { return null }
  has_side_effects () { return false }
  shallow_cmp = mkshallow({ value: 'eq' })
  _size (): number {
    return this.value.length
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A segment of a template string literal'
  static propdoc = {
    value: 'Content of the segment',
    raw: 'Raw content of the segment'
  }

  static PROPS = AST_Node.PROPS.concat(['value', 'raw'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.value = args.value
    this.raw = args.raw
  }
}
