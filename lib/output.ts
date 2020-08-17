/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

'use strict'

import {
  defaults,
  makePredicate,
  noop,
  return_false,
  return_true
} from './utils'
import AST_Node from './ast/node'
import TreeWalker from './tree-walker'
import {
  get_full_char_code,
  get_full_char,
  is_identifier_char
} from './parse'

const EXPECT_DIRECTIVE = /^$|[;{][\s\n]*$/
const CODE_LINE_BREAK = 10
const CODE_SPACE = 32

const r_annotation = /[@#]__(PURE|INLINE|NOINLINE)__/g
const requireSemicolonChars = makePredicate('( [ + * / - , . `')

function is_some_comments (comment: any) {
  // multiline comment
  return (
    (comment.type === 'comment2' || comment.type === 'comment1') &&
        /@preserve|@lic|@cc_on|^\**!/i.test(comment.value)
  )
}

class OutputStreamInner {
  get: any
  toString: any
  indent: any
  in_directive: boolean
  use_asm: any
  active_scope: any
  indentation: Function
  current_width: Function
  should_break: Function
  has_parens: Function
  newline: any
  print: any
  star: any
  space: any
  comma: any
  colon: any
  last: Function
  semicolon: any
  force_semicolon: any
  to_utf8: any
  print_name: Function
  print_string: Function
  print_template_string_chars: Function
  encode_string: any
  next_indent: any
  with_indent: any
  with_block: any
  with_parens: any
  with_square: any
  add_mapping: Function
  option: Function
  prepend_comments: any
  append_comments: Function
  line: Function
  col: Function
  pos: Function
  push_node: Function
  pop_node: Function
  parent: Function

  _has_parens = false
  _might_need_space = false
  _might_need_semicolon = false
  _might_add_newline = 0
  _need_newline_indented = false
  _need_space = false
  _newline_insert = -1
  _last = ''
  _mapping_token: false | string
  _mapping_name: string
  _indentation = 0
  _current_col = 0
  _current_line = 1
  _current_pos = 0
  _OUTPUT = ''
  printed_comments: Set<any[]> = new Set()

  constructor (opt?: any) {
    var _readonly = !opt
    const _options: any = defaults(opt, {
      ascii_only: false,
      beautify: false,
      braces: false,
      comments: 'some',
      ecma: 5,
      ie8: false,
      indent_level: 4,
      indent_start: 0,
      inline_script: true,
      keep_numbers: false,
      keep_quoted_props: false,
      max_line_len: false,
      preamble: null,
      preserve_annotations: false,
      quote_keys: false,
      quote_style: 0,
      safari10: false,
      semicolons: true,
      shebang: true,
      shorthand: undefined,
      source_map: null,
      webkit: false,
      width: 80,
      wrap_iife: false,
      wrap_func_args: true
    }, true)

    if (_options.shorthand === undefined) { _options.shorthand = _options.ecma as number > 5 }

    // Convert comment option to RegExp if neccessary and set up comments filter
    var _comment_filter: any = return_false // Default case, throw all comments away
    if (_options.comments) {
      let comments = _options.comments
      if (typeof _options.comments === 'string' && /^\/.*\/[a-zA-Z]*$/.test(_options.comments)) {
        var regex_pos = _options.comments.lastIndexOf('/')
        comments = new RegExp(
          _options.comments.substr(1, regex_pos - 1),
          _options.comments.substr(regex_pos + 1)
        )
      }
      if (comments instanceof RegExp) {
        _comment_filter = (comment: any) => {
          return comment.type != 'comment5' && (comments as RegExp).test(comment.value)
        }
      } else if (typeof comments === 'function') {
        _comment_filter = (comment: any) => {
          return comment.type != 'comment5' && (comments as Function)(this, comment)
        }
      } else if (comments === 'some') {
        _comment_filter = is_some_comments
      } else { // NOTE includes "all" option
        _comment_filter = return_true
      }
    }

    var _to_utf8 = _options.ascii_only ? (str: string, identifier?: boolean) => {
      if (_options.ecma as number >= 2015) {
        str = str.replace(/[\ud800-\udbff][\udc00-\udfff]/g, (ch) => {
          var code = get_full_char_code(ch, 0).toString(16)
          return '\\u{' + code + '}'
        })
      }
      return str.replace(/[\u0000-\u001f\u007f-\uffff]/g, (ch) => {
        var code = ch.charCodeAt(0).toString(16)
        if (code.length <= 2 && !identifier) {
          while (code.length < 2) code = '0' + code
          return '\\x' + code
        } else {
          while (code.length < 4) code = '0' + code
          return '\\u' + code
        }
      })
    } : (str: string) => {
      return str.replace(/[\ud800-\udbff][\udc00-\udfff]|([\ud800-\udbff]|[\udc00-\udfff])/g, (match, lone) => {
        if (lone) {
          return '\\u' + lone.charCodeAt(0).toString(16)
        }
        return match
      })
    }

    const make_string = (str: string, quote: string) => {
      var dq = 0; var sq = 0
      str = str.replace(/[\\\b\f\n\r\v\t\x22\x27\u2028\u2029\0\ufeff]/g,
        (s, i) => {
          switch (s) {
            case '"': ++dq; return '"'
            case "'": ++sq; return "'"
            case '\\': return '\\\\'
            case '\n': return '\\n'
            case '\r': return '\\r'
            case '\t': return '\\t'
            case '\b': return '\\b'
            case '\f': return '\\f'
            case '\x0B': return _options.ie8 ? '\\x0B' : '\\v'
            case '\u2028': return '\\u2028'
            case '\u2029': return '\\u2029'
            case '\ufeff': return '\\ufeff'
            case '\0':
              return /[0-9]/.test(get_full_char(str, i + 1)) ? '\\x00' : '\\0'
          }
          return s
        })
      const quote_single = () => {
        return "'" + str.replace(/\x27/g, "\\'") + "'"
      }
      const quote_double = () => {
        return '"' + str.replace(/\x22/g, '\\"') + '"'
      }
      const quote_template = () => {
        return '`' + str.replace(/`/g, '\\`') + '`'
      }
      str = _to_utf8(str)
      if (quote === '`') return quote_template()
      switch (_options.quote_style) {
        case 1:
          return quote_single()
        case 2:
          return quote_double()
        case 3:
          return quote == "'" ? quote_single() : quote_double()
        default:
          return dq > sq ? quote_single() : quote_double()
      }
    }

    const _encode_string = (str: string, quote: string) => {
      var ret = make_string(str, quote)
      if (_options.inline_script) {
        ret = ret.replace(/<\x2f(script)([>\/\t\n\f\r ])/gi, '<\\/$1$2')
        ret = ret.replace(/\x3c!--/g, '\\x3c!--')
        ret = ret.replace(/--\x3e/g, '--\\x3e')
      }
      return ret
    }

    const _make_name = (name: string) => {
      name = name.toString()
      name = _to_utf8(name, true)
      return name
    }

    const _make_indent = (back: number) => {
      return ' '.repeat((_options.indent_start as number) + this._indentation - back * (_options.indent_level as number))
    }

    /* -----[ beautification/minification ]----- */

    var _mappings: any[] = _options.source_map && []

    var _do_add_mapping = _mappings ? () => {
      _mappings.forEach((mapping) => {
        try {
          _options.source_map.add(
            mapping.token.file,
            mapping.line, mapping.col,
            mapping.token.line, mapping.token.col,
            !mapping.name && mapping.token.type == 'name' ? mapping.token.value : mapping.name
          )
        } catch (ex) {
          mapping.token.file != null && AST_Node.warn?.("Couldn't figure out mapping for {file}:{line},{col} → {cline},{ccol} [{name}]", {
            file: mapping.token.file,
            line: mapping.token.line,
            col: mapping.token.col,
            cline: mapping.line,
            ccol: mapping.col,
            name: mapping.name || ''
          })
        }
      })
      _mappings = []
    } : noop

    var _ensure_line_len = _options.max_line_len ? () => {
      if (this._current_col > (_options.max_line_len as number)) {
        if (this._might_add_newline) {
          var left = this._OUTPUT.slice(0, this._might_add_newline)
          var right = this._OUTPUT.slice(this._might_add_newline)
          if (_mappings) {
            var delta = right.length - this._current_col
            _mappings.forEach((mapping) => {
              mapping.line++
              mapping.col += delta
            })
          }
          this._OUTPUT = left + '\n' + right
          this._current_line++
          this._current_pos++
          this._current_col = right.length
        }
        if (this._current_col > (_options.max_line_len as number)) {
                AST_Node.warn?.('Output exceeds {max_line_len} characters', _options)
        }
      }
      if (this._might_add_newline) {
        this._might_add_newline = 0
        _do_add_mapping()
      }
    } : noop

    const _print = (str: string) => {
      str = String(str)
      var ch = get_full_char(str, 0)
      if (this._need_newline_indented && ch) {
        this._need_newline_indented = false
        if (ch !== '\n') {
          _print('\n')
          _indent()
        }
      }
      if (this._need_space && ch) {
        this._need_space = false
        if (!/[\s;})]/.test(ch)) {
          _space()
        }
      }
      this._newline_insert = -1
      var prev = this._last.charAt(this._last.length - 1)
      if (this._might_need_semicolon) {
        this._might_need_semicolon = false

        if (prev === ':' && ch === '}' || (!ch || !';}'.includes(ch)) && prev !== ';') {
          if (_options.semicolons || requireSemicolonChars.has(ch)) {
            this._OUTPUT += ';'
            this._current_col++
            this._current_pos++
          } else {
            _ensure_line_len()
            if (this._current_col > 0) {
              this._OUTPUT += '\n'
              this._current_pos++
              this._current_line++
              this._current_col = 0
            }

            if (/^\s+$/.test(str)) {
            // reset the semicolon flag, since we didn't print one
            // now and might still have to later
              this._might_need_semicolon = true
            }
          }

          if (!_options.beautify) { this._might_need_space = false }
        }
      }

      if (this._might_need_space) {
        if ((is_identifier_char(prev) &&
                    (is_identifier_char(ch) || ch == '\\')) ||
                (ch == '/' && ch == prev) ||
                ((ch == '+' || ch == '-') && ch == this._last)
        ) {
          this._OUTPUT += ' '
          this._current_col++
          this._current_pos++
        }
        this._might_need_space = false
      }

      if (this._mapping_token) {
        _mappings.push({
          token: this._mapping_token,
          name: this._mapping_name,
          line: this._current_line,
          col: this._current_col
        })
        this._mapping_token = false
        if (!this._might_add_newline) _do_add_mapping()
      }

      this._OUTPUT += str
      this._has_parens = str[str.length - 1] == '('
      this._current_pos += str.length
      var a = str.split(/\r?\n/); var n = a.length - 1
      this._current_line += n
      this._current_col += a[0].length
      if (n > 0) {
        _ensure_line_len()
        this._current_col = a[n].length
      }
      this._last = str
    }

    var _star = () => {
      _print('*')
    }

    var _space = _options.beautify ? () => {
      _print(' ')
    } : () => {
      this._might_need_space = true
    }

    var _indent = _options.beautify ? (half?: boolean) => {
      if (_options.beautify) {
        _print(_make_indent(half ? 0.5 : 0))
      }
    } : noop

    var _with_indent = _options.beautify ? (col: boolean | number, cont: Function) => {
      if (col === true) col = _next_indent()
      var save_indentation = this._indentation
      this._indentation = col as number
      var ret = cont()
      this._indentation = save_indentation
      return ret
    } : (_col: boolean | number, cont: Function) => { return cont() }

    var _newline = _options.beautify ? () => {
      if (this._newline_insert < 0) return _print('\n')
      if (this._OUTPUT[this._newline_insert] != '\n') {
        this._OUTPUT = this._OUTPUT.slice(0, this._newline_insert) + '\n' + this._OUTPUT.slice(this._newline_insert)
        this._current_pos++
        this._current_line++
      }
      this._newline_insert++
    } : _options.max_line_len ? () => {
      _ensure_line_len()
      this._might_add_newline = this._OUTPUT.length
    } : noop

    var _semicolon = _options.beautify ? () => {
      _print(';')
    } : () => {
      this._might_need_semicolon = true
    }

    const _force_semicolon = () => {
      this._might_need_semicolon = false
      _print(';')
    }

    const _next_indent = () => {
      return this._indentation + (_options.indent_level as number)
    }

    const _with_block = (cont: Function) => {
      var ret
      _print('{')
      _newline()
      _with_indent(_next_indent(), () => {
        ret = cont()
      })
      _indent()
      _print('}')
      return ret
    }

    const _with_parens = (cont: () => any) => {
      _print('(')
      // XXX: still nice to have that for argument lists
      // var ret = with_indent(current_col, cont);
      var ret = cont()
      _print(')')
      return ret
    }

    const _with_square = (cont: Function) => {
      _print('[')
      // var ret = with_indent(current_col, cont);
      var ret = cont()
      _print(']')
      return ret
    }

    const _comma = () => {
      _print(',')
      _space()
    }

    const _colon = () => {
      _print(':')
      _space()
    }

    var _add_mapping = _mappings ? (token: string, name: string) => {
      this._mapping_token = token
      this._mapping_name = name
    } : noop

    const _get = () => {
      if (this._might_add_newline) {
        _ensure_line_len()
      }
      return this._OUTPUT
    }

    const has_nlb = () => {
      let n = this._OUTPUT.length - 1
      while (n >= 0) {
        const code = this._OUTPUT.charCodeAt(n)
        if (code === CODE_LINE_BREAK) {
          return true
        }

        if (code !== CODE_SPACE) {
          return false
        }
        n--
      }
      return true
    }

    const filter_comment = (comment: string) => {
      if (!_options.preserve_annotations) {
        comment = comment.replace(r_annotation, ' ')
      }
      if (/^\s*$/.test(comment)) {
        return ''
      }
      return comment.replace(/(<\s*\/\s*)(script)/i, '<\\/$2')
    }

    const prepend_comments = (node: any) => {
      var self = this
      var start = node.start
      if (!start) return
      var printed_comments = self.printed_comments

      // There cannot be a newline between return and its value.
      const return_with_value = node?.isAst?.('AST_Exit') && node.value

      if (
        start.comments_before &&
            printed_comments.has(start.comments_before)
      ) {
        if (return_with_value) {
          start.comments_before = []
        } else {
          return
        }
      }

      var comments = start.comments_before
      if (!comments) {
        comments = start.comments_before = []
      }
      printed_comments.add(comments)

      if (return_with_value) {
        var tw = new TreeWalker((node: any) => {
          var parent: AST_Node = tw.parent()
          if (parent?._prepend_comments_check(node)) {
            if (!node.start) return undefined
            var text = node.start.comments_before
            if (text && !printed_comments.has(text)) {
              printed_comments.add(text)
              comments = comments.concat(text)
            }
          } else {
            return true
          }
          return undefined
        })
        tw.push(node)
        node.value.walk(tw)
      }

      if (this._current_pos == 0) {
        if (comments.length > 0 && _options.shebang && comments[0].type === 'comment5' &&
                !printed_comments.has(comments[0])) {
          _print('#!' + comments.shift()?.value + '\n')
          _indent()
        }
        var preamble = _options.preamble
        if (preamble) {
          _print(preamble.replace(/\r\n?|[\n\u2028\u2029]|\s*$/g, '\n'))
        }
      }

      comments = comments.filter(_comment_filter, node).filter(c => !printed_comments.has(c))
      if (comments.length == 0) return
      var last_nlb = has_nlb()
      comments.forEach((c, i) => {
        printed_comments.add(c)
        if (!last_nlb) {
          if (c.nlb) {
            _print('\n')
            _indent()
            last_nlb = true
          } else if (i > 0) {
            _space()
          }
        }

        if (/comment[134]/.test(c.type)) {
          var value = filter_comment(c.value)
          if (value) {
            _print('//' + value + '\n')
            _indent()
          }
          last_nlb = true
        } else if (c.type == 'comment2') {
          var value = filter_comment(c.value)
          if (value) {
            _print('/*' + value + '*/')
          }
          last_nlb = false
        }
      })
      if (!last_nlb) {
        if (start.nlb) {
          _print('\n')
          _indent()
        } else {
          _space()
        }
      }
    }

    const append_comments = (node: any, tail?: boolean) => {
      var self = this
      var token = node.end
      if (!token) return
      var printed_comments = self.printed_comments
      var comments = token[tail ? 'comments_before' : 'comments_after']
      if (!comments || printed_comments.has(comments)) return
      if (!(node?.isAst?.('AST_Statement') || comments.every((c) =>
        !/comment[134]/.test(c.type)
      ))) return
      printed_comments.add(comments)
      var insert = this._OUTPUT.length
      comments.filter(_comment_filter, node).forEach((c, i) => {
        if (printed_comments.has(c)) return
        printed_comments.add(c)
        this._need_space = false
        if (this._need_newline_indented) {
          _print('\n')
          _indent()
          this._need_newline_indented = false
        } else if (c.nlb && (i > 0 || !has_nlb())) {
          _print('\n')
          _indent()
        } else if (i > 0 || !tail) {
          _space()
        }
        if (/comment[134]/.test(c.type)) {
          const value = filter_comment(c.value)
          if (value) {
            _print('//' + value)
          }
          this._need_newline_indented = true
        } else if (c.type == 'comment2') {
          const value = filter_comment(c.value)
          if (value) {
            _print('/*' + value + '*/')
          }
          this._need_space = true
        }
      })
      if (this._OUTPUT.length > insert) this._newline_insert = insert
    }

    var _stack: any[] = []
    this.get = _get
    this.toString = _get
    this.indent = _indent
    this.in_directive = false
    this.use_asm = null
    this.active_scope = null
    this.indentation = () => { return this._indentation }
    this.current_width = () => { return this._current_col - this._indentation }
    this.should_break = () => { return !!(_options.width && this.current_width() >= _options.width) }
    this.has_parens = () => { return this._has_parens }
    this.newline = _newline
    this.print = _print
    this.star = _star
    this.space = _space
    this.comma = _comma
    this.colon = _colon
    this.last = () => { return this._last }
    this.semicolon = _semicolon
    this.force_semicolon = _force_semicolon
    this.to_utf8 = _to_utf8
    this.print_name = (name: string) => { _print(_make_name(name)) }
    this.print_string = (str: string, quote: string, escape_directive: boolean) => {
      var encoded = _encode_string(str, quote)
      if (escape_directive && !encoded.includes('\\')) {
      // Insert semicolons to break directive prologue
        if (!EXPECT_DIRECTIVE.test(this._OUTPUT)) {
          _force_semicolon()
        }
        _force_semicolon()
      }
      _print(encoded)
    }
    this.print_template_string_chars = (str: string) => {
      var encoded = _encode_string(str, '`').replace(/\${/g, '\\${')
      return _print(encoded.substr(1, encoded.length - 2))
    }
    this.encode_string = _encode_string
    this.next_indent = _next_indent
    this.with_indent = _with_indent
    this.with_block = _with_block
    this.with_parens = _with_parens
    this.with_square = _with_square
    this.add_mapping = _add_mapping
    this.option = (opt: keyof any) => { return _options[opt] }
    this.prepend_comments = _readonly ? noop : prepend_comments
    this.append_comments = _readonly || _comment_filter === return_false ? noop : append_comments
    this.line = () => { return this._current_line }
    this.col = () => { return this._current_col }
    this.pos = () => { return this._current_pos }
    this.push_node = (node: any) => { _stack.push(node) }
    this.pop_node = () => { return _stack.pop() }
    this.parent = (n?: number) => {
      return _stack[_stack.length - 2 - (n || 0)]
    }
  }
}

function factory (opt?: any): any {
  return new OutputStreamInner(opt)
}

export const OutputStream = factory
