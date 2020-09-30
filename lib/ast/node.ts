import AST_Scope from './scope'
import GetOutputStream, { OutputStream } from '../output'
import TreeTransformer from '../tree-transformer'
import TreeWalker from '../tree-walker'
import AST from './_base'
import AST_Token from './token'

import { OPTIMIZED, has_flag, set_flag, unaryPrefix } from '../constants'

import {
  string_template,
  equivalent_to,
  is_strict,
  base54,
  best_of,
  is_ast_expansion,
  make_sequence,
  make_node,
  is_ast_scope,
  is_ast_directive,
  is_ast_symbol,
  is_ast_dot,
  is_ast_sub,
  walk_parent,
  is_ast_destructuring,
  set_moz_loc,
  FROM_MOZ_STACK,
  is_ast_array,
  is_ast_call,
  is_ast_assign,
  display_body,
  is_ast_binary,
  skip_string,
  is_ast_conditional,
  setFromMozStack,
  basic_negation,
  is_ast_unary,
  from_moz, is_ast_constant, is_ast_reg_exp, is_ast_unary_prefix
} from '../utils'

import Compressor from '../compressor'
import { MangleOptions, MozillaAst } from '../types'

export let printMangleOptions: MangleOptions | undefined
export function setPrintMangleOptions (val: MangleOptions | undefined) {
  printMangleOptions = val
}

export default class AST_Node extends AST {
  public start: AST_Token
  public end: AST_Token
  public expression: AST_Node | null = null
  public label?: any
  // type: string
  public left: any
  public value: any
  public right: any
  public _annotations?: number
  public body?: any
  public key: any
  public definitions?: AST_Node[]
  public scope: any
  public name: any
  public block_scope?: AST_Scope | null

  protected _codegen (_output: OutputStream) {}

  protected print_braced_empty (output: OutputStream) {
    const self: AST_Node = this
    output.print('{')
    output.with_indent(output.next_indent(), function () {
      output.append_comments(self, true)
    })
    output.print('}')
  }

  protected print_braced (output: OutputStream, allow_directives: boolean = false) {
    if ((this.body as any[]).length > 0) {
      output.with_block(() => {
        display_body(this.body, false, output, !!allow_directives)
      })
    } else this.print_braced_empty(output)
  }

  protected literals_in_boolean_context (compressor: Compressor) {
    if (compressor.in_boolean_context()) {
      return best_of(compressor, this, make_sequence(this, [
        this,
        make_node('AST_True', this)
      ]).optimize(compressor))
    }
    return this
  }

