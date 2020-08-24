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
  walk_parent,
  set_moz_loc,
  FROM_MOZ_STACK,
  setFromMozStack,
  print,
  basic_negation,
  from_moz, is_ast_constant, is_ast_reg_exp, is_ast_unary_prefix
} from '../utils'

import Compressor from '../compressor'

export default class AST_Node extends AST {
  start: AST_Token
  end: AST_Token
  expression: AST_Node
  label?: any

  _prepend_comments_check (node) {
    return false
  }

  to_fun_args (croak: Function): any {
    croak('Invalid function parameter', this.start.line, this.start.col)
  }

  _in_boolean_context (context) {
    return false
  }

  _in_boolean_context_next (context) {
    return this.tail_node() === context
  }

  get_loopcontrol_target (node: AST_Node) {
    return undefined
  }

  isAst<T extends AST_Node> (type: string): this is T {
    let proto: any = this.constructor
    while (proto.name) {
      if (proto.name === type) {
        return true
      }
      proto = Object.getPrototypeOf(proto)
    }
    return false
  }

  _codegen_should_output_space (child: AST_Node) { return false }

  _needs_parens (child: AST_Node) {
    return false
  }

  _optimize (compressor?: Compressor) {
    return this
  }

  drop_side_effect_free (compressor: Compressor, first_in_statement?): AST_Node {
    return this
  }

  may_throw (compressor: Compressor) { return true }
  has_side_effects (compressor: Compressor) { return true }
  _eval (compressor?: Compressor, depth?: number): any { return this }
  is_constant_expression (scope?: any) { return false }
  negate (compressor: Compressor, first_in_statement?: any) {
    return basic_negation(this)
  }

  _find_defs (compressor: Compressor, suffix) {}
  is_string (compressor: Compressor) { return false }
  is_number (compressor: Compressor) { return false }
  is_boolean () { return false }
  reduce_vars (tw: TreeWalker, descend, compressor: Compressor) {}
  _dot_throw (compressor: Compressor) { return is_strict(compressor) }
  // methods to evaluate a constant expression
  // If the node has been successfully reduced to a constant,
  // then its value is returned; otherwise the element itself
  // is returned.
  // They can be distinguished as constant value is never a
  // descendant of AST_Node.
  evaluate (compressor: Compressor) {
    if (!compressor.option('evaluate')) return this
    const val = this._eval(compressor, 1)
    if (!val || val instanceof RegExp) return val
    if (typeof val === 'function' || typeof val === 'object') return this
    return val
  }

  is_constant () {
    // Accomodate when compress option evaluate=false
    // as well as the common constant expressions !0 and -1
    if (is_ast_constant(this)) {
      return !(is_ast_reg_exp(this))
    } else {
      return is_ast_unary_prefix(this) &&
              is_ast_constant((this as any).expression) &&
              unaryPrefix.has((this as any).operator)
    }
  }

  is_call_pure (compressor: Compressor) { return false }

  // may_throw_on_access()
  // returns true if this node may be null, undefined or contain `AST_Accessor`
  may_throw_on_access (compressor: Compressor) {
    return !compressor.option('pure_getters') ||
          this._dot_throw(compressor)
  }

  equivalent_to (node: AST_Node) {
    return equivalent_to(this, node)
  }

  is_block_scope () { return false }
  _clone (deep?: boolean) {
    if (deep) {
      const self = this.clone()
      return self.transform(new TreeTransformer(function (node: AST_Node) {
        if (node !== self) {
          return node.clone(true)
        }
      }))
    }
    return new this.CTOR(this)
  }

  clone (deep?: boolean) {
    return this._clone(deep)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this)
  }

  addStrings (add: Function) {

  }

  walk (visitor: TreeWalker) {
    return this._walk(visitor) // not sure the indirection will be any help
  }

  _children_backwards (push: Function) {}
  _size (info: any) { return 0 }
  size (compressor: Compressor, stack) {
    let size = 0
    walk_parent(this, (node, info) => {
      size += node?._size(info) || 0
    }, stack || (compressor?.stack))

    // just to save a bit of memory

    return size
  }

  transform (this: any, tw: any, in_list?: boolean) {
    let transformed: any | undefined
    tw.push(this)
    if (tw.before) transformed = tw.before(this, this._transform, in_list)
    if (transformed === undefined) {
      transformed = this
      this._transform(transformed, tw)
      if (tw.after) {
        const after_ret = tw.after(transformed, in_list)
        if (after_ret !== undefined) transformed = after_ret
      }
    }
    tw.pop()
    return transformed
  }

  _transform (self: AST_Node, tw: TreeWalker) {}

  shallow_cmp (other?: any): any {
    throw new Error('did not find a shallow_cmp function for ' + this.constructor.name)
  }

  print (output: OutputStream, force_parens?: boolean) {
    return this._print(output, force_parens)
  }

  _print = print
  print_to_string (options?: any) {
    const output = GetOutputStream(options)
    this.print(output)
    return output.get()
  }

  needs_parens (output: OutputStream) { return false }
  optimize (compressor: Compressor) {
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

  to_mozilla_ast (parent: AST_Node) {
    if (!this._to_mozilla_ast) {
      throw new Error('to_mozilla_ast not defined')
    }
    return set_moz_loc(this, this._to_mozilla_ast(parent))
  }

  _to_mozilla_ast (parent: AST_Node) {}

  add_source_map (output: OutputStream) {}
  tail_node () { return this }
  static documentation = 'Base class of all AST nodes'
  static propdoc = {
    start: '[AST_Token] The first token of this node',
    end: '[AST_Token] The last token of this node'
  } as any

  static warn_function = null
  static warn (txt, props?) {
    if (AST_Node.warn_function) { AST_Node.warn_function(string_template(txt, props)) }
  }

  public static from_mozilla_ast (node: AST_Node) {
    const save_stack = FROM_MOZ_STACK
    setFromMozStack([])
    const ast = from_moz(node)
    setFromMozStack(save_stack)
    return ast
  }

  get CTOR (): new (...args: any[]) => any {
    return this.constructor as any
  }

  flags = 0

  static PROPS = ['start', 'end']

  constructor (args?) { // eslint-disable-line
    super()
    this.start = args?.start
    this.end = args?.end
  }
}
