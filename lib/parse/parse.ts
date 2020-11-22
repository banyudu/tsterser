import { Comment, ParseOptions } from '../types'
import AST_Symbol from '../ast/symbol'
import tokenizer from './tokenizer'

import {
  defaults,
  js_error,
  set_annotation, is_ast_string, is_ast_iteration_statement, is_ast_definitions, is_ast_expansion, is_ast_symbol_method, is_ast_symbol_declaration, is_ast_symbol_ref, is_ast_prop_access, is_ast_object, is_ast_continue, is_ast_destructuring, is_ast_array, is_ast_lambda, is_ast_call, is_ast_symbol_class_property, is_ast_def_class, is_ast_object_property, is_ast_node, is_ast_simple_statement, is_ast_assign, is_ast_arrow, is_ast_unary_prefix
} from '../utils'
import {
  AST_Accessor,
  AST_Array,
  AST_Arrow,
  AST_Assign,
  AST_Await,
  AST_BigInt,
  AST_Binary,
  AST_BlockStatement,
  AST_Break,
  AST_Call,
  AST_Case,
  AST_Catch,
  AST_ClassExpression,
  AST_ClassProperty,
  AST_ConciseMethod,
  AST_Conditional,
  AST_Const,
  AST_Continue,
  AST_Debugger,
  AST_Default,
  AST_DefaultAssign,
  AST_DefClass,
  AST_Defun,
  AST_Destructuring,
  AST_Directive,
  AST_Do,
  AST_Dot,
  AST_EmptyStatement,
  AST_Expansion,
  AST_Export,
  AST_False,
  AST_Finally,
  AST_For,
  AST_ForIn,
  AST_ForOf,
  AST_Function,
  AST_Hole,
  AST_If,
  AST_Import,
  AST_Label,
  AST_LabeledStatement,
  AST_LabelRef,
  AST_Let,
  AST_NameMapping,
  AST_New,
  AST_NewTarget,
  AST_Null,
  AST_Number,
  AST_Object,
  AST_ObjectGetter,
  AST_ObjectKeyVal,
  AST_ObjectSetter,
  AST_PrefixedTemplateString,
  AST_RegExp,
  AST_Return,
  AST_Sequence,
  AST_SimpleStatement,
  AST_String,
  AST_Sub,
  AST_Super,
  AST_Switch,
  AST_SymbolCatch,
  AST_SymbolClass,
  AST_SymbolClassProperty,
  AST_SymbolConst,
  AST_SymbolDefClass,
  AST_SymbolDefun,
  AST_SymbolExport,
  AST_SymbolExportForeign,
  AST_SymbolFunarg,
  AST_SymbolImport,
  AST_SymbolImportForeign,
  AST_SymbolLambda,
  AST_SymbolLet,
  AST_SymbolMethod,
  AST_SymbolRef,
  AST_SymbolVar,
  AST_TemplateSegment,
  AST_TemplateString,
  AST_This,
  AST_Throw,
  AST_Token,
  AST_Toplevel,
  AST_True,
  AST_Try,
  AST_UnaryPostfix,
  AST_UnaryPrefix,
  AST_Var,
  AST_VarDef,
  AST_While,
  AST_With,
  AST_Yield,
  AST_Node,
  AST_Unary
} from '../ast'

import { _INLINE, _NOINLINE, _PURE, PUNC_AFTER_EXPRESSION, RESERVED_WORDS, UNARY_PREFIX, UNARY_POSTFIX, ASSIGNMENT, PRECEDENCE, ATOMIC_START_TOKEN } from '../constants'

/* -----[ Tokenizer ]----- */

function is_token (token: any, type?: string | null, val?: string) {
  return token.type == type && (val == null || token.value == val)
}

/* -----[ Parser ]----- */

function is_in_generator (S: any) {
  return S.in_generator === S.in_function
}

function is_in_async (S: any) {
  return S.in_async === S.in_function
}

function croak (S: any, msg: string, line?: number | null, col?: number | null, pos?: number | null) {
  const ctx = S.input.context()
  js_error(msg,
    ctx.filename,
    line != null ? line : ctx.tokline,
    col != null ? col : ctx.tokcol,
    pos != null ? pos : ctx.tokpos)
}

function token_error (S: any, token: any | null, msg: string) {
  croak(S, msg, token?.line, token?.col)
}

