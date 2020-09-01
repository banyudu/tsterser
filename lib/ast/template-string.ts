import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import AST_TemplateSegment from './template-segment'
import Compressor from '../compressor'
import { make_node, trim, first_in_statement, make_sequence, anySideEffect, do_list, to_moz, is_ast_prefixed_template_string, is_ast_node, is_ast_template_segment, is_ast_template_string } from '../utils'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

export default class AST_TemplateString extends AST_Node {
  segments: AST_TemplateSegment[]

  _optimize (compressor: Compressor) {
    if (!compressor.option('evaluate') ||
      is_ast_prefixed_template_string(compressor.parent())) { return this }

    const segments: any[] = []
    for (let i = 0; i < this.segments.length; i++) {
      let segment = this.segments[i]
      if (is_ast_node(segment)) {
        const result = segment.evaluate?.(compressor)
        // Evaluate to constant value
        // Constant value shorter than ${segment}
        if (result !== segment && (result + '').length <= segment.size?.(undefined, undefined) + '${}'.length) {
          // There should always be a previous and next segment if segment is a node
          segments[segments.length - 1].value = segments[segments.length - 1].value + result + this.segments[++i].value
          continue
        }
        // `before ${`innerBefore ${any} innerAfter`} after` => `before innerBefore ${any} innerAfter after`
        // TODO:
        // `before ${'test' + foo} after` => `before innerBefore ${any} innerAfter after`
        // `before ${foo + 'test} after` => `before innerBefore ${any} innerAfter after`
        if (is_ast_template_string(segment)) {
          const inners = segment.segments
          segments[segments.length - 1].value += inners[0].value
          for (let j = 1; j < inners.length; j++) {
            segment = inners[j]
            segments.push(segment)
          }
          continue
        }
      }
      segments.push(segment)
    }
    this.segments = segments

    // `foo` => "foo"
    if (segments.length == 1) {
      return make_node('AST_String', this, segments[0])
    }
    if (segments.length === 3 && is_ast_node(segments[1])) {
      // `foo${bar}` => "foo" + bar
      if (segments[2].value === '') {
        return make_node('AST_Binary', this, {
          operator: '+',
          left: make_node('AST_String', this, {
            value: segments[0].value
          }),
          right: segments[1]
        })
      }
      // `{bar}baz` => bar + "baz"
      if (segments[0].value === '') {
        return make_node('AST_Binary', this, {
          operator: '+',
          left: segments[1],
          right: make_node('AST_String', this, {
            value: segments[2].value
          })
        })
      }
    }
    return this
  }

  drop_side_effect_free (compressor: Compressor) {
    const values = trim(this.segments, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  has_side_effects (compressor: Compressor) {
    return anySideEffect(this.segments, compressor)
  }

  _eval () {
    if (this.segments.length !== 1) return this
    return this.segments[0].value
  }

  is_string () { return true }
  _walk (visitor: TreeWalker) {
    return visitor._visit(this, () => {
      this.segments.forEach(function (seg) {
        seg._walk(visitor)
      })
    })
  }

  _children_backwards (push: Function) {
    let i = this.segments.length
    while (i--) push(this.segments[i])
  }

  _size (): number {
    return 2 + (Math.floor(this.segments.length / 2) * 3) /* "${}" */
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    this.segments = do_list(this.segments, tw)
  }

  _to_mozilla_ast (parent: AST_Node) {
    const quasis: any[] = []
    const expressions: any[] = []
    for (let i = 0; i < this.segments.length; i++) {
      if (i % 2 !== 0) {
        expressions.push(to_moz(this.segments[i]))
      } else {
        quasis.push({
          type: 'TemplateElement',
          value: {
            raw: this.segments[i].raw,
            cooked: this.segments[i].value
          },
          tail: i === this.segments.length - 1
        })
      }
    }
    return {
      type: 'TemplateLiteral',
      quasis: quasis,
      expressions: expressions
    }
  }

  _codegen (output: OutputStream) {
    const is_tagged = is_ast_prefixed_template_string(output.parent())

    output.print('`')
    for (let i = 0; i < this.segments.length; i++) {
      if (!(is_ast_template_segment(this.segments[i]))) {
        output.print('${')
        this.segments[i].print(output)
        output.print('}')
      } else if (is_tagged) {
        output.print(this.segments[i].raw)
      } else {
        output.print_template_string_chars(this.segments[i].value)
      }
    }
    output.print('`')
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A template string literal'
  static propdoc = {
    segments: '[AST_Node*] One or more segments, starting with AST_TemplateSegment. AST_Node may follow AST_TemplateSegment, but each AST_Node must be followed by AST_TemplateSegment.'
  }

  static PROPS = AST_Node.PROPS.concat(['segments'])
  constructor (args?: AST_TemplateString_Props) {
    super(args)
    this.segments = args.segments
  }
}

export interface AST_TemplateString_Props extends AST_Node_Props {
  segments?: AST_TemplateSegment[] | undefined
}
