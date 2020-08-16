import { noop } from './utils'
import AST_Node from './ast/node'
import AST_Scope from './ast/scope'

export default class TreeWalker {
  visit: any
  stack: AST_Node[]
  directives: AnyObject
  safe_ids: any
  in_loop: any
  loop_ids: Map<any, any> | undefined
  defs_to_safe_ids: Map<any, any> | undefined
  constructor (callback?: (node: any, descend: Function) => any) {
    this.visit = callback
    this.stack = []
    this.directives = Object.create(null)
  }

  _visit (node: any, descend?: Function) {
    this.push(node)
    var ret = this.visit(node, descend ? function () {
      descend.call(node)
    } : noop)
    if (!ret && descend) {
      descend.call(node)
    }
    this.pop()
    return ret
  }

  parent (n = 0) {
    return this.stack[this.stack.length - 2 - (n || 0)]
  }

  push (node: any) {
    if (node?.isAst?.('AST_Lambda')) {
      this.directives = Object.create(this.directives)
    } else if (node?.isAst?.('AST_Directive') && !this.directives[node.value]) {
      this.directives[node.value] = node
    } else if (node?.isAst?.('AST_Class')) {
      this.directives = Object.create(this.directives)
      if (!this.directives['use strict']) {
        this.directives['use strict'] = node
      }
    }
    this.stack.push(node)
  }

  pop () {
    var node = this.stack.pop()
    if (node?.isAst?.('AST_Lambda') || node?.isAst?.('AST_Class')) {
      this.directives = Object.getPrototypeOf(this.directives)
    }
  }

  self () {
    return this.stack[this.stack.length - 1]
  }

  find_parent (type: any) {
    var stack = this.stack
    for (var i = stack.length; --i >= 0;) {
      var x = stack[i]
      if (x instanceof type) return x
    }
  }

  has_directive (type: string): any {
    var dir = this.directives[type]
    if (dir) return dir
    var node = this.stack[this.stack.length - 1]
    if (node instanceof AST_Scope && node.body) {
      for (var i = 0; i < node.body.length; ++i) {
        var st = node.body[i]
        if (!(st?.isAst?.('AST_Directive'))) break
        if (st.value == type) return st
      }
    }
  }

  loopcontrol_target (node: any): any | undefined {
    var stack = this.stack
    for (var i = stack.length; --i >= 0;) {
      var x = stack[i]
      const target = x.get_loopcontrol_target(node)
      if (target) {
        return target
      }
    }
  }
}
