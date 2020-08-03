import {
  AST_Lambda,
  AST_Directive,
  AST_Scope,
  AST_LabeledStatement,
  AST_IterationStatement,
  AST_Break,
  AST_Switch,
  AST_Class
} from './ast'

import { noop } from './utils'

export default class TreeWalker {
  visit: any
  stack: any[]
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
    if (node instanceof AST_Lambda) {
      this.directives = Object.create(this.directives)
    } else if (node instanceof AST_Directive && !this.directives[node.value]) {
      this.directives[node.value] = node
    } else if (node instanceof AST_Class) {
      this.directives = Object.create(this.directives)
      if (!this.directives['use strict']) {
        this.directives['use strict'] = node
      }
    }
    this.stack.push(node)
  }

  pop () {
    var node = this.stack.pop()
    if (node instanceof AST_Lambda || node instanceof AST_Class) {
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
        if (!(st instanceof AST_Directive)) break
        if (st.value == type) return st
      }
    }
  }

  loopcontrol_target (node: any): any | undefined {
    var stack = this.stack
    if (node.label) {
      for (var i = stack.length; --i >= 0;) {
        var x = stack[i]
        if (x instanceof AST_LabeledStatement && x.label.name == node.label.name) { return x.body } // TODO: check this type
      }
    } else {
      for (var i = stack.length; --i >= 0;) {
        var x = stack[i]
        if (x instanceof AST_IterationStatement ||
                node instanceof AST_Break && x instanceof AST_Switch) { return x }
      }
    }
  }
}
