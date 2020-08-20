import AST_Block from './block'
import Compressor from '../compressor'
import AST_Node from './node'
import TreeWalker from '../tree-walker'

import {
  make_node_from_constant,
  best_of_expression,
  extract_declarations_from_unreachable_code,
  aborts,
  print_braced_empty,
  make_node,
  anySideEffect,
  pass_through,
  walk_body,
  do_list,
  to_moz,
  list_overhead,
  anyMayThrow
} from '../utils'

export default class AST_Switch extends AST_Block {
  get_loopcontrol_target (node: AST_Node) {
    if (node?.isAst?.('AST_Break') && !node.label) {
      return this
    }
  }

  _optimize (compressor) {
    const self = this
    if (!compressor.option('switches')) return self
    var branch
    var value = self.expression.evaluate(compressor)
    if (!(value?.isAst?.('AST_Node'))) {
      var orig = self.expression
      self.expression = make_node_from_constant(value, orig)
      self.expression = best_of_expression(self.expression.transform(compressor), orig)
    }
    if (!compressor.option('dead_code')) return self
    if (value?.isAst?.('AST_Node')) {
      value = self.expression.tail_node().evaluate(compressor)
    }
    var decl: any[] = []
    var body: any[] = []
    var default_branch
    var exact_match
    for (var i = 0, len = self.body.length; i < len && !exact_match; i++) {
      branch = self.body[i]
      if (branch?.isAst?.('AST_Default')) {
        if (!default_branch) {
          default_branch = branch
        } else {
          eliminate_branch(branch, body[body.length - 1])
        }
      } else if (!(value?.isAst?.('AST_Node'))) {
        var exp = branch.expression.evaluate(compressor)
        if (!(exp?.isAst?.('AST_Node')) && exp !== value) {
          eliminate_branch(branch, body[body.length - 1])
          continue
        }
        if (exp?.isAst?.('AST_Node')) exp = branch.expression.tail_node().evaluate(compressor)
        if (exp === value) {
          exact_match = branch
          if (default_branch) {
            var default_index = body.indexOf(default_branch)
            body.splice(default_index, 1)
            eliminate_branch(default_branch, body[default_index - 1])
            default_branch = null
          }
        }
      }
      if (aborts(branch)) {
        var prev = body[body.length - 1]
        if (aborts(prev) && prev.body.length == branch.body.length &&
                  make_node('AST_BlockStatement', prev, prev).equivalent_to(make_node('AST_BlockStatement', branch, branch))) {
          prev.body = []
        }
      }
      body.push(branch)
    }
    while (i < len) eliminate_branch(self.body[i++], body[body.length - 1])
    if (body.length > 0) {
      body[0].body = decl.concat(body[0].body)
    }
    self.body = body
    while (branch = body[body.length - 1]) {
      var stat = branch.body[branch.body.length - 1]
      if (stat?.isAst?.('AST_Break') && compressor.loopcontrol_target(stat) === self) { branch.body.pop() }
      if (branch.body.length || branch?.isAst?.('AST_Case') &&
              (default_branch || branch.expression.has_side_effects(compressor))) break
      if (body.pop() === default_branch) default_branch = null
    }
    if (body.length == 0) {
      return make_node('AST_BlockStatement', self, {
        body: decl.concat(make_node('AST_SimpleStatement', self.expression, {
          body: self.expression
        }))
      }).optimize(compressor)
    }
    if (body.length == 1 && (body[0] === exact_match || body[0] === default_branch)) {
      var has_break = false
      var tw = new TreeWalker(function (node: any) {
        if (has_break ||
                  node?.isAst?.('AST_Lambda') ||
                  node?.isAst?.('AST_SimpleStatement')) return true
        if (node?.isAst?.('AST_Break') && tw.loopcontrol_target(node) === self) { has_break = true }
      })
      self.walk(tw)
      if (!has_break) {
        var statements = body[0].body.slice()
        var exp = body[0].expression
        if (exp) {
          statements.unshift(make_node('AST_SimpleStatement', exp, {
            body: exp
          }))
        }
        statements.unshift(make_node('AST_SimpleStatement', self.expression, {
          body: self.expression
        }))
        return make_node('AST_BlockStatement', self, {
          body: statements
        }).optimize(compressor)
      }
    }
    return self

    function eliminate_branch (branch, prev) {
      if (prev && !aborts(prev)) {
        prev.body = prev.body.concat(branch.body)
      } else {
        extract_declarations_from_unreachable_code(compressor, branch, decl)
      }
    }
  }

  may_throw (compressor: Compressor) {
    return this.expression.may_throw(compressor) ||
          anyMayThrow(this.body, compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.expression.has_side_effects(compressor) ||
          anySideEffect(this.body, compressor)
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function () {
      this.expression._walk(visitor)
      walk_body(this, visitor)
    })
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  _size (): number {
    return 8 + list_overhead(this.body)
  }

  shallow_cmp = pass_through
  _transform (self, tw: TreeWalker) {
    self.expression = self.expression.transform(tw)
    self.body = do_list(self.body, tw)
  }

  _to_mozilla_ast (parent): any {
    return {
      type: 'SwitchStatement',
      discriminant: to_moz(this.expression),
      cases: this.body.map(to_moz)
    }
  }

  _codegen (self, output) {
    output.print('switch')
    output.space()
    output.with_parens(function () {
      self.expression.print(output)
    })
    output.space()
    var last = self.body.length - 1
    if (last < 0) print_braced_empty(self, output)
    else {
      output.with_block(function () {
        (self.body as any[]).forEach(function (branch, i) {
          output.indent(true)
          branch.print(output)
          if (i < last && branch.body.length > 0) { output.newline() }
        })
      })
    }
  }

  add_source_map (output) { output.add_mapping(this.start) }
  static documentation = 'A `switch` statement'
  static propdoc = {
    expression: '[AST_Node] the `switch` “discriminant”'
  }

  static PROPS = AST_Block.PROPS.concat(['expression'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.expression = args.expression
  }
}
