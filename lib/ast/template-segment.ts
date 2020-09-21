import { OutputStream } from '../output'
import Compressor from '../compressor'
import AST_Node, { AST_Node_Props } from './node'
import '../utils'

export default class AST_TemplateSegment extends AST_Node {
  value: any
  raw: any

  public drop_side_effect_free (): any { return null }
  public has_side_effects (_compressor: Compressor) { return false }
  shallow_cmp_props: any = { value: 'eq' }
  public _size (): number {
    return this.value.length
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A segment of a template string literal'
  static propdoc = {
    value: 'Content of the segment',
    raw: 'Raw content of the segment'
  }

  static PROPS = AST_Node.PROPS.concat(['value', 'raw'])
  constructor (args: AST_TemplateSegment_Props) {
    super(args)
    this.value = args.value
    this.raw = args.raw
  }
}

export interface AST_TemplateSegment_Props extends AST_Node_Props {
  value?: any | undefined
  raw?: any | undefined
}