  protected inline_array_like_spread (_compressor: Compressor, elements: any[]) {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (is_ast_expansion(el)) {
        const expr = el.expression
        if (is_ast_array(expr)) {
          elements.splice(i, 1, ...expr.elements)
          // Step back one, as the element at i is now new.
          i--
        }
        // In array-like spread, spreading a non-iterable value is TypeError.
        // We therefore can’t optimize anything else, unlike with object spread.
      }
    }
    return this
  }

  protected needsParens (output: OutputStream) {
    const p = output.parent()
    // !(a = false) → true
    if (is_ast_unary(p)) { return true }
    // 1 + (a = 2) + 3 → 6, side effect setting a = 2
    if (is_ast_binary(p) && !(is_ast_assign(p))) { return true }
    // (a = func)() —or— new (a = Object)()
    if (is_ast_call(p) && p.expression === this) { return true }
    // (a = foo) ? bar : baz
    if (is_ast_conditional(p) && p.condition === this) { return true }
    // (a = foo)["prop"] —or— (a = foo).prop
    if (p?._needs_parens(this)) { return true }
    // ({a, b} = {a: 1, b: 2}), a destructuring assignment
    if (is_ast_assign(this) && is_ast_destructuring(this.left) && !this.left.is_array) { return true }
    return false
  }

  public _prepend_comments_check (_node: AST_Node) {
    return false
  }

  public to_fun_args (croak: Function): any {
    croak('Invalid function parameter', this.start.line, this.start.col)
  }

  protected _in_boolean_context (_context: AST_Node) {
    return false
  }

  protected _in_boolean_context_next (context: AST_Node): boolean {
    return this.tail_node() === context
  }

  public get_loopcontrol_target (_node: AST_Node): any {
    return undefined
  }

  public isAst<T extends AST_Node> (type: string): this is T {
    let proto: any = this.constructor
    while (proto.name) {
      if (proto.name === type) {
        return true
      }
      proto = Object.getPrototypeOf(proto)
    }
    return false
  }

  protected _codegen_should_output_space (_child: AST_Node) { return false }

  protected _needs_parens (_child: AST_Node) {
    return false
  }

  protected _optimize (_compressor?: Compressor): AST_Node {
    return this
  }

  public drop_side_effect_free (_compressor: Compressor, _first_in_statement?: Function | boolean): AST_Node | null {
    return this
  }

  public may_throw (_compressor: Compressor) { return true }
  public has_side_effects (_compressor: Compressor) { return true }
  public _eval (_compressor?: Compressor, _depth?: number): any { return this }
  public is_constant_expression (_scope?: AST_Scope) { return false }
  public negate (_compressor: Compressor, _first_in_statement?: Function | boolean) {
    return basic_negation(this)
  }

  public _find_defs (_compressor: Compressor, _suffix: string): any {}
  public is_string (_compressor: Compressor) { return false }
  public is_number (_compressor: Compressor) { return false }
  public is_boolean () { return false }
  public reduce_vars (_tw: TreeWalker, _descend: Function, _compressor: Compressor) {}
  public _dot_throw (compressor: Compressor) { return is_strict(compressor) }
  // methods to evaluate a constant expression
  // If the node has been successfully reduced to a constant,
  // then its value is returned; otherwise the element itself
  // is returned.
  // They can be distinguished as constant value is never a
  // descendant of AST_Node.
  public evaluate (compressor: Compressor) {
    if (!compressor.option('evaluate')) return this
    const val = this._eval(compressor, 1)
    if (!val || val instanceof RegExp) return val
    if (typeof val === 'function' || typeof val === 'object') return this
    return val
  }

  public is_constant (): boolean {
    // Accomodate when compress option evaluate=false
    // as well as the common constant expressions !0 and -1
    if (is_ast_constant(this)) {
      return !(is_ast_reg_exp(this))
    } else {
      return is_ast_unary_prefix(this) &&
              is_ast_constant(this.expression) &&
              unaryPrefix.has(this.operator)
    }
  }

  public is_call_pure (_compressor: Compressor) { return false }

  // may_throw_on_access()
  // returns true if this node may be null, undefined or contain `AST_Accessor`
  public may_throw_on_access (compressor: Compressor) {
    return !compressor.option('pure_getters') ||
          this._dot_throw(compressor)
  }

  public equivalent_to (node: AST_Node) {
    return equivalent_to(this, node)
  }

  public is_block_scope () { return false }
  protected _clone (deep: boolean = false) {
    if (deep) {
      const self = this.clone()
      return self.transform(new TreeTransformer(function (node: AST_Node) {
        if (node !== self) {
          return node.clone(true)
        }
        return undefined
      }))
    }
    return new this.CTOR(this)
  }

  public clone (deep: boolean = false): AST_Node {
    return this._clone(deep)
  }

  protected walkInner (): AST_Node[] {
    return []
  }

  public walk (visitor: TreeWalker) {
    return visitor._visit(this, () => this.walkInner?.()?.forEach(item => item?.walk(visitor)))
  }

  public addStrings (_add: Function) {

  }

  public _children_backwards (_push: Function) {}
  public _size (_info?: any) { return 0 }
  public size (compressor?: Compressor, stack?: any) {
    let size = 0
    walk_parent(this, (node: AST_Node, info: any) => {
      size += node?._size(info) || 0
    }, stack || (compressor?.stack))

    // just to save a bit of memory

    return size
  }

  public transform (tw: TreeTransformer, in_list: boolean = false) {
    let transformed: any | undefined
    tw.push(this)
    if (tw.before) transformed = tw.before(this, (_node: AST_Node, tw: TreeTransformer) => this._transform(tw), in_list)
    if (transformed === undefined) {
      transformed = this
      this._transform(tw)
      if (tw.after) {
        const after_ret = tw.after(transformed, in_list)
        if (after_ret !== undefined) transformed = after_ret
      }
    }
    tw.pop()
    return transformed
  }

  protected _transform (_tw: TreeTransformer) {}

  public shallow_cmp_props: any = undefined

  public shallow_cmp (other?: any): any {
    if (this.shallow_cmp_props === undefined) {
      throw new Error('did not find a shallow_cmp function for ' + this.constructor.name)
    }
    const self: any = this
    for (const key in self.shallow_cmp_props) {
      if (this.shallow_cmp_props[key] === 'eq') {
        if (self[key] !== other[key]) {
          return false
        }
      } else if (this.shallow_cmp_props[key] === 'exist') {
        // return `(this.${key} == null ? other.${key} == null : this.${key} === other.${key})`
        if ((self[key] != null || other[key] != null) && (self[key] == null || self[key] !== other[key])) {
          return false
        }
      } else {
        throw new Error(`mkshallow: Unexpected instruction: ${this.shallow_cmp_props[key]}`)
      }
    }
    return true
  }

  public print (output: OutputStream, force_parens: boolean = false) {
    return this._print(output, force_parens)
  }

  public print_to_string (options?: any) {
    const output = GetOutputStream(options)
    this.print(output)
    return output.get()
  }

  private _print (output: OutputStream, force_parens: boolean = false) {
    const generator = this._codegen.bind(this)
    if (is_ast_scope(this)) {
      output.active_scope = this
    } else if (!output.use_asm && is_ast_directive(this) && this.value == 'use asm') {
      output.use_asm = output.active_scope
    }
    const doit = () => {
      output.prepend_comments(this)
      this.add_source_map(output)
      generator(output)
      output.append_comments(this)
    }
    output.push_node(this)
    if (force_parens || this.needs_parens(output)) {
      output.with_parens(doit)
    } else {
      doit()
    }
    output.pop_node()
    if (this === output.use_asm as any) {
      output.use_asm = null
    }

    if (printMangleOptions) {
      if (is_ast_symbol(this) && !this.unmangleable(printMangleOptions)) {
        base54.consider(this.name, -1)
      } else if (printMangleOptions.properties) {
        if (is_ast_dot(this)) {
          base54.consider(this.property, -1)
        } else if (is_ast_sub(this)) {
          skip_string(this.property)
        }
      }
    }
  }

  protected needs_parens (_output: OutputStream): boolean { return false }
  public optimize (compressor: Compressor) {
    if (!this._optimize) {
      throw new Error('optimize not defined')
    }
    const self = this
    if (has_flag(self, OPTIMIZED)) return self
    if (compressor.has_directive('use asm')) return self
    const opt = this._optimize(compressor)
    set_flag(opt, OPTIMIZED)
    return opt
  }

  public to_mozilla_ast (parent: AST_Node): MozillaAst {
    if (!this._to_mozilla_ast) {
      throw new Error('to_mozilla_ast not defined')
    }
    return set_moz_loc(this, this._to_mozilla_ast(parent))
  }

  public _to_mozilla_ast (_parent: AST_Node): any {}

  protected add_source_map (_output: OutputStream) {}
  public tail_node (): AST_Node { return this }
  public static documentation = 'Base class of all AST nodes'
  public static propdoc ={
    start: '[AST_Token] The first token of this node',
    end: '[AST_Token] The last token of this node'
  } as any

  public static warn_function = function (warning: any) {
    if (AST_Node.enable_warnings) {
      AST_Node.warnings.push(warning)
    }
  }

  public static warnings: any[] = []
  public static enable_warnings = false

  public static warn (txt: string, props?: any) {
    if (AST_Node.warn_function) { AST_Node.warn_function(string_template(txt, props)) }
  }

  public static from_mozilla_ast (node: MozillaAst) {
    const save_stack = FROM_MOZ_STACK
    setFromMozStack([])
    const ast = from_moz(node)
    setFromMozStack(save_stack as any)
    return ast
  }

  public get CTOR (): new (...args: any[]) => any {
    return this.constructor as any
  }

  public flags = 0

  public static PROPS =['start', 'end']

  public constructor (args: AST_Node_Props) {
    super()
    this.start = args?.start as any
    this.end = args?.end as any
  }
}

export interface AST_Node_Props {
  start?: AST_Token | undefined
  end?: AST_Token | undefined
}