export default function parse ($TEXT: string, opt?: ParseOptions) {
  // maps start tokens to count of comments found outside of their parens
  // Example: /* I count */ ( /* I don't */ foo() )
  // Useful because comments_before property of call with parens outside
  // contains both comments inside and outside these parens. Used to find the
  // right #__PURE__ comments for an expression
  const outer_comments_before_counts = new Map()

  const defaultOptions: ParseOptions = {
    bare_returns: false,
    ecma: 2017,
    expression: false,
    filename: undefined,
    html5_comments: true,
    module: false,
    shebang: true,
    strict: false,
    toplevel: null
  }

  const options: ParseOptions = defaults(opt ?? {}, defaultOptions, true)
  const S = {
    input: (typeof $TEXT === 'string'
      ? tokenizer($TEXT, options.filename,
        options.html5_comments as boolean, options.shebang as boolean)
      : $TEXT),
    token: null as any | null,
    prev: null as any | null,
    peeked: null as any | null,
    in_function: 0,
    in_async: -1,
    in_generator: -1,
    in_directives: true,
    in_loop: 0,
    labels: [] as any[]
  }

  S.token = next()

  function is (type: string, value?: string) {
    return is_token(S.token, type, value)
  }

  function peek () { return S.peeked || (S.peeked = S.input()) }

  function next () {
    S.prev = S.token

    if (!S.peeked) peek()
    S.token = S.peeked
    S.peeked = null
    S.in_directives = S.in_directives && (
            S.token?.type == 'string' || is('punc', ';')
    )
    return S.token
  }

  function prev () {
    return S.prev
  }

  function unexpected (token?: any | null | undefined) {
    if (token == null) { token = S.token }
    token_error(S, token, 'Unexpected token: ' + token?.type + ' (' + token?.value + ')')
  }

  function expect_token (type: string, val: string | undefined) {
    if (is(type, val)) {
      return next()
    }
    token_error(S, S.token, 'Unexpected token ' + S.token?.type + ' «' + S.token?.value + '»' + ', expected ' + type + ' «' + val + '»')
  }

  function expect (punc: string) { return expect_token('punc', punc) }

  function has_newline_before (token: AST_Token) {
    return token.nlb || !token.comments_before.every((comment: Comment) => !comment.nlb)
  }

  function can_insert_semicolon () {
    return !options.strict &&
            (is('eof') || is('punc', '}') || has_newline_before(S.token))
  }

  function semicolon (optional: boolean = false) {
    if (is('punc', ';')) next()
    else if (!optional && !can_insert_semicolon()) unexpected()
  }

  function parenthesised () {
    expect('(')
    const exp = expression(true)
    expect(')')
    return exp
  }

  function embed_tokens (parser: Function) {
    return function (...args: any[]) {
      const start = S.token
      const expr = parser(...args)
      expr.start = start
      expr.end = prev()
      return expr
    }
  }

  function handle_regexp () {
    if (is('operator', '/') || is('operator', '/=')) {
      S.peeked = null
      S.token = S.input(S.token?.value.substr(1)) // force regexp
    }
  }

  const statement = embed_tokens(function (is_export_default: boolean, is_for_body: boolean, is_if_body: boolean) {
    handle_regexp()
    switch (S.token?.type) {
      case 'string': {
        if (S.in_directives) {
          const token = peek()
          if (!S.token?.raw.includes('\\') &&
                    (is_token(token, 'punc', ';') ||
                        is_token(token, 'punc', '}') ||
                        has_newline_before(token) ||
                        is_token(token, 'eof'))) {
            S.input.add_directive(S.token?.value)
          } else {
            S.in_directives = false
          }
        }
        const dir = S.in_directives
        const stat = simple_statement()
        return dir && is_ast_string(stat.body) ? new AST_Directive(stat.body) : stat
      }
      case 'template_head':
      case 'num':
      case 'big_int':
      case 'regexp':
      case 'operator':
      case 'atom':
        return simple_statement()

      case 'name':
        if (S.token?.value == 'async' && is_token(peek(), 'keyword', 'function')) {
          next()
          next()
          if (is_for_body) {
            croak(S, 'functions are not allowed as the body of a loop')
          }
          return function_(AST_Defun, false, true, is_export_default)
        }
        if (S.token?.value == 'import' && !is_token(peek(), 'punc', '(')) {
          next()
          const node = import_()
          semicolon()
          return node
        }
        return is_token(peek(), 'punc', ':')
          ? labeled_statement()
          : simple_statement()

      case 'punc': {
        switch (S.token?.value) {
          case '{':
            return new AST_BlockStatement({
              start: S.token,
              body: block_(),
              end: prev()
            })
          case '[':
          case '(':
            return simple_statement()
          case ';':
            S.in_directives = false
            next()
            return new AST_EmptyStatement({})
          default:
            unexpected()
        }
      }
      case 'keyword': {
        switch (S.token?.value) {
          case 'break':
            next()
            return break_cont(AST_Break)

          case 'continue':
            next()
            return break_cont(AST_Continue)

          case 'debugger':
            next()
            semicolon()
            return new AST_Debugger({})

          case 'do': {
            next()
            const body = in_loop(statement)
            expect_token('keyword', 'while')
            const condition = parenthesised()
            semicolon(true)
            return new AST_Do({
              body: body,
              condition: condition
            })
          }
          case 'while':
            next()
            return new AST_While({
              condition: parenthesised(),
              body: in_loop(function () { return statement(false, true) })
            })

          case 'for':
            next()
            return for_()

          case 'class':
            next()
            if (is_for_body) {
              croak(S, 'classes are not allowed as the body of a loop')
            }
            if (is_if_body) {
              croak(S, 'classes are not allowed as the body of an if')
            }
            return class_(AST_DefClass)

          case 'function':
            next()
            if (is_for_body) {
              croak(S, 'functions are not allowed as the body of a loop')
            }
            return function_(AST_Defun, false, false, is_export_default)

          case 'if':
            next()
            return if_()

          case 'return': {
            if (S.in_function == 0 && !options.bare_returns) { croak(S, "'return' outside of function") }
            next()
            let value = null
            if (is('punc', ';')) {
              next()
            } else if (!can_insert_semicolon()) {
              value = expression(true)
              semicolon()
            }
            return new AST_Return({
              value: value
            })
          }
          case 'switch':
            next()
            return new AST_Switch({
              expression: parenthesised(),
              body: in_loop(switch_body_)
            })

          case 'throw': {
            next()
            if (has_newline_before(S.token)) { croak(S, "Illegal newline after 'throw'") }
            const value = expression(true)
            semicolon()
            return new AST_Throw({
              value: value
            })
          }
          case 'try':
            next()
            return try_()

          case 'var': {
            next()
            const node = var_()
            semicolon()
            return node
          }

          case 'let': {
            next()
            const node = let_()
            semicolon()
            return node
          }

          case 'const': {
            next()
            const node = const_()
            semicolon()
            return node
          }

          case 'with':
            if (S.input.has_directive('use strict')) {
              croak(S, 'Strict mode may not include a with statement')
            }
            next()
            return new AST_With({
              expression: parenthesised(),
              body: statement()
            })

          case 'export': {
            if (!is_token(peek(), 'punc', '(')) {
              next()
              const node = export_()
              if (is('punc', ';')) semicolon()
              return node
            }
          }
        }
      }
    }
    unexpected()
    return undefined
  })

  function labeled_statement () {
    const label = as_symbol(AST_Label)
    if (label.name === 'await' && is_in_async(S)) {
      token_error(S, S.prev, 'await cannot be used as label inside async function')
    }
    if (S.labels.some((l) => l.name === label.name)) {
      // ECMA-262, 12.12: An ECMAScript program is considered
      // syntactically incorrect if it contains a
      // LabelledStatement that is enclosed by a
      // LabelledStatement with the same Identifier as label.
      croak(S, 'Label ' + label.name + ' defined twice')
    }
    expect(':')
    S.labels.push(label)
    const stat = statement()
    S.labels.pop()
    if (!(is_ast_iteration_statement(stat))) {
      // check for `continue` that refers to this label.
      // those should be reported as syntax errors.
      // https://github.com/mishoo/UglifyJS2/issues/287
      (label as any).references.forEach(function (ref: any) {
        if (is_ast_continue(ref)) {
          ref = ref.label?.start
          croak(S, 'Continue label `' + label.name + '` refers to non-IterationStatement.',
            ref.line, ref.col, ref.pos)
        }
      })
    }
    return new AST_LabeledStatement({ body: stat, label: label })
  }

  function simple_statement (tmp?: any) {
    tmp = expression(true)
    semicolon()
    return new AST_SimpleStatement({ body: tmp })
  }

  function break_cont (type: typeof AST_Break | typeof AST_Continue) {
    let label: any = null; let ldef
    if (!can_insert_semicolon()) {
      label = as_symbol(AST_LabelRef, true)
    }
    if (label != null) {
      ldef = S.labels.find((l) => l.name === label.name)
      if (!ldef) { croak(S, 'Undefined label ' + label.name) }
      label.thedef = ldef
    } else if (S.in_loop == 0) { croak(S, type.TYPE + ' not inside a loop or switch') }
    semicolon()
    const stat = new type({ label: label })
    if (ldef) ldef.references.push(stat)
    return stat
  }

  function for_ () {
    const for_await_error = '`for await` invalid in this context'
    let await_tok: any | false | null = S.token
    if (await_tok?.type == 'name' && await_tok.value == 'await') {
      if (!is_in_async(S)) {
        token_error(S, await_tok, for_await_error)
      }
      next()
    } else {
      await_tok = false
    }
    expect('(')
    let init: any = null
    if (!is('punc', ';')) {
      init =
                is('keyword', 'var') ? (next(), var_(true))
                  : is('keyword', 'let') ? (next(), let_(true))
                    : is('keyword', 'const') ? (next(), const_(true))
                      : expression(true, true)
      const is_in = is('operator', 'in')
      const is_of = is('name', 'of')
      if (await_tok && !is_of) {
        token_error(S, await_tok, for_await_error)
      }
      if (is_in || is_of) {
        if (is_ast_definitions(init)) {
          if (init.definitions.length > 1) { token_error(S, init.start, 'Only one variable declaration allowed in for..in loop') }
        } else if (!(is_assignable(init) || is_ast_destructuring((init = to_destructuring(init))))) {
          token_error(S, init.start, 'Invalid left-hand side in for..in loop')
        }
        next()
        if (is_in) {
          return for_in(init)
        } else {
          return for_of(init, !!await_tok)
        }
      }
    } else if (await_tok) {
      token_error(S, await_tok, for_await_error)
    }
    return regular_for(init)
  }

  function regular_for (init: any) {
    expect(';')
    const test = is('punc', ';') ? null : expression(true)
    expect(';')
    const step = is('punc', ')') ? null : expression(true)
    expect(')')
    return new AST_For({
      init: init,
      condition: test,
      step: step,
      body: in_loop(function () { return statement(false, true) })
    })
  }

  function for_of (init: any, is_await: boolean) {
    const lhs = is_ast_definitions(init) ? init.definitions[0].name : null
    const obj = expression(true)
    expect(')')
    return new AST_ForOf({
      await: is_await,
      init: init,
      name: lhs,
      object: obj,
      body: in_loop(function () { return statement(false, true) })
    })
  }

  function for_in (init: AST_Node) {
    const obj = expression(true)
    expect(')')
    return new AST_ForIn({
      init: init,
      object: obj,
      body: in_loop(function () { return statement(false, true) })
    })
  }

  const arrow_function = function (start: AST_Token, argnames: any, is_async: boolean) {
    if (has_newline_before(S.token)) {
      croak(S, 'Unexpected newline before arrow (=>)')
    }

    expect_token('arrow', '=>')

    const body: any = _function_body(is('punc', '{'), false, is_async)

    const end =
            body instanceof Array && body.length ? body[body.length - 1].end
              : body instanceof Array ? start
                : body.end

    return new AST_Arrow({
      start: start,
      end: end,
      async: is_async,
      argnames: argnames,
      body: body
    })
  }

  const function_ = function (CTOR: typeof AST_Defun | typeof AST_Function, is_generator_property: boolean, is_async: boolean, is_export_default: boolean = false) {
    const in_statement = CTOR === AST_Defun
    const is_generator = is('operator', '*')
    if (is_generator) {
      next()
    }

    const name = is('name') ? as_symbol(in_statement ? AST_SymbolDefun : AST_SymbolLambda) : null
    if (in_statement && !name) {
      if (is_export_default) {
        CTOR = AST_Function
      } else {
        unexpected()
      }
    }

    if (name && CTOR !== AST_Accessor && !(is_ast_symbol_declaration(name))) { unexpected(prev()) }

    const args: any = []
    const body: any = _function_body(true, is_generator || is_generator_property, is_async, name, args)
    return new CTOR({
      start: args.start,
      end: body.end,
      is_generator: is_generator,
      async: is_async,
      name: name,
      argnames: args,
      body: body
    })
  }

  function track_used_binding_identifiers (is_parameter: boolean, strict: boolean) {
    const parameters = new Set()
    let duplicate: any = false
    let default_assignment: false | AST_Token = false
    let spread: false | AST_Token = false
    let strict_mode = !!strict
    const tracker = {
      add_parameter: function (token: AST_Token) {
        if (parameters.has(token.value)) {
          if (duplicate === false) {
            duplicate = token
          }
          tracker.check_strict()
        } else {
          parameters.add(token.value)
          if (is_parameter) {
            switch (token.value) {
              case 'arguments':
              case 'eval':
              case 'yield':
                if (strict_mode) {
                  token_error(S, token, 'Unexpected ' + token.value + ' identifier as parameter inside strict mode')
                }
                break
              default:
                if (token.value && RESERVED_WORDS.has(token.value)) {
                  unexpected()
                }
            }
          }
        }
      },
      mark_default_assignment: function (token: AST_Token) {
        if (!default_assignment) {
          default_assignment = token
        }
      },
      mark_spread: function (token: AST_Token) {
        if (!spread) {
          spread = token
        }
      },
      mark_strict_mode: function () {
        strict_mode = true
      },
      is_strict: function () {
        return default_assignment || spread || strict_mode
      },
      check_strict: function () {
        if (tracker.is_strict() && duplicate !== false) {
          token_error(S, duplicate, 'Parameter ' + duplicate.value + ' was used already')
        }
      }
    }

    return tracker
  }

  function parameters (params: any[]) {
    const used_parameters = track_used_binding_identifiers(true, S.input.has_directive('use strict'))

    expect('(')

    while (!is('punc', ')')) {
      const param = parameter(used_parameters)
      params.push(param)

      if (!is('punc', ')')) {
        expect(',')
        if (is('punc', ')') && (options.ecma as number) < 2017) unexpected()
      }

      if (is_ast_expansion(param)) {
        break
      }
    }

    next()
  }

  function parameter (used_parameters: any, symbol_type?: any) {
    let param
    let expand: any | null | false = false
    if (used_parameters === undefined) {
      used_parameters = track_used_binding_identifiers(true, S.input.has_directive('use strict'))
    }
    if (is('expand', '...')) {
      expand = S.token
      used_parameters.mark_spread(S.token)
      next()
    }
    param = binding_element(used_parameters, symbol_type)

    if (is('operator', '=') && expand === false) {
      used_parameters.mark_default_assignment(S.token)
      next()
      param = new AST_DefaultAssign({
        start: param.start,
        left: param,
        operator: '=',
        right: expression(false),
        end: S.token
      })
    }

    if (expand !== false) {
      if (!is('punc', ')')) {
        unexpected()
      }
      param = new AST_Expansion({
        start: expand,
        expression: param,
        end: expand
      })
    }
    used_parameters.check_strict()

    return param
  }

  function binding_element (used_parameters: any, symbol_type: any): AST_Symbol | AST_Destructuring {
    const elements: any[] = []
    let first = true
    let is_expand = false
    let expand_token
    const first_token = S.token
    if (used_parameters === undefined) {
      used_parameters = track_used_binding_identifiers(false, S.input.has_directive('use strict'))
    }
    symbol_type = symbol_type === undefined ? AST_SymbolFunarg : symbol_type
    if (is('punc', '[')) {
      next()
      while (!is('punc', ']')) {
        if (first) {
          first = false
        } else {
          expect(',')
        }

        if (is('expand', '...')) {
          is_expand = true
          expand_token = S.token
          used_parameters.mark_spread(S.token)
          next()
        }
        if (is('punc')) {
          switch (S.token?.value) {
            case ',':
              elements.push(new AST_Hole({
                start: S.token,
                end: S.token
              }))
              continue
            case ']': // Trailing comma after last element
              break
            case '[':
            case '{':
              elements.push(binding_element(used_parameters, symbol_type))
              break
            default:
              unexpected()
          }
        } else if (is('name')) {
          used_parameters.add_parameter(S.token)
          elements.push(as_symbol(symbol_type))
        } else {
          croak(S, 'Invalid function parameter')
        }
        if (is('operator', '=') && !is_expand) {
          used_parameters.mark_default_assignment(S.token)
          next()
          elements[elements.length - 1] = new AST_DefaultAssign({
            start: elements[elements.length - 1].start,
            left: elements[elements.length - 1],
            operator: '=',
            right: expression(false),
            end: S.token
          })
        }
        if (is_expand) {
          if (!is('punc', ']')) {
            croak(S, 'Rest element must be last element')
          }
          elements[elements.length - 1] = new AST_Expansion({
            start: expand_token,
            expression: elements[elements.length - 1],
            end: expand_token
          })
        }
      }
      expect(']')
      used_parameters.check_strict()
      return new AST_Destructuring({
        start: first_token,
        names: elements,
        is_array: true,
        end: prev()
      })
    } else if (is('punc', '{')) {
      next()
      while (!is('punc', '}')) {
        if (first) {
          first = false
        } else {
          expect(',')
        }
        if (is('expand', '...')) {
          is_expand = true
          expand_token = S.token
          used_parameters.mark_spread(S.token)
          next()
        }
        if (is('name') && (is_token(peek(), 'punc') || is_token(peek(), 'operator')) && [',', '}', '='].includes(peek().value)) {
          used_parameters.add_parameter(S.token)
          const start = prev()
          const value = as_symbol(symbol_type)
          if (is_expand) {
            elements.push(new AST_Expansion({
              start: expand_token,
              expression: value,
              end: value.end
            }))
          } else {
            elements.push(new AST_ObjectKeyVal({
              start: start,
              key: value.name as any,
              value: value,
              end: value.end
            }))
          }
        } else if (is('punc', '}')) {
          continue // Allow trailing hole
        } else {
          const property_token = S.token
          const property = as_property_name()
          if (property === null) {
            unexpected(prev())
          } else if (prev()?.type === 'name' && !is('punc', ':')) {
            elements.push(new AST_ObjectKeyVal({
              start: prev(),
              key: property,
              value: new symbol_type({
                start: prev(),
                name: property,
                end: prev()
              }),
              end: prev()
            }))
          } else {
            expect(':')
            elements.push(new AST_ObjectKeyVal({
              start: property_token,
              quote: property_token?.quote,
              key: property,
              value: binding_element(used_parameters, symbol_type),
              end: prev()
            }))
          }
        }
        if (is_expand) {
          if (!is('punc', '}')) {
            croak(S, 'Rest element must be last element')
          }
        } else if (is('operator', '=')) {
          used_parameters.mark_default_assignment(S.token)
          next()
          elements[elements.length - 1].value = new AST_DefaultAssign({
            start: elements[elements.length - 1].value.start,
            left: elements[elements.length - 1].value,
            operator: '=',
            right: expression(false),
            end: S.token
          })
        }
      }
      expect('}')
      used_parameters.check_strict()
      return new AST_Destructuring({
        start: first_token,
        names: elements,
        is_array: false,
        end: prev()
      })
    } else if (is('name')) {
      used_parameters.add_parameter(S.token)
      return as_symbol(symbol_type)
    } else {
      croak(S, 'Invalid function parameter')
    }
    return undefined as any
  }

  function params_or_seq_ (allow_arrows: boolean, maybe_sequence: boolean) {
    let spread_token
    let invalid_sequence
    let trailing_comma
    const a: any[] = []
    expect('(')
    while (!is('punc', ')')) {
      if (spread_token) unexpected(spread_token)
      if (is('expand', '...')) {
        spread_token = S.token
        if (maybe_sequence) invalid_sequence = S.token
        next()
        a.push(new AST_Expansion({
          start: prev(),
          expression: expression(),
          end: S.token
        }))
      } else {
        a.push(expression())
      }
      if (!is('punc', ')')) {
        expect(',')
        if (is('punc', ')')) {
          if ((options.ecma as number) < 2017) unexpected()
          trailing_comma = prev()
          if (maybe_sequence) invalid_sequence = trailing_comma
        }
      }
    }
    expect(')')
    if (allow_arrows && is('arrow', '=>')) {
      if (spread_token && trailing_comma) unexpected(trailing_comma)
    } else if (invalid_sequence) {
      unexpected(invalid_sequence)
    }
    return a
  }

  function _function_body (block: boolean, generator: boolean, is_async: boolean, name?: AST_Symbol | null, args?: AST_Symbol[]) {
    const loop = S.in_loop
    const labels = S.labels
    const current_generator = S.in_generator
    const current_async = S.in_async
    ++S.in_function
    if (generator) { S.in_generator = S.in_function }
    if (is_async) { S.in_async = S.in_function }
    if (args) parameters(args)
    if (block) { S.in_directives = true }
    S.in_loop = 0
    S.labels = []
    let a
    if (block) {
      S.input.push_directives_stack()
      a = block_()
      if (name) _verify_symbol(name)
      if (args) args.forEach(_verify_symbol)
      S.input.pop_directives_stack()
    } else {
      a = [new AST_Return({
        start: S.token,
        value: expression(false),
        end: S.token
      })]
    }
    --S.in_function
    S.in_loop = loop
    S.labels = labels
    S.in_generator = current_generator
    S.in_async = current_async
    return a
  }

  function _await_expression (): AST_Node | never {
    // Previous token must be "await" and not be interpreted as an identifier
    if (!is_in_async(S)) {
      croak(S, 'Unexpected await expression outside async function',
                S.prev?.line, S.prev?.col, S.prev?.pos)
    }
    // the await expression is parsed as a unary expression in Babel
    return new AST_Await({
      start: prev(),
      end: S.token,
      expression: maybe_unary(true)
    })
  }

  function _yield_expression () {
    // Previous token must be keyword yield and not be interpret as an identifier
    if (!is_in_generator(S)) {
      croak(S, 'Unexpected yield expression outside generator function',
                S.prev?.line, S.prev?.col, S.prev?.pos)
    }
    const start = S.token
    let star = false
    let has_expression = true

    // Attempt to get expression or star (and then the mandatory expression)
    // behind yield on the same line.
    //
    // If nothing follows on the same line of the yieldExpression,
    // it should default to the value `undefined` for yield to return.
    // In that case, the `undefined` stored as `null` in ast.
    //
    // Note 1: It isn't allowed for yield* to close without an expression
    // Note 2: If there is a nlb between yield and star, it is interpret as
    //         yield <explicit undefined> <inserted automatic semicolon> *
    if (can_insert_semicolon() ||
            (is('punc') && PUNC_AFTER_EXPRESSION.has(S.token?.value as string))) {
      has_expression = false
    } else if (is('operator', '*')) {
      star = true
      next()
    }

    return new AST_Yield({
      start: start,
      is_star: star,
      expression: has_expression ? expression() : null,
      end: prev()
    })
  }

  function if_ () {
    const cond = parenthesised(); const body = statement(false, false, true); let belse = null
    if (is('keyword', 'else')) {
      next()
      belse = statement(false, false, true)
    }
    return new AST_If({
      condition: cond,
      body: body,
      alternative: belse
    })
  }

  function block_ () {
    expect('{')
    const a: any[] = []
    while (!is('punc', '}')) {
      if (is('eof')) unexpected()
      a.push(statement())
    }
    next()
    return a
  }

  function switch_body_ () {
    expect('{')
    const a: any[] = []; let cur: any = null; let branch: any = null; let tmp
    while (!is('punc', '}')) {
      if (is('eof')) unexpected()
      if (is('keyword', 'case')) {
        if (branch) branch.end = prev()
        cur = []
        branch = new AST_Case({
          start: (tmp = S.token, next(), tmp),
          expression: expression(true),
          body: cur
        })
        a.push(branch)
        expect(':')
      } else if (is('keyword', 'default')) {
        if (branch) branch.end = prev()
        cur = []
        branch = new AST_Default({
          start: (tmp = S.token, next(), expect(':'), tmp),
          body: cur
        })
        a.push(branch)
      } else {
        if (!cur) unexpected()
        cur.push(statement())
      }
    }
    if (branch) branch.end = prev()
    next()
    return a
  }

  function try_ () {
    const body = block_(); let bcatch: any = null; let bfinally: any = null
    if (is('keyword', 'catch')) {
      const start = S.token
      next()
      let name
      if (is('punc', '{')) {
        name = null
      } else {
        expect('(')
        name = parameter(undefined, AST_SymbolCatch)
        expect(')')
      }
      bcatch = new AST_Catch({
        start: start,
        argname: name,
        body: block_(),
        end: prev()
      } as any)
    }
    if (is('keyword', 'finally')) {
      const start = S.token
      next()
      bfinally = new AST_Finally({
        start: start,
        body: block_(),
        end: prev()
      })
    }
    if (!bcatch && !bfinally) { croak(S, 'Missing catch/finally blocks') }
    return new AST_Try({
      body: body,
      bcatch: bcatch,
      bfinally: bfinally
    })
  }

  function vardefs (no_in: boolean, kind: string) {
    const a: any[] = []
    let def
    for (;;) {
      const sym_type =
                kind === 'var' ? AST_SymbolVar
                  : kind === 'const' ? AST_SymbolConst
                    : kind === 'let' ? AST_SymbolLet : null
      if (is('punc', '{') || is('punc', '[')) {
        def = new AST_VarDef({
          start: S.token,
          name: binding_element(undefined, sym_type),
          value: is('operator', '=') ? (expect_token('operator', '='), expression(false, no_in)) : null,
          end: prev()
        })
      } else if (sym_type) {
        def = new AST_VarDef({
          start: S.token,
          name: as_symbol(sym_type),
          value: is('operator', '=')
            ? (next(), expression(false, no_in))
            : !no_in && kind === 'const'
              ? croak(S, 'Missing initializer in const declaration') : null,
          end: prev()
        })
        if (def.name.name == 'import') croak(S, 'Unexpected token: import')
      }
      a.push(def)
      if (!is('punc', ',')) { break }
      next()
    }
    return a
  }

  const var_ = function (no_in: boolean = false) {
    return new AST_Var({
      start: prev(),
      definitions: vardefs(no_in, 'var'),
      end: prev()
    })
  }

  const let_ = function (no_in: boolean = false) {
    return new AST_Let({
      start: prev(),
      definitions: vardefs(no_in, 'let'),
      end: prev()
    })
  }

  const const_ = function (no_in: boolean = false) {
    return new AST_Const({
      start: prev(),
      definitions: vardefs(no_in, 'const'),
      end: prev()
    })
  }

  const new_ = function (allow_calls: boolean) {
    const start = S.token
    expect_token('operator', 'new')
    if (is('punc', '.')) {
      next()
      expect_token('name', 'target')
      return subscripts(new AST_NewTarget({
        start: start,
        end: prev()
      }), allow_calls)
    }
    const newexp = expr_atom(false)
    let args
    if (is('punc', '(')) {
      next()
      args = expr_list(')', (options.ecma as number) >= 2017)
    } else {
      args = []
    }
    const call = new AST_New({
      start: start,
      expression: newexp,
      args: args,
      end: prev()
    })
    annotate(call)
    return subscripts(call, allow_calls)
  }

  function as_atom_node () {
    const tok = S.token
    let ret
    switch (tok?.type) {
      case 'name':
        ret = _make_symbol(AST_SymbolRef)
        break
      case 'num':
        ret = new AST_Number({ start: tok, end: tok, value: tok.value })
        break
      case 'big_int':
        ret = new AST_BigInt({ start: tok, end: tok, value: tok.value })
        break
      case 'string':
        ret = new AST_String({
          start: tok,
          end: tok,
          value: tok.value,
          quote: tok.quote
        })
        break
      case 'regexp':
        ret = new AST_RegExp({ start: tok, end: tok, value: tok.value })
        break
      case 'atom':
        switch (tok.value) {
          case 'false':
            ret = new AST_False({ start: tok, end: tok })
            break
          case 'true':
            ret = new AST_True({ start: tok, end: tok })
            break
          case 'null':
            ret = new AST_Null({ start: tok, end: tok })
            break
        }
        break
    }
    next()
    return ret
  }

  function to_fun_args (ex: AST_Node) {
    return ex.to_fun_args(croak)
  }

  const expr_atom = function (allow_calls: boolean, allow_arrows: boolean = false): AST_Node {
    if (is('operator', 'new')) {
      return new_(allow_calls)
    }
    const start = S.token
    let peeked
    const async = is('name', 'async') &&
            (peeked = peek()).value != '[' &&
            peeked.type != 'arrow' &&
            as_atom_node()
    if (is('punc')) {
      switch (S.token?.value) {
        case '(': {
          if (async && !allow_calls) break
          const exprs = params_or_seq_(allow_arrows, !async)
          if (allow_arrows && is('arrow', '=>')) {
            return arrow_function(start, exprs.map(to_fun_args), !!async)
          }
          const ex = async ? new AST_Call({
            expression: async,
            args: exprs
          }) : exprs.length == 1 ? exprs[0] : new AST_Sequence({
            expressions: exprs
          })
          if (ex.start) {
            const startToken = start
            const outer_comments_before = startToken.comments_before.length
            outer_comments_before_counts.set(start, outer_comments_before)
            ex.start.comments_before.unshift(...startToken.comments_before)
            startToken.comments_before = ex.start.comments_before
            if (outer_comments_before == 0 && startToken.comments_before.length > 0) {
              const comment = startToken.comments_before[0]
              if (!comment.nlb) {
                comment.nlb = startToken.nlb
                startToken.nlb = false
              }
            }
            startToken.comments_after = ex.start.comments_after
          }
          ex.start = start
          const end: any = prev()
          if (ex.end) {
            end.comments_before = ex.end.comments_before
            ex.end.comments_after.push(...end.comments_after)
            end.comments_after = ex.end.comments_after
          }
          ex.end = end
          if (is_ast_call(ex)) annotate(ex)
          return subscripts(ex, allow_calls)
        }
        case '[':
          return subscripts(array_(), allow_calls)
        case '{':
          return subscripts(object_or_destructuring_(), allow_calls)
      }
      if (!async) unexpected()
    }
    if (allow_arrows && is('name') && is_token(peek(), 'arrow')) {
      const param = new AST_SymbolFunarg({
        name: S.token?.value,
        start: start,
        end: start
      })
      next()
      return arrow_function(start, [param], !!async)
    }
    if (is('keyword', 'function')) {
      next()
      const func = function_(AST_Function, false, !!async)
      func.start = start
      func.end = prev()
      return subscripts(func, allow_calls)
    }
    if (async) return subscripts(async, allow_calls)
    if (is('keyword', 'class')) {
      next()
      const cls = class_(AST_ClassExpression)
      cls.start = start
      cls.end = prev()
      return subscripts(cls, allow_calls)
    }
    if (is('template_head')) {
      return subscripts(template_string(false), allow_calls)
    }
    if (ATOMIC_START_TOKEN.has(S.token?.type as string)) {
      return subscripts(as_atom_node() as any, allow_calls)
    }
    unexpected()
    return undefined as any
  }

  function template_string (_arg: any) {
    if (_arg) {
      // do nothing
    }
    const segments: any[] = []; const start = S.token

    segments.push(new AST_TemplateSegment({
      start: S.token,
      raw: S.token?.raw,
      value: S.token?.value,
      end: S.token
    }))
    while (!S.token?.end) {
      next()
      handle_regexp()
      segments.push(expression(true))

      if (!is_token('template_substitution')) {
        unexpected()
      }

      segments.push(new AST_TemplateSegment({
        start: S.token,
        raw: S.token?.raw,
        value: S.token?.value,
        end: S.token
      }))
    }
    next()

    return new AST_TemplateString({
      start: start,
      segments: segments,
      end: S.token
    })
  }

  function expr_list (closing: string, allow_trailing_comma: boolean, allow_empty: boolean = false) {
    let first = true; const a: any[] = []
    while (!is('punc', closing)) {
      if (first) first = false; else expect(',')
      if (allow_trailing_comma && is('punc', closing)) break
      if (is('punc', ',') && allow_empty) {
        a.push(new AST_Hole({ start: S.token, end: S.token }))
      } else if (is('expand', '...')) {
        next()
        a.push(new AST_Expansion({ start: prev(), expression: expression(), end: S.token }))
      } else {
        a.push(expression(false))
      }
    }
    next()
    return a
  }

  const array_ = embed_tokens(function () {
    expect('[')
    return new AST_Array({
      elements: expr_list(']', !options.strict, true)
    })
  })

  const create_accessor = embed_tokens((is_generator: boolean, is_async: boolean) => {
    return function_(AST_Accessor, is_generator, is_async)
  })

  const object_or_destructuring_ = embed_tokens(function object_or_destructuring_ () {
    let start = S.token; let first = true; const a: any[] = []
    expect('{')
    while (!is('punc', '}')) {
      if (first) first = false; else expect(',')
      if (!options.strict && is('punc', '}')) {
        // allow trailing comma
        break
      }

      start = S.token
      if (start?.type == 'expand') {
        next()
        a.push(new AST_Expansion({
          start: start,
          expression: expression(false),
          end: prev()
        }))
        continue
      }

      const name = as_property_name()
      let value

      // Check property and fetch value
      if (!is('punc', ':')) {
        const concise = concise_method_or_getset(name, start)
        if (concise) {
          a.push(concise)
          continue
        }

        value = new AST_SymbolRef({
          start: prev(),
          name: name,
          end: prev()
        })
      } else if (name === null) {
        unexpected(prev())
      } else {
        next() // `:` - see first condition
        value = expression(false)
      }

      // Check for default value and alter value accordingly if necessary
      if (is('operator', '=')) {
        next()
        value = new AST_Assign({
          start: start,
          left: value,
          operator: '=',
          right: expression(false),
          end: prev()
        })
      }

      // Create property
      a.push(new AST_ObjectKeyVal({
        start: start,
        quote: start?.quote,
        key: (is_ast_node(name) ? name : '' + name) as any,
        value: value,
        end: prev()
      }))
    }
    next()
    return new AST_Object({ properties: a })
  })

  function class_ (KindOfClass: typeof AST_DefClass) {
    let start; let method; let class_name; let extends_; const a: any[] = []

    S.input.push_directives_stack() // Push directive stack, but not scope stack
    S.input.add_directive('use strict')

    if (S.token?.type == 'name' && S.token?.value != 'extends') {
      class_name = as_symbol(KindOfClass === AST_DefClass ? AST_SymbolDefClass : AST_SymbolClass)
    }

    if (KindOfClass === AST_DefClass && !class_name) {
      unexpected()
    }

    if (S.token?.value == 'extends') {
      next()
      extends_ = expression(true)
    }

    expect('{')

    while (is('punc', ';')) { next() } // Leading semicolons are okay in class bodies.
    while (!is('punc', '}')) {
      start = S.token
      method = concise_method_or_getset(as_property_name(), start, true)
      if (!method) { unexpected() }
      a.push(method)
      while (is('punc', ';')) { next() }
    }

    S.input.pop_directives_stack()

    next()

    return new KindOfClass({
      start: start,
      name: class_name,
      extends: extends_,
      properties: a,
      end: prev()
    } as any)
  }

  function concise_method_or_getset (name: any, start: AST_Token, is_class: boolean = false) {
    const get_method_name_ast = function (name: any, start: AST_Token) {
      if (typeof name === 'string' || typeof name === 'number') {
        return new AST_SymbolMethod({
          start,
          name: '' + name,
          end: prev()
        })
      } else if (name === null) {
        unexpected()
      }
      return name
    }
    const get_class_property_key_ast = (name: any, _arg?: any): AST_Node => {
      if (_arg) {
        // do nothing
      }
      if (typeof name === 'string' || typeof name === 'number') {
        return new AST_SymbolClassProperty({
          start: property_token,
          end: property_token,
          name: '' + name
        })
      } else if (name === null) {
        unexpected()
      }
      return name
    }
    let is_async = false
    let is_static = false
    let is_generator = false
    let property_token = start
    if (is_class && name === 'static' && !is('punc', '(')) {
      is_static = true
      property_token = S.token
      name = as_property_name()
    }
    if (name === 'async' && !is('punc', '(') && !is('punc', ',') && !is('punc', '}') && !is('operator', '=')) {
      is_async = true
      property_token = S.token
      name = as_property_name()
    }
    if (name === null) {
      is_generator = true
      property_token = S.token
      name = as_property_name()
      if (name === null) {
        unexpected()
      }
    }
    if (is('punc', '(')) {
      name = get_method_name_ast(name, start)
      const node = new AST_ConciseMethod({
        start: start,
        static: is_static,
        is_generator: is_generator,
        async: is_async,
        key: name,
        quote: is_ast_symbol_method(name)
          ? property_token.quote : undefined,
        value: create_accessor(is_generator, is_async),
        end: prev()
      })
      return node
    }
    const setter_token = S.token
    if (name == 'get') {
      if (!is('punc') || is('punc', '[')) {
        name = get_method_name_ast(as_property_name(), start)
        return new AST_ObjectGetter({
          start: start,
          static: is_static,
          key: name,
          quote: is_ast_symbol_method(name)
            ? setter_token?.quote : undefined,
          value: create_accessor(),
          end: prev()
        })
      }
    } else if (name == 'set') {
      if (!is('punc') || is('punc', '[')) {
        name = get_method_name_ast(as_property_name(), start)
        return new AST_ObjectSetter({
          start: start,
          static: is_static,
          key: name,
          quote: is_ast_symbol_method(name)
            ? setter_token?.quote : undefined,
          value: create_accessor(),
          end: prev()
        })
      }
    }
    if (is_class) {
      const key = get_class_property_key_ast(name, property_token)
      const quote = is_ast_symbol_class_property(key)
        ? property_token.quote
        : undefined
      if (is('operator', '=')) {
        next()
        return new AST_ClassProperty({
          start,
          static: is_static,
          quote,
          key,
          value: expression(false),
          end: prev()
        })
      } else if (is('name') || is('punc', ';') || is('punc', '}')) {
        return new AST_ClassProperty({
          start,
          static: is_static,
          quote,
          key,
          end: prev()
        } as any)
      }
    }
    return undefined
  }

  function import_ () {
    const start = prev()
    let imported_name
    if (is('name')) {
      imported_name = as_symbol(AST_SymbolImport)
    }

    if (is('punc', ',')) {
      next()
    }

    const imported_names = map_names1(true)

    if (imported_names || imported_name) {
      expect_token('name', 'from')
    }
    const mod_str: any = S.token
    if (mod_str.type !== 'string') {
      unexpected()
    }
    next()
    return new AST_Import({
      start: start,
      imported_name: imported_name,
      imported_names: imported_names,
      module_name: new AST_String({
        start: mod_str,
        value: mod_str.value,
        quote: mod_str.quote,
        end: mod_str
      }),
      end: S.token
    } as any)
  }

  function map_name (is_import: boolean) {
    function make_symbol (type: typeof AST_Symbol) {
      return new type({
        name: as_property_name(),
        start: prev(),
        end: prev()
      })
    }

    const foreign_type = is_import ? AST_SymbolImportForeign : AST_SymbolExportForeign
    const type = is_import ? AST_SymbolImport : AST_SymbolExport
    const start = S.token
    let foreign_name
    let name

    if (is_import) {
      foreign_name = make_symbol(foreign_type)
    } else {
      name = make_symbol(type)
    }
    if (is('name', 'as')) {
      next() // The "as" word
      if (is_import) {
        name = make_symbol(type)
      } else {
        foreign_name = make_symbol(foreign_type)
      }
    } else if (is_import && foreign_name) {
      name = new type(foreign_name)
    } else if (!is_import && name) {
      foreign_name = new foreign_type(name)
    }

    return new AST_NameMapping({
      start: start,
      foreign_name: foreign_name as any,
      name: name as any,
      end: prev()
    })
  }

  function map_nameAsterisk (is_import: boolean, name?: AST_SymbolImportForeign | AST_SymbolExportForeign | null) {
    const foreign_type = is_import ? AST_SymbolImportForeign : AST_SymbolExportForeign
    const type = is_import ? AST_SymbolImport : AST_SymbolExport
    const start = S.token
    const end = prev()

    name = name || new type({
      name: '*',
      start: start,
      end: end
    })

    const foreign_name = new foreign_type({
      name: '*',
      start: start,
      end: end
    })

    return new AST_NameMapping({
      start: start,
      foreign_name: foreign_name,
      name: name,
      end: end
    })
  }

  function map_names1 (is_import: boolean) {
    let names
    if (is('punc', '{')) {
      next()
      names = []
      while (!is('punc', '}')) {
        names.push(map_name(is_import))
        if (is('punc', ',')) {
          next()
        }
      }
      next()
    } else if (is('operator', '*')) {
      let name
      next()
      if (is_import && is('name', 'as')) {
        next() // The "as" word
        name = as_symbol(is_import ? AST_SymbolImport : AST_SymbolExportForeign)
      }
      names = [map_nameAsterisk(is_import, name)]
    }
    return names
  }

  function export_ () {
    const start = S.token
    let is_default
    let exported_names

    if (is('keyword', 'default')) {
      is_default = true
      next()
    } else if ((exported_names = map_names1(false))) {
      if (is('name', 'from')) {
        next()

        const mod_str = S.token
        if (mod_str.type !== 'string') {
          unexpected()
        }
        next()

        return new AST_Export({
          start: start,
          is_default: is_default,
          exported_names: exported_names,
          module_name: new AST_String({
            start: mod_str,
            value: mod_str.value,
            quote: mod_str.quote,
            end: mod_str
          }),
          end: prev()
        })
      } else {
        return new AST_Export({
          start: start,
          is_default: is_default,
          exported_names: exported_names,
          end: prev()
        })
      }
    }

    let node
    let exported_value
    let exported_definition
    if (is('punc', '{') ||
            (is_default &&
                (is('keyword', 'class') || is('keyword', 'function')) &&
                is_token(peek(), 'punc'))) {
      exported_value = expression(false)
      semicolon()
    } else if (is_ast_definitions((node = statement(is_default))) && is_default) {
      unexpected(node.start)
    } else if (is_ast_definitions(node) || is_ast_lambda(node) || is_ast_def_class(node)) {
      exported_definition = node
    } else if (is_ast_simple_statement(node)) {
      exported_value = node.body
    } else {
      unexpected(node.start)
    }

    return new AST_Export({
      start: start,
      is_default: is_default,
      exported_value: exported_value,
      exported_definition: exported_definition,
      end: prev()
    } as any)
  }

  function as_property_name () {
    const tmp = S.token
    switch (tmp.type) {
      case 'punc':
        if (tmp.value === '[') {
          next()
          const ex = expression(false)
          expect(']')
          return ex
        } else unexpected(tmp)
      case 'operator':
        if (tmp.value === '*') {
          next()
          return null
        }
        if (!['delete', 'in', 'instanceof', 'new', 'typeof', 'void'].includes(tmp.value)) {
          unexpected(tmp)
        }
        /* falls through */
      case 'name':
        if (tmp.value == 'yield') {
          if (is_in_generator(S)) {
            token_error(S, tmp, 'Yield cannot be used as identifier inside generators')
          } else if (!is_token(peek(), 'punc', ':') &&
                    !is_token(peek(), 'punc', '(') &&
                    S.input.has_directive('use strict')) {
            token_error(S, tmp, 'Unexpected yield identifier inside strict mode')
          }
        }
      case 'string':
      case 'num':
      case 'big_int':
      case 'keyword':
      case 'atom':
        next()
        return tmp.value
      default:
        unexpected(tmp)
    }
  }

  function as_name () {
    const tmp = S.token
    if (tmp.type != 'name') unexpected()
    next()
    return tmp.value
  }

  function _make_symbol (type: typeof AST_Node): AST_Symbol {
    const name = S.token?.value
    return new (name == 'this' ? AST_This
      : name == 'super' ? AST_Super
        : type)({
      name: String(name),
      start: S.token,
      end: S.token
    }) as any
  }

  function _verify_symbol (sym: AST_Symbol) {
    const name = sym.name
    if (is_in_generator(S) && name == 'yield') {
      token_error(S, sym.start, 'Yield cannot be used as identifier inside generators')
    }
    if (S.input.has_directive('use strict')) {
      if (name == 'yield') {
        token_error(S, sym.start, 'Unexpected yield identifier inside strict mode')
      }
      if (is_ast_symbol_declaration(sym) && (name == 'arguments' || name == 'eval')) {
        token_error(S, sym.start, 'Unexpected ' + name + ' in strict mode')
      }
    }
  }

  function as_symbol (type: typeof AST_Symbol, noerror: boolean = false): AST_Symbol {
    if (!is('name')) {
      if (!noerror) croak(S, 'Name expected')
      return null as any
    }
    const sym = _make_symbol(type)
    _verify_symbol(sym)
    next()
    return sym
  }

  // Annotate AST_Call, AST_Lambda or AST_New with the special comments
  function annotate (node: AST_Node) {
    const start = node.start
    const comments = start.comments_before
    const comments_outside_parens = outer_comments_before_counts.get(start)
    let i = comments_outside_parens != null ? comments_outside_parens : comments.length
    while (--i >= 0) {
      const comment = comments[i]
      if (/[@#]__/.test(comment.value)) {
        if (/[@#]__PURE__/.test(comment.value)) {
          set_annotation(node, _PURE)
          break
        }
        if (/[@#]__INLINE__/.test(comment.value)) {
          set_annotation(node, _INLINE)
          break
        }
        if (/[@#]__NOINLINE__/.test(comment.value)) {
          set_annotation(node, _NOINLINE)
          break
        }
      }
    }
  }

  const subscripts = function (expr: AST_Node, allow_calls: boolean): AST_Node {
    const start = expr.start
    if (is('punc', '.')) {
      next()
      return subscripts(new AST_Dot({
        start: start,
        expression: expr,
        property: as_name(),
        end: prev()
      }), allow_calls)
    }
    if (is('punc', '[')) {
      next()
      const prop = expression(true)
      expect(']')
      return subscripts(new AST_Sub({
        start: start,
        expression: expr,
        property: prop,
        end: prev()
      }), allow_calls)
    }
    if (allow_calls && is('punc', '(')) {
      next()
      const call = new AST_Call({
        start: start,
        expression: expr,
        args: call_args(),
        end: prev()
      })
      annotate(call)
      return subscripts(call, true)
    }
    if (is('template_head')) {
      return subscripts(new AST_PrefixedTemplateString({
        start: start,
        prefix: expr as any,
        template_string: template_string(true),
        end: prev()
      }), allow_calls)
    }
    return expr
  }

  function call_args () {
    const args: any[] = []
    while (!is('punc', ')')) {
      if (is('expand', '...')) {
        next()
        args.push(new AST_Expansion({
          start: prev(),
          expression: expression(false),
          end: prev()
        }))
      } else {
        args.push(expression(false))
      }
      if (!is('punc', ')')) {
        expect(',')
        if (is('punc', ')') && (options.ecma as number) < 2017) unexpected()
      }
    }
    next()
    return args
  }

  const maybe_unary = function (allow_calls: boolean, allow_arrows: boolean = false) {
    const start = S.token
    if (start.type == 'name' && start.value == 'await') {
      if (is_in_async(S)) {
        next()
        return _await_expression()
      } else if (S.input.has_directive('use strict')) {
        token_error(S, S.token, 'Unexpected await identifier inside strict mode')
      }
    }
    if (is('operator') && UNARY_PREFIX.has(start.value)) {
      next()
      handle_regexp()
      const ex = make_unary(AST_UnaryPrefix, start, maybe_unary(allow_calls))
      ex.start = start
      ex.end = prev()
      return ex
    }
    let val = expr_atom(allow_calls, allow_arrows)
    while (is('operator') && UNARY_POSTFIX.has(S.token?.value as string) && !has_newline_before(S.token)) {
      if (is_ast_arrow(val)) unexpected()
      val = make_unary(AST_UnaryPostfix, S.token, val)
      val.start = start
      val.end = S.token
      next()
    }
    return val
  }

  function make_unary (CTOR: typeof AST_Unary, token: AST_Token, expr: AST_Node) {
    const op = token.value ?? ''
    switch (op) {
      case '++':
      case '--':
        if (!is_assignable(expr)) { croak(S, 'Invalid use of ' + op + ' operator', token.line, token.col, token.pos) }
        break
      case 'delete':
        if (is_ast_symbol_ref(expr) && S.input.has_directive('use strict')) { croak(S, 'Calling delete on expression not allowed in strict mode', expr.start.line, expr.start.col, expr.start.pos) }
        break
    }
    return new CTOR({ operator: op, expression: expr })
  }

  const expr_op = function (left: any, min_prec: number, no_in: boolean): any {
    let op = is('operator') ? S.token?.value : null
    if (op == 'in' && no_in) op = null
    if (op == '**' && is_ast_unary_prefix(left) &&
            /* unary token in front not allowed - parenthesis required */
            !is_token(left.start, 'punc', '(') &&
            left.operator !== '--' && left.operator !== '++') { unexpected(left.start) }
    const prec = op != null ? PRECEDENCE[op] : null
    if (prec != null && (prec > min_prec || (op === '**' && min_prec === prec))) {
      next()
      const right = expr_op(maybe_unary(true), prec, no_in)
      return expr_op(new AST_Binary({
        start: left.start,
        left: left,
        operator: op,
        right: right,
        end: right.end
      }), min_prec, no_in)
    }
    return left
  }

  function expr_ops (no_in: boolean) {
    return expr_op(maybe_unary(true, true), 0, no_in)
  }

  const maybe_conditional = function (no_in: boolean) {
    const start = S.token
    const expr = expr_ops(no_in)
    if (is('operator', '?')) {
      next()
      const yes = expression(false)
      expect(':')
      return new AST_Conditional({
        start: start,
        condition: expr,
        consequent: yes,
        alternative: expression(false, no_in),
        end: prev()
      })
    }
    return expr
  }

  function is_assignable (expr: AST_Node) {
    return is_ast_prop_access(expr) || is_ast_symbol_ref(expr)
  }

  function to_destructuring (node: AST_Node) {
    if (is_ast_object(node)) {
      node = new AST_Destructuring({
        start: node.start,
        names: node.properties.map(to_destructuring),
        is_array: false,
        end: node.end
      })
    } else if (is_ast_array(node)) {
      const names: any[] = []

      const elements = node.elements
      for (let i = 0; i < elements.length; i++) {
        // Only allow expansion as last element
        const element = elements[i]
        if (is_ast_expansion(element)) {
          if (i + 1 !== elements.length) {
            token_error(S, elements[i].start, 'Spread must the be last element in destructuring array')
          }
          element.expression = to_destructuring(element.expression)
        }

        names.push(to_destructuring(element))
      }

      node = new AST_Destructuring({
        start: node.start,
        names: names,
        is_array: true,
        end: node.end
      })
    } else if (is_ast_object_property(node)) {
      node.value = to_destructuring(node.value)
    } else if (is_ast_assign(node)) {
      node = new AST_DefaultAssign({
        start: node.start,
        left: node.left,
        operator: '=',
        right: node.right,
        end: node.end
      })
    }
    return node
  }

  // In ES6, AssignmentExpression can also be an ArrowFunction
  const maybe_assign = function (no_in: boolean): AST_Node {
    handle_regexp()
    const start = S.token

    if (start.type == 'name' && start.value == 'yield') {
      if (is_in_generator(S)) {
        next()
        return _yield_expression()
      } else if (S.input.has_directive('use strict')) {
        token_error(S, S.token, 'Unexpected yield identifier inside strict mode')
      }
    }

    let left = maybe_conditional(no_in)
    const val = S.token?.value

    if (is('operator') && ASSIGNMENT.has(val as string)) {
      if (is_assignable(left) || is_ast_destructuring((left = to_destructuring(left)))) {
        next()
        return new AST_Assign({
          start: start,
          left: left,
          operator: val,
          right: maybe_assign(no_in),
          end: prev()
        })
      }
      croak(S, 'Invalid assignment')
    }
    return left
  }

  const expression = function (commas?: boolean, no_in: boolean = false) {
    const start = S.token
    const exprs: any[] = []
    while (true) {
      exprs.push(maybe_assign(no_in))
      if (!commas || !is('punc', ',')) break
      next()
      commas = true
    }
    return exprs.length == 1 ? exprs[0] : new AST_Sequence({
      start: start,
      expressions: exprs,
      end: peek()
    })
  }

  function in_loop (cont: Function) {
    ++S.in_loop
    const ret = cont()
    --S.in_loop
    return ret
  }

  if (options.expression) {
    return expression(true)
  }

  return (function () {
    const start = S.token
    const body: any[] = []
    S.input.push_directives_stack()
    if (options.module) S.input.add_directive('use strict')
    while (!is('eof')) { body.push(statement()) }
    S.input.pop_directives_stack()
    const end = prev()
    let toplevel = options.toplevel
    if (toplevel) {
      toplevel.body = toplevel.body.concat(body)
      toplevel.end = end
    } else {
      toplevel = new AST_Toplevel({ start: start, body: body, end: end })
    }
    return toplevel
  })()
}
