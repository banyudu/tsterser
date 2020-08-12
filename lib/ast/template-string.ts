import AST_Node from './node'
import AST_TemplateSegment from './template-segment'
import AST_PrefixedTemplateString from './prefixed-template-string'
import { make_node, trim, first_in_statement, make_sequence, anySideEffect, return_true, pass_through, do_list, to_moz } from '../utils'

export default class AST_TemplateString extends AST_Node {
  segments: any

  _optimize (self, compressor) {
    if (!compressor.option('evaluate') ||
      compressor.parent() instanceof AST_PrefixedTemplateString) { return self }

    var segments: any[] = []
    for (var i = 0; i < self.segments.length; i++) {
      var segment = self.segments[i]
      if (segment instanceof AST_Node) {
        var result = segment.evaluate?.(compressor)
        // Evaluate to constant value
        // Constant value shorter than ${segment}
        if (result !== segment && (result + '').length <= segment.size?.(undefined, undefined) + '${}'.length) {
          // There should always be a previous and next segment if segment is a node
          segments[segments.length - 1].value = segments[segments.length - 1].value + result + self.segments[++i].value
          continue
        }
        // `before ${`innerBefore ${any} innerAfter`} after` => `before innerBefore ${any} innerAfter after`
        // TODO:
        // `before ${'test' + foo} after` => `before innerBefore ${any} innerAfter after`
        // `before ${foo + 'test} after` => `before innerBefore ${any} innerAfter after`
        if (segment instanceof AST_TemplateString) {
          var inners = segment.segments
          segments[segments.length - 1].value += inners[0].value
          for (var j = 1; j < inners.length; j++) {
            segment = inners[j]
            segments.push(segment)
          }
          continue
        }
      }
      segments.push(segment)
    }
    self.segments = segments

    // `foo` => "foo"
    if (segments.length == 1) {
      return make_node('AST_String', self, segments[0])
    }
    if (segments.length === 3 && segments[1] instanceof AST_Node) {
      // `foo${bar}` => "foo" + bar
      if (segments[2].value === '') {
        return make_node('AST_Binary', self, {
          operator: '+',
          left: make_node('AST_String', self, {
            value: segments[0].value
          }),
          right: segments[1]
        })
      }
      // `{bar}baz` => bar + "baz"
      if (segments[0].value === '') {
        return make_node('AST_Binary', self, {
          operator: '+',
          left: segments[1],
          right: make_node('AST_String', self, {
            value: segments[2].value
          })
        })
      }
    }
    return self
  }

  drop_side_effect_free (compressor: any) {
    var values = trim(this.segments, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  has_side_effects (compressor: any) {
    return anySideEffect(this.segments, compressor)
  }

  _eval () {
    if (this.segments.length !== 1) return this
    return this.segments[0].value
  }

  is_string = return_true
  _walk (visitor: any) {
    return visitor._visit(this, function (this: any) {
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

  shallow_cmp = pass_through
  _transform (self, tw: any) {
    self.segments = do_list(self.segments, tw)
  }

  _to_mozilla_ast (parent) {
    var quasis: any[] = []
    var expressions: any[] = []
    for (var i = 0; i < this.segments.length; i++) {
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

  _codegen (self, output) {
    var is_tagged = output.parent() instanceof AST_PrefixedTemplateString

    output.print('`')
    for (var i = 0; i < self.segments.length; i++) {
      if (!(self.segments[i] instanceof AST_TemplateSegment)) {
        output.print('${')
        self.segments[i].print(output)
        output.print('}')
      } else if (is_tagged) {
        output.print(self.segments[i].raw)
      } else {
        output.print_template_string_chars(self.segments[i].value)
      }
    }
    output.print('`')
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A template string literal'
  static propdoc = {
    segments: '[AST_Node*] One or more segments, starting with AST_TemplateSegment. AST_Node may follow AST_TemplateSegment, but each AST_Node must be followed by AST_TemplateSegment.'
  }

  static PROPS = AST_Node.PROPS.concat(['segments'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.segments = args.segments
  }
}
