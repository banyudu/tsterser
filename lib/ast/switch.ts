import { OutputStream } from '../output'
import AST_Block, { AST_Block_Props } from './block'
import Compressor from '../compressor'
import AST_Node from './node'
import TreeWalker from '../tree-walker'
import TreeTransformer from '../tree-transformer'

import {
  make_node_from_constant,
  best_of_expression,
  extract_declarations_from_unreachable_code,
  aborts,
  print_braced_empty,
  make_node,
  anySideEffect,
  do_list,
  to_moz,
  list_overhead,
  anyMayThrow, is_ast_break, is_ast_node, is_ast_default, is_ast_case, is_ast_lambda, is_ast_simple_statement
} from '../utils'

export default class AST_Switch extends AST_Block {
  expression: any | undefined

  get_loopcontrol_target (node: AST_Node) {
    if (is_ast_break(node) && !node.label) {
      return this
    }
  }

  _optimize (compressor: Compressor) {
    const self = this
    if (!compressor.option('switches')) return self
    let branch
    let value = self.expression.evaluate(compressor)
    if (!(is_ast_node(value))) {
      const orig = self.expression
      self.expression = make_node_from_constant(value, orig)
      self.expression = best_of_expression(self.expression.transform(compressor), orig)
    }
    if (!compressor.option('dead_code')) return self
    if (is_ast_node(value)) {
      value = self.expression.tail_node().evaluate(compressor)
    }
    const decl: any[] = []
    const body: any[] = []
    let default_branch
    let exact_match
    for (var i = 0, len = self.body.length; i < len && !exact_match; i++) {
      branch = self.body[i]
      if (is_ast_default(branch)) {
        if (!default_branch) {
          default_branch = branch
        } else {
          eliminate_branch(branch, body[body.length - 1])
        }
      } else if (!(is_ast_node(value))) {
        let exp = branch.expression.evaluate(compressor)
        if (!(is_ast_node(exp)) && exp !== value) {
          eliminate_branch(branch, body[body.length - 1])
          continue
        }
        if (is_ast_node(exp)) exp = branch.expression.tail_node().evaluate(compressor)
        if (exp === value) {
          exact_match = branch
          if (default_branch) {
            const default_index = body.indexOf(default_branch)
            body.splice(default_index, 1)
            eliminate_branch(default_branch, body[default_index - 1])
            default_branch = null
          }
        }
      }
      if (aborts(branch)) {
        const prev = body[body.length - 1]
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
    while ((branch = body[body.length - 1])) {
      const stat = branch.body[branch.body.length - 1]
      if (is_ast_break(stat) && compressor.loopcontrol_target(stat) === self) { branch.body.pop() }
      if (branch.body.length || is_ast_case(branch) &&
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
      let has_break = false
      var tw = new TreeWalker(function (node: AST_Node) {
        if (has_break ||
                  is_ast_lambda(node) ||
                  is_ast_simple_statement(node)) return true
        if (is_ast_break(node) && tw.loopcontrol_target(node) === self) { has_break = true }
      })
      self.walk(tw)
      if (!has_break) {
        const statements = body[0].body.slice()
        const exp = body[0].expression
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

  walkInner () {
    const result = []
    result.push(this.expression)
    result.push(...this.body)
    return result
  }

  _children_backwards (push: Function) {
    let i = this.body.length
    while (i--) push(this.body[i])
    push(this.expression)
  }

  _size (): number {
    return 8 + list_overhead(this.body)
  }

  shallow_cmp_props: any = {}
  _transform (tw: TreeTransformer) {
    this.expression = this.expression.transform(tw)
    this.body = do_list(this.body, tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'SwitchStatement',
      discriminant: to_moz(this.expression),
      cases: this.body.map(to_moz)
    }
  }

  _codegen (output: OutputStream) {
    output.print('switch')
    output.space()
    output.with_parens(() => {
      this.expression.print(output)
    })
    output.space()
    const last = this.body.length - 1
    if (last < 0) print_braced_empty(this, output)
    else {
      output.with_block(() => {
        (this.body as any[]).forEach(function (branch, i) {
          output.indent(true)
          branch.print(output)
          if (i < last && branch.body.length > 0) { output.newline() }
        })
      })
    }
  }

  add_source_map (output: OutputStream) { output.add_mapping(this.start) }
  static documentation = 'A `switch` statement'
  static propdoc = {
    expression: '[AST_Node] the `switch` “discriminant”'
  }

  static PROPS = AST_Block.PROPS.concat(['expression'])
  constructor (args: AST_Switch_Props) {
    super(args)
    this.expression = args.expression
  }
}

export interface AST_Switch_Props extends AST_Block_Props {
  expression: any | undefined
}
