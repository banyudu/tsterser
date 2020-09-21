import { OutputStream } from '../output'
import AST_Node, { AST_Node_Props } from './node'
import Compressor from '../compressor'
import AST_Destructuring from './destructuring'
import { MozillaAst } from '../types'
import { trim, list_overhead, do_list, to_moz, make_sequence, anyMayThrow, anySideEffect, is_ast_hole } from '../utils'
import TreeTransformer from '../tree-transformer'

export default class AST_Array extends AST_Node {
  public elements: AST_Node[]

  public to_fun_args (croak: Function): any {
    return new AST_Destructuring({
      start: this.start,
      end: this.end,
      is_array: true,
      names: this.elements.map(item => item.to_fun_args(croak))
    })
  }

  protected _optimize (compressor: Compressor): any {
    const optimized = this.literals_in_boolean_context(compressor)
    if (optimized !== this) {
      return optimized
    }
    return this.inline_array_like_spread(compressor, this.elements)
  }

  public drop_side_effect_free (compressor: Compressor, first_in_statement: Function | boolean): any {
    const values = trim(this.elements, compressor, first_in_statement)
    return values && make_sequence(this, values)
  }

  public may_throw (compressor: Compressor) {
    return anyMayThrow(this.elements, compressor)
  }

  public has_side_effects (compressor: Compressor) {
    return anySideEffect(this.elements, compressor)
  }

  public _eval (compressor: Compressor, depth: number) {
    if (compressor.option('unsafe')) {
      const elements: any[] = []
      for (let i = 0, len = this.elements.length; i < len; i++) {
        const element = this.elements[i]
        const value = element._eval(compressor, depth)
        if (element === value) return this
        elements.push(value)
      }
      return elements
    }
    return this
  }

  public is_constant_expression () {
    return this.elements.every((l) => l.is_constant_expression())
  }

  public _dot_throw () { return false }
  protected walkInner () {
    const result: AST_Node[] = []
    const elements = this.elements
    for (let i = 0, len = elements.length; i < len; i++) {
      result.push(elements[i])
    }
    return result
  }

  public _children_backwards (push: Function) {
    let i = this.elements.length
    while (i--) push(this.elements[i])
  }

  public _size (): number {
    return 2 + list_overhead(this.elements)
  }

  public shallow_cmp_props: any = {}
  protected _transform (tw: TreeTransformer) {
    this.elements = do_list(this.elements, tw)
  }

  public _to_mozilla_ast (_parent: AST_Node): MozillaAst {
    return {
      type: 'ArrayExpression',
      elements: this.elements.map(to_moz)
    }
  }

  protected _codegen (output: OutputStream) {
    output.with_square(() => {
      const a = this.elements; const len = a.length
      if (len > 0) output.space()
      a.forEach(function (exp, i) {
        if (i) output.comma()
        exp.print(output)
        // If the final element is a hole, we need to make sure it
        // doesn't look like a trailing comma, by inserting an actual
        // trailing comma.
        if (i === len - 1 && is_ast_hole(exp)) { output.comma() }
      })
      if (len > 0) output.space()
    })
  }

  protected add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  public static documentation = 'An array literal'
  public static propdoc ={
    elements: '[AST_Node*] array of elements'
  }

  public static PROPS =AST_Node.PROPS.concat(['elements'])
  public constructor (args: AST_Array_Props) { // eslint-disable-line
    super(args)
    this.elements = args.elements
  }
}

export interface AST_Array_Props extends AST_Node_Props {
  elements: AST_Node[]
}
