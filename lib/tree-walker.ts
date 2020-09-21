import { is_ast_lambda, is_ast_directive, is_ast_class } from './utils'
import AST_Node from './ast/node'
import AST_Scope from './ast/scope'

export default class TreeWalker {
  public visit: Function | undefined
  public stack: AST_Node[]
  public directives: AnyObject
  public safe_ids: AnyObject
  public in_loop: any
  public loop_ids: Map<any, any>
  public defs_to_safe_ids: Map<number, AnyObject>
  public constructor (callback?: (node: any, descend: Function) => any) {
    this.visit = callback
    this.stack = []
    this.directives = Object.create(null)
    this.safe_ids = Object.create(null)
    this.in_loop = null
    this.loop_ids = new Map()
    this.defs_to_safe_ids = new Map()
  }

  public _visit (node: AST_Node, descend?: Function) {
    this.push(node)
    const ret = this.visit?.(node, () => {
      descend?.()
    })
    if (!ret) {
      descend?.()
    }
    this.pop()
    return ret
  }

  public parent (n = 0): any {
    return this.stack[this.stack.length - 2 - (n || 0)]
  }

  public push (node: AST_Node) {
    if (is_ast_lambda(node)) {
      this.directives = Object.create(this.directives)
    } else if (is_ast_directive(node) && !this.directives[node.value]) {
      this.directives[node.value] = node
    } else if (is_ast_class(node)) {
      this.directives = Object.create(this.directives)
      if (!this.directives['use strict']) {
        this.directives['use strict'] = node
      }
    }
    this.stack.push(node)
  }

  public pop () {
    const node = this.stack.pop()
    if (is_ast_lambda(node) || is_ast_class(node)) {
      this.directives = Object.getPrototypeOf(this.directives)
    }
  }

  public self (): AST_Node {
    return this.stack[this.stack.length - 1]
  }

  public find_parent<T extends AST_Node> (type: new (args?: any) => T) {
    const stack = this.stack
    for (let i = stack.length; --i >= 0;) {
      const x = stack[i]
      if (x instanceof type) return x
    }
    return undefined
  }

  public has_directive (type: string): any {
    const dir = this.directives[type]
    if (dir) return dir
    const node = this.stack[this.stack.length - 1]
    if (node instanceof AST_Scope && node.body) {
      for (let i = 0; i < node.body.length; ++i) {
        const st = node.body[i]
        if (!(is_ast_directive(st))) break
        if (st.value == type) return st
      }
    }
  }

  public loopcontrol_target (node: AST_Node): any | undefined {
    const stack = this.stack
    for (let i = stack.length; --i >= 0;) {
      const x = stack[i]
      const target = x.get_loopcontrol_target(node)
      if (target) {
        return target
      }
    }
  }
}
