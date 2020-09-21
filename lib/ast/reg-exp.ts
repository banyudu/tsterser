import AST_Node from './node'
import Compressor from '../compressor'
import { OutputStream } from '../output'
import AST_Constant, { AST_Constant_Props } from './constant'
import { regexp_source_fix, sort_regexp_flags } from '../utils'
import { MozillaAst } from '../types'

const r_slash_script = /(<\s*\/\s*script)/i
const slash_script_replace = (_: any, $1: string) => $1.replace('/', '\\/')

export default class AST_RegExp extends AST_Constant {
  public value: RegExp
  protected _optimize (compressor: Compressor): any {
    return this.literals_in_boolean_context(compressor)
  }

  public _eval (compressor: Compressor) {
    let evaluated = compressor.evaluated_regexps.get(this)
    if (evaluated === undefined) {
      try {
        evaluated = eval(this.print_to_string()) // eslint-disable-line no-eval
      } catch (e) {
        evaluated = null
      }
      compressor.evaluated_regexps.set(this, evaluated)
    }
    return evaluated || this
  }

  public _size (): number {
    return this.value.toString().length
  }

  public shallow_cmp (other: any) {
    return (
      this.value.flags === other.value.flags &&
                this.value.source === other.value.source
    )
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    const pattern = this.value.source
    const flags = this.value.flags
    return {
      type: 'Literal',
      value: null,
      raw: this.print_to_string(),
      regex: { pattern, flags }
    }
  }

  protected _codegen (output: OutputStream) {
    let { source, flags } = this.getValue()
    source = regexp_source_fix(source)
    flags = flags ? sort_regexp_flags(flags) : ''
    source = source.replace(r_slash_script, slash_script_replace)
            output.print?.(output.to_utf8(`/${source}/${flags}`))
            const parent = output.parent()
            if (parent?._codegen_should_output_space?.(this)) {
              output.print(' ')
            }
  }

  public static documentation = 'A regexp literal'
  public static propdoc ={
    value: '[RegExp] the actual regexp'
  }

  public static PROPS =AST_Constant.PROPS.concat(['value'])

  public constructor (args: AST_RegExp_Props) {
    super(args)
    this.value = args.value
  }
}

export interface AST_RegExp_Props extends AST_Constant_Props {
  value: RegExp
}
