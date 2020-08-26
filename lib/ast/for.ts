import AST_Node from './node'
import { OutputStream } from '../output'
import AST_IterationStatement from './iteration-statement'
import Compressor from '../compressor'

import { make_node_from_constant, best_of_expression, extract_declarations_from_unreachable_code, parenthesize_for_noin, reset_block_variables, has_break_or_continue, as_statement_array, push, pop, to_moz, make_node, is_ast_node, is_ast_definitions, is_ast_block_statement, is_ast_break, is_ast_statement, is_ast_if } from '../utils'
import TreeWalker from '../tree-walker'

export default class AST_For extends AST_IterationStatement {
  _in_boolean_context (context) {
    return this.condition === context
  }

  _optimize (compressor: Compressor) {
    if (!compressor.option('loops')) return this
    if (compressor.option('side_effects') && this.init) {
      this.init = this.init.drop_side_effect_free(compressor)
    }
    if (this.condition) {
      let cond = this.condition.evaluate(compressor)
      if (!(is_ast_node(cond))) {
        if (cond) this.condition = null
        else if (!compressor.option('dead_code')) {
          const orig = this.condition
          this.condition = make_node_from_constant(cond, this.condition)
          this.condition = best_of_expression(this.condition.transform(compressor), orig)
        }
      }
      if (compressor.option('dead_code')) {
        if (is_ast_node(cond)) cond = this.condition.tail_node().evaluate(compressor)
        if (!cond) {
          const body: any[] = []
          extract_declarations_from_unreachable_code(compressor, this.body, body)
          if (is_ast_statement(this.init)) {
            body.push(this.init)
          } else if (this.init) {
            body.push(make_node('AST_SimpleStatement', this.init, {
              body: this.init
            }))
          }
          body.push(make_node('AST_SimpleStatement', this.condition, {
            body: this.condition
          }))
          return make_node('AST_BlockStatement', this, { body: body }).optimize(compressor)
        }
      }
    }
    return if_break_in_loop(this, compressor)
  }

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    reset_block_variables(compressor, this)
    if (this.init) this.init.walk(tw)
    const saved_loop = tw.in_loop
    tw.in_loop = this
    push(tw)
    if (this.condition) this.condition.walk(tw)
    this.body.walk(tw)
    if (this.step) {
      if (has_break_or_continue(this)) {
        pop(tw)
        push(tw)
      }
      this.step.walk(tw)
    }
    pop(tw)
    tw.in_loop = saved_loop
    return true
  }

  _walk (visitor: TreeWalker) {
    return visitor._visit(this, function (this) {
      if (this.init) this.init._walk(visitor)
      if (this.condition) this.condition._walk(visitor)
      if (this.step) this.step._walk(visitor)
      this.body._walk(visitor)
    })
  }

  _children_backwards (push: Function) {
    push(this.body)
    if (this.step) push(this.step)
    if (this.condition) push(this.condition)
    if (this.init) push(this.init)
  }

  _size = () => 8
  shallow_cmp_props: any = {
    init: 'exist',
    condition: 'exist',
    step: 'exist'
  }

  _transform (self: AST_For, tw: TreeWalker) {
    if (self.init) self.init = self.init.transform(tw)
    if (self.condition) self.condition = self.condition.transform(tw)
    if (self.step) self.step = self.step.transform(tw)
    self.body = (self.body).transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'ForStatement',
      init: to_moz(this.init),
      test: to_moz(this.condition),
      update: to_moz(this.step),
      body: to_moz(this.body)
    }
  }

  _codegen (self: AST_For, output: OutputStream) {
    output.print('for')
    output.space()
    output.with_parens(function () {
      if (self.init) {
        if (is_ast_definitions(self.init)) {
          self.init.print(output)
        } else {
          parenthesize_for_noin(self.init, output, true)
        }
        output.print(';')
        output.space()
      } else {
        output.print(';')
      }
      if (self.condition) {
        self.condition.print(output)
        output.print(';')
        output.space()
      } else {
        output.print(';')
      }
      if (self.step) {
        self.step.print(output)
      }
    })
    output.space()
    self._do_print_body(output)
  }

  static documentation = 'A `for` statement'
  static propdoc = {
    init: '[AST_Node?] the `for` initialization code, or null if empty',
    condition: '[AST_Node?] the `for` termination clause, or null if empty',
    step: '[AST_Node?] the `for` update clause, or null if empty'
  } as any

  static PROPS = AST_IterationStatement.PROPS.concat(['init', 'condition', 'step'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.init = args.init
    this.condition = args.condition
    this.step = args.step
  }
}

function if_break_in_loop (self: AST_For, compressor: Compressor) {
  const first = is_ast_block_statement(self.body) ? self.body.body[0] : self.body
  if (compressor.option('dead_code') && is_break(first)) {
    const body: any[] = []
    if (is_ast_statement(self.init)) {
      body.push(self.init)
    } else if (self.init) {
      body.push(make_node('AST_SimpleStatement', self.init, {
        body: self.init
      }))
    }
    if (self.condition) {
      body.push(make_node('AST_SimpleStatement', self.condition, {
        body: self.condition
      }))
    }
    extract_declarations_from_unreachable_code(compressor, self.body, body)
    return make_node('AST_BlockStatement', self, {
      body: body
    })
  }
  if (is_ast_if(first)) {
    if (is_break(first.body)) { // TODO: check type
      if (self.condition) {
        self.condition = make_node('AST_Binary', self.condition, {
          left: self.condition,
          operator: '&&',
          right: first.condition.negate(compressor)
        })
      } else {
        self.condition = first.condition.negate(compressor)
      }
      drop_it(first.alternative)
    } else if (is_break(first.alternative)) {
      if (self.condition) {
        self.condition = make_node('AST_Binary', self.condition, {
          left: self.condition,
          operator: '&&',
          right: first.condition
        })
      } else {
        self.condition = first.condition
      }
      drop_it(first.body)
    }
  }
  return self

  function is_break (node: AST_Node) {
    return is_ast_break(node) &&
            compressor.loopcontrol_target(node) === compressor.self()
  }

  function drop_it (rest) {
    rest = as_statement_array(rest)
    if (is_ast_block_statement(self.body)) {
      self.body = self.body.clone()
      self.body.body = rest.concat(self.body.body.slice(1))
      self.body = self.body.transform(compressor)
    } else {
      self.body = make_node('AST_BlockStatement', self.body, {
        body: rest
      }).transform(compressor)
    }
    self = if_break_in_loop(self, compressor)
  }
}
