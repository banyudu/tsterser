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

function is_some_comments (comment: any) {
  // multiline comment
  return (
    (comment.type === 'comment2' || comment.type === 'comment1') &&
        /@preserve|@lic|@cc_on|^\**!/i.test(comment.value)
  )
}

export function OutputStream (opt?: any): any {
  var readonly = !opt
  const options: any = defaults(opt, {
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

  if (options.shorthand === undefined) { options.shorthand = options.ecma as number > 5 }

  // Convert comment option to RegExp if neccessary and set up comments filter
  var comment_filter: any = return_false // Default case, throw all comments away
  if (options.comments) {
    let comments = options.comments
    if (typeof options.comments === 'string' && /^\/.*\/[a-zA-Z]*$/.test(options.comments)) {
      var regex_pos = options.comments.lastIndexOf('/')
      comments = new RegExp(
        options.comments.substr(1, regex_pos - 1),
        options.comments.substr(regex_pos + 1)
      )
    }
    if (comments instanceof RegExp) {
      comment_filter = function (comment: any) {
        return comment.type != 'comment5' && (comments as RegExp).test(comment.value)
      }
    } else if (typeof comments === 'function') {
      comment_filter = function (comment: any) {
        return comment.type != 'comment5' && (comments as Function)(this, comment)
      }
    } else if (comments === 'some') {
      comment_filter = is_some_comments
    } else { // NOTE includes "all" option
      comment_filter = return_true
    }
  }

  var indentation = 0
  var current_col = 0
  var current_line = 1
  var current_pos = 0
  var OUTPUT = ''
  const printed_comments: Set<any[]> = new Set()

  var to_utf8 = options.ascii_only ? function (str: string, identifier?: boolean) {
    if (options.ecma as number >= 2015) {
      str = str.replace(/[\ud800-\udbff][\udc00-\udfff]/g, function (ch) {
        var code = get_full_char_code(ch, 0).toString(16)
        return '\\u{' + code + '}'
      })
    }
    return str.replace(/[\u0000-\u001f\u007f-\uffff]/g, function (ch) {
      var code = ch.charCodeAt(0).toString(16)
      if (code.length <= 2 && !identifier) {
        while (code.length < 2) code = '0' + code
        return '\\x' + code
      } else {
        while (code.length < 4) code = '0' + code
        return '\\u' + code
      }
    })
  } : function (str: string) {
    return str.replace(/[\ud800-\udbff][\udc00-\udfff]|([\ud800-\udbff]|[\udc00-\udfff])/g, function (match, lone) {
      if (lone) {
        return '\\u' + lone.charCodeAt(0).toString(16)
      }
      return match
    })
  }

  function make_string (str: string, quote: string) {
    var dq = 0; var sq = 0
    str = str.replace(/[\\\b\f\n\r\v\t\x22\x27\u2028\u2029\0\ufeff]/g,
      function (s, i) {
        switch (s) {
          case '"': ++dq; return '"'
          case "'": ++sq; return "'"
          case '\\': return '\\\\'
          case '\n': return '\\n'
          case '\r': return '\\r'
          case '\t': return '\\t'
          case '\b': return '\\b'
          case '\f': return '\\f'
          case '\x0B': return options.ie8 ? '\\x0B' : '\\v'
          case '\u2028': return '\\u2028'
          case '\u2029': return '\\u2029'
          case '\ufeff': return '\\ufeff'
          case '\0':
            return /[0-9]/.test(get_full_char(str, i + 1)) ? '\\x00' : '\\0'
        }
        return s
      })
    function quote_single () {
      return "'" + str.replace(/\x27/g, "\\'") + "'"
    }
    function quote_double () {
      return '"' + str.replace(/\x22/g, '\\"') + '"'
    }
    function quote_template () {
      return '`' + str.replace(/`/g, '\\`') + '`'
    }
    str = to_utf8(str)
    if (quote === '`') return quote_template()
    switch (options.quote_style) {
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

  function encode_string (str: string, quote: string) {
    var ret = make_string(str, quote)
    if (options.inline_script) {
      ret = ret.replace(/<\x2f(script)([>\/\t\n\f\r ])/gi, '<\\/$1$2')
      ret = ret.replace(/\x3c!--/g, '\\x3c!--')
      ret = ret.replace(/--\x3e/g, '--\\x3e')
    }
    return ret
  }

  function make_name (name: string) {
    name = name.toString()
    name = to_utf8(name, true)
    return name
  }

  function make_indent (back: number) {
    return ' '.repeat((options.indent_start as number) + indentation - back * (options.indent_level as number))
  }

  /* -----[ beautification/minification ]----- */

  var has_parens = false
  var might_need_space = false
  var might_need_semicolon = false
  var might_add_newline = 0
  var need_newline_indented = false
  var need_space = false
  var newline_insert = -1
  var last = ''
  var mapping_token: false | string; var mapping_name: string; var mappings: any[] = options.source_map && []

  var do_add_mapping = mappings ? function () {
    mappings.forEach(function (mapping) {
      try {
        options.source_map.add(
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
    mappings = []
  } : noop

  var ensure_line_len = options.max_line_len ? function () {
    if (current_col > (options.max_line_len as number)) {
      if (might_add_newline) {
        var left = OUTPUT.slice(0, might_add_newline)
        var right = OUTPUT.slice(might_add_newline)
        if (mappings) {
          var delta = right.length - current_col
          mappings.forEach(function (mapping) {
            mapping.line++
            mapping.col += delta
          })
        }
        OUTPUT = left + '\n' + right
        current_line++
        current_pos++
        current_col = right.length
      }
      if (current_col > (options.max_line_len as number)) {
                AST_Node.warn?.('Output exceeds {max_line_len} characters', options)
      }
    }
    if (might_add_newline) {
      might_add_newline = 0
      do_add_mapping()
    }
  } : noop

  var requireSemicolonChars = makePredicate('( [ + * / - , . `')

  function print (str: string) {
    str = String(str)
    var ch = get_full_char(str, 0)
    if (need_newline_indented && ch) {
      need_newline_indented = false
      if (ch !== '\n') {
        print('\n')
        indent()
      }
    }
    if (need_space && ch) {
      need_space = false
      if (!/[\s;})]/.test(ch)) {
        space()
      }
    }
    newline_insert = -1
    var prev = last.charAt(last.length - 1)
    if (might_need_semicolon) {
      might_need_semicolon = false

      if (prev === ':' && ch === '}' || (!ch || !';}'.includes(ch)) && prev !== ';') {
        if (options.semicolons || requireSemicolonChars.has(ch)) {
          OUTPUT += ';'
          current_col++
          current_pos++
        } else {
          ensure_line_len()
          if (current_col > 0) {
            OUTPUT += '\n'
            current_pos++
            current_line++
            current_col = 0
          }

          if (/^\s+$/.test(str)) {
            // reset the semicolon flag, since we didn't print one
            // now and might still have to later
            might_need_semicolon = true
          }
        }

        if (!options.beautify) { might_need_space = false }
      }
    }

    if (might_need_space) {
      if ((is_identifier_char(prev) &&
                    (is_identifier_char(ch) || ch == '\\')) ||
                (ch == '/' && ch == prev) ||
                ((ch == '+' || ch == '-') && ch == last)
      ) {
        OUTPUT += ' '
        current_col++
        current_pos++
      }
      might_need_space = false
    }

    if (mapping_token) {
      mappings.push({
        token: mapping_token,
        name: mapping_name,
        line: current_line,
        col: current_col
      })
      mapping_token = false
      if (!might_add_newline) do_add_mapping()
    }

    OUTPUT += str
    has_parens = str[str.length - 1] == '('
    current_pos += str.length
    var a = str.split(/\r?\n/); var n = a.length - 1
    current_line += n
    current_col += a[0].length
    if (n > 0) {
      ensure_line_len()
      current_col = a[n].length
    }
    last = str
  }

  var star = function () {
    print('*')
  }

  var space = options.beautify ? function () {
    print(' ')
  } : function () {
    might_need_space = true
  }

  var indent = options.beautify ? function (half?: boolean) {
    if (options.beautify) {
      print(make_indent(half ? 0.5 : 0))
    }
  } : noop

  var with_indent = options.beautify ? function (col: boolean | number, cont: Function) {
    if (col === true) col = next_indent()
    var save_indentation = indentation
    indentation = col as number
    var ret = cont()
    indentation = save_indentation
    return ret
  } : function (_col: boolean | number, cont: Function) { return cont() }

  var newline = options.beautify ? function () {
    if (newline_insert < 0) return print('\n')
    if (OUTPUT[newline_insert] != '\n') {
      OUTPUT = OUTPUT.slice(0, newline_insert) + '\n' + OUTPUT.slice(newline_insert)
      current_pos++
      current_line++
    }
    newline_insert++
  } : options.max_line_len ? function () {
    ensure_line_len()
    might_add_newline = OUTPUT.length
  } : noop

  var semicolon = options.beautify ? function () {
    print(';')
  } : function () {
    might_need_semicolon = true
  }

  function force_semicolon () {
    might_need_semicolon = false
    print(';')
  }

  function next_indent () {
    return indentation + (options.indent_level as number)
  }

  function with_block (cont: Function) {
    var ret
    print('{')
    newline()
    with_indent(next_indent(), function () {
      ret = cont()
    })
    indent()
    print('}')
    return ret
  }

  function with_parens (cont: () => any) {
    print('(')
    // XXX: still nice to have that for argument lists
    // var ret = with_indent(current_col, cont);
    var ret = cont()
    print(')')
    return ret
  }

  function with_square (cont: Function) {
    print('[')
    // var ret = with_indent(current_col, cont);
    var ret = cont()
    print(']')
    return ret
  }

  function comma () {
    print(',')
    space()
  }

  function colon () {
    print(':')
    space()
  }

  var add_mapping = mappings ? function (token: string, name: string) {
    mapping_token = token
    mapping_name = name
  } : noop

  function get () {
    if (might_add_newline) {
      ensure_line_len()
    }
    return OUTPUT
  }

  function has_nlb () {
    let n = OUTPUT.length - 1
    while (n >= 0) {
      const code = OUTPUT.charCodeAt(n)
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

  function filter_comment (comment: string) {
    if (!options.preserve_annotations) {
      comment = comment.replace(r_annotation, ' ')
    }
    if (/^\s*$/.test(comment)) {
      return ''
    }
    return comment.replace(/(<\s*\/\s*)(script)/i, '<\\/$2')
  }

  function prepend_comments (node: any) {
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
      var tw = new TreeWalker(function (node: any) {
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

    if (current_pos == 0) {
      if (comments.length > 0 && options.shebang && comments[0].type === 'comment5' &&
                !printed_comments.has(comments[0])) {
        print('#!' + comments.shift()?.value + '\n')
        indent()
      }
      var preamble = options.preamble
      if (preamble) {
        print(preamble.replace(/\r\n?|[\n\u2028\u2029]|\s*$/g, '\n'))
      }
    }

    comments = comments.filter(comment_filter, node).filter(c => !printed_comments.has(c))
    if (comments.length == 0) return
    var last_nlb = has_nlb()
    comments.forEach(function (c, i) {
      printed_comments.add(c)
      if (!last_nlb) {
        if (c.nlb) {
          print('\n')
          indent()
          last_nlb = true
        } else if (i > 0) {
          space()
        }
      }

      if (/comment[134]/.test(c.type)) {
        var value = filter_comment(c.value)
        if (value) {
          print('//' + value + '\n')
          indent()
        }
        last_nlb = true
      } else if (c.type == 'comment2') {
        var value = filter_comment(c.value)
        if (value) {
          print('/*' + value + '*/')
        }
        last_nlb = false
      }
    })
    if (!last_nlb) {
      if (start.nlb) {
        print('\n')
        indent()
      } else {
        space()
      }
    }
  }

  function append_comments (node: any, tail?: boolean) {
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
    var insert = OUTPUT.length
    comments.filter(comment_filter, node).forEach(function (c, i) {
      if (printed_comments.has(c)) return
      printed_comments.add(c)
      need_space = false
      if (need_newline_indented) {
        print('\n')
        indent()
        need_newline_indented = false
      } else if (c.nlb && (i > 0 || !has_nlb())) {
        print('\n')
        indent()
      } else if (i > 0 || !tail) {
        space()
      }
      if (/comment[134]/.test(c.type)) {
        const value = filter_comment(c.value)
        if (value) {
          print('//' + value)
        }
        need_newline_indented = true
      } else if (c.type == 'comment2') {
        const value = filter_comment(c.value)
        if (value) {
          print('/*' + value + '*/')
        }
        need_space = true
      }
    })
    if (OUTPUT.length > insert) newline_insert = insert
  }

  var stack: any[] = []
  return {
    get: get,
    toString: get,
    indent: indent,
    in_directive: false,
    use_asm: null,
    active_scope: null,
    indentation: function () { return indentation },
    current_width: function () { return current_col - indentation },
    should_break: function () { return !!(options.width && this.current_width() >= options.width) },
    has_parens: function () { return has_parens },
    newline: newline,
    print: print,
    star: star,
    space: space,
    comma: comma,
    colon: colon,
    last: function () { return last },
    semicolon: semicolon,
    force_semicolon: force_semicolon,
    to_utf8: to_utf8,
    print_name: function (name: string) { print(make_name(name)) },
    print_string: function (str: string, quote: string, escape_directive: boolean) {
      var encoded = encode_string(str, quote)
      if (escape_directive && !encoded.includes('\\')) {
        // Insert semicolons to break directive prologue
        if (!EXPECT_DIRECTIVE.test(OUTPUT)) {
          force_semicolon()
        }
        force_semicolon()
      }
      print(encoded)
    },
    print_template_string_chars: function (str: string) {
      var encoded = encode_string(str, '`').replace(/\${/g, '\\${')
      return print(encoded.substr(1, encoded.length - 2))
    },
    encode_string: encode_string,
    next_indent: next_indent,
    with_indent: with_indent,
    with_block: with_block,
    with_parens: with_parens,
    with_square: with_square,
    add_mapping: add_mapping,
    option: function (opt: keyof any) { return options[opt] },
    printed_comments: printed_comments,
    prepend_comments: readonly ? noop : prepend_comments,
    append_comments: readonly || comment_filter === return_false ? noop : append_comments,
    line: function () { return current_line },
    col: function () { return current_col },
    pos: function () { return current_pos },
    push_node: function (node: any) { stack.push(node) },
    pop_node: function () { return stack.pop() },
    parent: function (n?: number) {
      return stack[stack.length - 2 - (n || 0)]
    }
  }
}
