import AST_Constant from './constant'
import { regexp_source_fix, sort_regexp_flags, literals_in_boolean_context } from '../utils'

const r_slash_script = /(<\s*\/\s*script)/i
const slash_script_replace = (_: any, $1: string) => $1.replace('/', '\\/')

export default class AST_RegExp extends AST_Constant {
  value: any
  _optimize (self, compressor) {
    return literals_in_boolean_context(self, compressor)
  }

  _eval = function (compressor: any) {
    let evaluated = compressor.evaluated_regexps.get(this)
    if (evaluated === undefined) {
      try {
        evaluated = (0, eval)(this.print_to_string())
      } catch (e) {
        evaluated = null
      }
      compressor.evaluated_regexps.set(this, evaluated)
    }
    return evaluated || this
  }

  _size = function (): number {
    return this.value.toString().length
  }

  shallow_cmp = function (other) {
    return (
      this.value.flags === other.value.flags &&
            this.value.source === other.value.source
    )
  }

  _to_mozilla_ast (parent) {
    const pattern = this.value.source
    const flags = this.value.flags
    return {
      type: 'Literal',
      value: null,
      raw: this.print_to_string(),
      regex: { pattern, flags }
    }
  }

  _codegen = function (self, output) {
    let { source, flags } = self.getValue()
    source = regexp_source_fix(source)
    flags = flags ? sort_regexp_flags(flags) : ''
    source = source.replace(r_slash_script, slash_script_replace)
        output.print?.(output.to_utf8(`/${source}/${flags}`))
        const parent = output.parent()
        if (parent?._codegen_should_output_space?.(self)) {
          output.print(' ')
        }
  }

  static documentation = 'A regexp literal'
  static propdoc = {
    value: '[RegExp] the actual regexp'
  }

  static PROPS = AST_Constant.PROPS.concat(['value'])

  constructor (args) {
    super(args)
    this.value = args.value
  }
}
