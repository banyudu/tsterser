import { OutputStream } from '../output'
import TreeTransformer from '../tree-transformer'
import TreeWalker from '../tree-walker'
import AST from './_base'

import { OPTIMIZED, has_flag, set_flag, unaryPrefix } from '../constants'

import {
  string_template,
  return_false,
  equivalent_to,
  is_strict,
  walk_parent,
  set_moz_loc,
  FROM_MOZ_STACK,
  setFromMozStack,
  print,
  basic_negation,
  from_moz
} from '../utils'

import { INode_Props, INode, IToken } from '../../types/ast'

export default class AST_Node extends AST implements INode {
  start: IToken
  end: IToken
  expression: INode
  label?: any

  _in_boolean_context (context) {
    return false
  }

  _in_boolean_context_next (context) {
    return this.tail_node() === context
  }

  get_loopcontrol_target (node: any) {
    return undefined
  }

  isAst (type: string) {
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

  _optimize (self, compressor?: any) {
    return self
  }

  drop_side_effect_free (compressor: any, first_in_statement) {
    return this
  }

  may_throw (compressor: any) { return true }
  has_side_effects (compressor: any) { return true }
  _eval (compressor?: any, depth?: number): any { return this }
  is_constant_expression (scope?: any) { return false }
  negate (compressor: any, first_in_statement?: any) {
    return basic_negation(this)
  }

  _find_defs (compressor: any, suffix) {}
  is_string (compressor: any) { return false }
  is_number (compressor: any) { return false }
  is_boolean () { return false }
  reduce_vars (tw: TreeWalker, descend, compressor: any) {}
  _dot_throw (compressor) { return is_strict(compressor) }
  // methods to evaluate a constant expression
  // If the node has been successfully reduced to a constant,
  // then its value is returned; otherwise the element itself
  // is returned.
  // They can be distinguished as constant value is never a
  // descendant of AST_Node.
  evaluate (compressor: any) {
    if (!compressor.option('evaluate')) return this
    var val = this._eval(compressor, 1)
    if (!val || val instanceof RegExp) return val
    if (typeof val === 'function' || typeof val === 'object') return this
    return val
  }

  is_constant () {
    // Accomodate when compress option evaluate=false
    // as well as the common constant expressions !0 and -1
    if (this?.isAst?.('AST_Constant')) {
      return !(this?.isAst?.('AST_RegExp'))
    } else {
      return this?.isAst?.('AST_UnaryPrefix') &&
              (this as any).expression?.isAst?.('AST_Constant') &&
              unaryPrefix.has((this as any).operator)
    }
  }

  is_call_pure (compressor: any) { return false }

  // may_throw_on_access()
  // returns true if this node may be null, undefined or contain `AST_Accessor`
  may_throw_on_access (compressor: any) {
    return !compressor.option('pure_getters') ||
          this._dot_throw(compressor)
  }

  equivalent_to (node: any) {
    return equivalent_to(this, node)
  }

  is_block_scope = return_false
  _clone (deep?: boolean) {
    if (deep) {
      var self = this.clone()
      return self.transform(new TreeTransformer(function (node: any) {
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

  _walk (visitor: any) {
    return visitor._visit(this)
  }

  walk (visitor: any) {
    return this._walk(visitor) // not sure the indirection will be any help
  }

  _children_backwards (push: Function) {}
  _size (info: any) { return 0 }
  size (compressor, stack) {
    let size = 0
    walk_parent(this, (node, info) => {
      size += node?._size(info) || 0
    }, stack || (compressor && compressor.stack))

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

  _transform (self, tw: any) {}

  shallow_cmp (other?: any): any {
    throw new Error('did not find a shallow_cmp function for ' + this.constructor.name)
  }

  print (output: any, force_parens?: boolean) {
    return this._print(output, force_parens)
  }

  _print = print
  print_to_string (options?: any) {
    var output = OutputStream(options)
    this.print(output)
    return output.get()
  }

  needs_parens (output: any) { return false }
  optimize (compressor: any) {
    if (!this._optimize) {
      throw new Error('optimize not defined')
    }
    var self = this
    if (has_flag(self, OPTIMIZED)) return self
    if (compressor.has_directive('use asm')) return self
    var opt = this._optimize(self, compressor)
    set_flag(opt, OPTIMIZED)
    return opt
  }

  to_mozilla_ast = function (parent) {
    if (!this._to_mozilla_ast) {
      throw new Error('to_mozilla_ast not defined')
    }
    return set_moz_loc(this, this._to_mozilla_ast(parent))
  }

  add_source_map (output: any) {}
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

  static from_mozilla_ast (node: any) {
    var save_stack = FROM_MOZ_STACK
    setFromMozStack([])
    var ast = from_moz(node)
    setFromMozStack(save_stack)
    return ast
  }

  get CTOR (): new (...args: any[]) => any {
    return this.constructor as any
  }

  flags = 0

  static PROPS = ['start', 'end']

  constructor (args?: INode_Props) { // eslint-disable-line
    super()
    this.start = args?.start
    this.end = args?.end
  }
}
