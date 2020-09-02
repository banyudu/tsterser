import AST_Node from './node'
import { OutputStream } from '../output'
import AST_StatementWithBody, { AST_StatementWithBody_Props } from './statement-with-body'
import Compressor from '../compressor'
import { make_node_from_constant, best_of_expression, make_node, force_statement, make_block, aborts, to_moz, is_empty, push, pop, extract_declarations_from_unreachable_code, is_ast_node, is_ast_if, is_ast_do, is_ast_statement_with_body, is_ast_simple_statement, is_ast_binary, is_ast_empty_statement, is_ast_exit } from '../utils'
import TreeWalker from '../tree-walker'
import { AST_Statement } from '.'
import TreeTransformer from '../tree-transformer'

export default class AST_If extends AST_StatementWithBody {
  condition: AST_Node
  alternative: AST_Statement | undefined

  _in_boolean_context (context) {
    return this.condition === context
  }

  _optimize (compressor: Compressor) {
    let self = this
    if (is_empty(self.alternative)) self.alternative = null

    if (!compressor.option('conditionals')) return self
    // if condition can be statically determined, warn and drop
    // one of the blocks.  note, statically determined implies
    // “has no side effects”; also it doesn't work for cases like
    // `x && true`, though it probably should.
    let cond = self.condition.evaluate(compressor)
    if (!compressor.option('dead_code') && !(is_ast_node(cond))) {
      const orig = self.condition
      self.condition = make_node_from_constant(cond, orig)
      self.condition = best_of_expression(self.condition.transform(compressor), orig)
    }
    if (compressor.option('dead_code')) {
      if (is_ast_node(cond)) cond = self.condition.tail_node().evaluate(compressor)
      if (!cond) {
        compressor.warn('Condition always false [{file}:{line},{col}]', self.condition.start)
        const body: any[] = []
        extract_declarations_from_unreachable_code(compressor, self.body, body)
        body.push(make_node('AST_SimpleStatement', self.condition, {
          body: self.condition
        }))
        if (self.alternative) body.push(self.alternative)
        return make_node('AST_BlockStatement', self, { body: body }).optimize(compressor)
      } else if (!(is_ast_node(cond))) {
        compressor.warn('Condition always true [{file}:{line},{col}]', self.condition.start)
        const body: any[] = []
        body.push(make_node('AST_SimpleStatement', self.condition, {
          body: self.condition
        }))
        body.push(self.body)
        if (self.alternative) {
          extract_declarations_from_unreachable_code(compressor, self.alternative, body)
        }
        return make_node('AST_BlockStatement', self, { body: body }).optimize(compressor)
      }
    }
    const negated = self.condition.negate(compressor)
    const self_condition_length = self.condition.size()
    const negated_length = negated.size()
    let negated_is_best = negated_length < self_condition_length
    if (self.alternative && negated_is_best) {
      negated_is_best = false // because we already do the switch here.
      // no need to swap values of self_condition_length and negated_length
      // here because they are only used in an equality comparison later on.
      self.condition = negated
      const tmp = self.body
      self.body = self.alternative || make_node('AST_EmptyStatement', self)
      self.alternative = tmp
    }
    if (is_empty(self.body) && is_empty(self.alternative)) {
      return make_node('AST_SimpleStatement', self.condition, {
        body: self.condition.clone()
      }).optimize(compressor)
    }
    if (is_ast_simple_statement(self.body) &&
          is_ast_simple_statement(self.alternative)) {
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: self.body.body,
          alternative: self.alternative.body
        })
      }).optimize(compressor)
    }
    if (is_empty(self.alternative) && is_ast_simple_statement(self.body)) {
      if (self_condition_length === negated_length && !negated_is_best &&
              is_ast_binary(self.condition) && self.condition.operator == '||') {
        // although the code length of self.condition and negated are the same,
        // negated does not require additional surrounding parentheses.
        // see https://github.com/mishoo/UglifyJS2/issues/979
        negated_is_best = true
      }
      if (negated_is_best) {
        return make_node('AST_SimpleStatement', self, {
          body: make_node('AST_Binary', self, {
            operator: '||',
            left: negated,
            right: self.body.body
          })
        }).optimize(compressor)
      }
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Binary', self, {
          operator: '&&',
          left: self.condition,
          right: self.body.body
        })
      }).optimize(compressor)
    }
    if (is_ast_empty_statement(self.body) &&
          is_ast_simple_statement(self.alternative)) {
      return make_node('AST_SimpleStatement', self, {
        body: make_node('AST_Binary', self, {
          operator: '||',
          left: self.condition,
          right: self.alternative.body
        })
      }).optimize(compressor)
    }
    if (is_ast_exit(self.body) &&
          is_ast_exit(self.alternative) &&
          self.body.TYPE == self.alternative.TYPE) {
      return make_node(self.body.constructor?.name as any, self, {
        value: make_node('AST_Conditional', self, {
          condition: self.condition,
          consequent: self.body.value || make_node('AST_Undefined', self.body),
          alternative: self.alternative.value || make_node('AST_Undefined', self.alternative)
        }).transform(compressor)
      }).optimize(compressor)
    }
    if (is_ast_if(self.body) &&
          !self.body.alternative &&
          !self.alternative) {
      self = make_node('AST_If', self, {
        condition: make_node('AST_Binary', self.condition, {
          operator: '&&',
          left: self.condition,
          right: self.body.condition
        }),
        body: self.body.body,
        alternative: null
      })
    }
    if (aborts(self.body)) {
      if (self.alternative) {
        const alt = self.alternative
        self.alternative = null
        return make_node('AST_BlockStatement', self, {
          body: [self, alt]
        }).optimize(compressor)
      }
    }
    if (aborts(self.alternative)) {
      const body = self.body
      self.body = self.alternative
      self.condition = negated_is_best ? negated : self.condition.negate(compressor)
      self.alternative = null
      return make_node('AST_BlockStatement', self, {
        body: [self, body]
      }).optimize(compressor)
    }
    return self
  }

  may_throw (compressor: Compressor) {
    return this.condition.may_throw(compressor) ||
          this.body?.may_throw(compressor) ||
          this.alternative?.may_throw(compressor)
  }

  has_side_effects (compressor: Compressor) {
    return this.condition.has_side_effects(compressor) ||
          this.body?.has_side_effects(compressor) ||
          this.alternative?.has_side_effects(compressor)
  }

  aborts () {
    return this.alternative && aborts(this.body) && aborts(this.alternative) && this
  }

  reduce_vars (tw: TreeWalker) {
    this.condition.walk(tw)
    push(tw)
    this.body.walk(tw)
    pop(tw)
    if (this.alternative) {
      push(tw)
      this.alternative.walk(tw)
      pop(tw)
    }
    return true
  }

  walkInner = (visitor: TreeWalker) => {
    this.condition.walk(visitor)
    this.body.walk(visitor)
    if (this.alternative) this.alternative.walk(visitor)
  }

  _children_backwards (push: Function) {
    if (this.alternative) {
      push(this.alternative)
    }
    push(this.body)
    push(this.condition)
  }

  _size = () => 4
  shallow_cmp_props: any = {
    alternative: 'exist'
  }

  _transform (tw: TreeTransformer) {
    this.condition = this.condition.transform(tw)
    this.body = (this.body).transform(tw)
    if (this.alternative) this.alternative = this.alternative.transform(tw)
  }

  _to_mozilla_ast (parent: AST_Node): any {
    return {
      type: 'IfStatement',
      test: to_moz(this.condition),
      consequent: to_moz(this.body),
      alternate: to_moz(this.alternative)
    }
  }

  _codegen (output: OutputStream) {
    output.print('if')
    output.space()
    output.with_parens(() => {
      this.condition.print(output)
    })
    output.space()
    if (this.alternative) {
      make_then(this, output)
      output.space()
      output.print('else')
      output.space()
      if (is_ast_if(this.alternative)) { this.alternative.print(output) } else { force_statement(this.alternative, output) }
    } else {
      this._do_print_body(output)
    }
  }

  static documentation = 'A `if` statement'
  static propdoc = {
    condition: '[AST_Node] the `if` condition',
    alternative: '[AST_Statement?] the `else` part, or null if not present'
  }

  static PROPS = AST_StatementWithBody.PROPS.concat(['condition', 'alternative'])
  constructor (args?: AST_If_Props) {
    super(args)
    this.condition = args.condition
    this.alternative = args.alternative
  }
}

function make_then (self: AST_If, output: OutputStream) {
  let b: any = self.body
  if (output.option('braces') ||
        output.option('ie8') && is_ast_do(b)) { return make_block(b, output) }
  // The squeezer replaces "block"-s that contain only a single
  // statement with the statement itself; technically, the AST
  // is correct, but this can create problems when we output an
  // IF having an ELSE clause where the THEN clause ends in an
  // IF *without* an ELSE block (then the outer ELSE would refer
  // to the inner IF).  This function checks for this case and
  // adds the block braces if needed.
  if (!b) return output.force_semicolon()
  while (true) {
    if (is_ast_if(b)) {
      if (!b.alternative) {
        make_block(self.body, output)
        return
      }
      b = b.alternative
    } else if (is_ast_statement_with_body(b)) {
      b = b.body
    } else break
  }
  force_statement(self.body, output)
}

export interface AST_If_Props extends AST_StatementWithBody_Props {
  condition?: AST_Node | undefined
  alternative?: AST_Statement | undefined | undefined
}
