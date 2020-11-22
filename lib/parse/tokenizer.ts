import { AST_Token } from '../ast'
import {
  UNICODE,
  EX_EOF,
  UNARY_POSTFIX,
  KEYWORDS_BEFORE_EXPRESSION,
  PUNC_BEFORE_EXPRESSION,
  RE_NUM_LITERAL,
  RE_OCT_NUMBER,
  RESERVED_WORDS,
  RE_BIG_INT,
  NEWLINE_CHARS,
  KEYWORDS,
  KEYWORDS_ATOM,
  PUNC_CHARS,
  OPERATORS,
  OPERATOR_CHARS,
  WHITESPACE_CHARS,
  RE_ES6_OCT_NUMBER,
  RE_BIN_NUMBER,
  RE_DEC_NUMBER,
  RE_HEX_NUMBER
} from '../constants'
import { is_identifier_char, js_error, get_full_char, is_surrogate_pair_head, is_surrogate_pair_tail } from '../utils'

export default function tokenizer ($TEXT: string, filename: string | undefined, html5_comments: boolean, shebang: boolean) {
  let S = {
    text: $TEXT,
    filename: filename,
    pos: 0,
    tokpos: 0,
    line: 1,
    tokline: 0,
    col: 0,
    tokcol: 0,
    newline_before: false,
    regex_allowed: false,
    brace_counter: 0,
    template_braces: [] as any[],
    comments_before: [] as any[],
    directives: {} as AnyObject,
    directive_stack: [] as any[]
  }

  function find (what: string, signal_eof: boolean) {
    const pos = S.text.indexOf(what, S.pos)
    if (signal_eof && pos == -1) throw EX_EOF
    return pos
  }

  let prev_was_dot = false
  let previous_token: any = null
  function token (type: string, value?: string | number | object, is_comment: boolean = false) {
    S.regex_allowed = ((type == 'operator' && !UNARY_POSTFIX.has(value as string)) ||
                           (type == 'keyword' && KEYWORDS_BEFORE_EXPRESSION.has(value as string)) ||
                           (type == 'punc' && PUNC_BEFORE_EXPRESSION.has(value as string))) ||
                           (type == 'arrow')
    if (type == 'punc' && value == '.') {
      prev_was_dot = true
    } else if (!is_comment) {
      prev_was_dot = false
    }
    let ret: any = {
      type: type,
      value: value,
      line: S.tokline,
      col: S.tokcol,
      pos: S.tokpos,
      endline: S.line,
      endcol: S.col,
      endpos: S.pos,
      nlb: S.newline_before,
      file: filename
    }
    if (/^(?:num|string|regexp)$/i.test(type)) {
      ret.raw = $TEXT.substring(ret.pos, ret.endpos)
    }
    if (!is_comment) {
      ret.comments_before = S.comments_before
      ret.comments_after = S.comments_before = []
    }
    S.newline_before = false
    ret = new AST_Token(ret)
    if (!is_comment) previous_token = ret
    return ret
  }

  function read_while (pred: (ch: string, i: number) => boolean) {
    let ret = ''; let ch; let i = 0
    while ((ch = peek(S)) && pred(ch, i++)) { ret += next(S) }
    return ret
  }

  function parse_error (err: string) {
    js_error(err, filename, S.tokline, S.tokcol, S.tokpos)
  }

  function read_num (prefix?: string) {
    let has_e = false; let after_e = false; let has_x = false; let has_dot = prefix == '.'; let is_big_int = false
    let num = read_while(function (ch, i) {
      if (is_big_int) return false

      const code = ch.charCodeAt(0)
      switch (code) {
        case 98: case 66: // bB
          return (has_x = true) // Can occur in hex sequence, don't return false yet
        case 111: case 79: // oO
        case 120: case 88: // xX
          return has_x ? false : (has_x = true)
        case 101: case 69: // eE
          return has_x ? true : has_e ? false : (has_e = (after_e = true))
        case 45: // -
          return after_e || (i == 0 && !prefix)
        case 43: // +
          return after_e
        case (after_e = false, 46): // .
          return (!has_dot && !has_x && !has_e) ? (has_dot = true) : false
      }

      if (ch === 'n') {
        is_big_int = true

        return true
      }

      return RE_NUM_LITERAL.test(ch)
    })
    if (prefix) num = prefix + num
    if (RE_OCT_NUMBER.test(num) && next_token.has_directive('use strict')) {
      parse_error('Legacy octal literals are not allowed in strict mode')
    }
    if (num.endsWith('n')) {
      const without_n = num.slice(0, -1)
      const allow_e = RE_HEX_NUMBER.test(without_n)
      const valid = parse_js_number(without_n, allow_e)
      if (!has_dot && RE_BIG_INT.test(num) && !isNaN(valid)) { return token('big_int', without_n) }
      parse_error('Invalid or unexpected token')
    }
    const valid = parse_js_number(num)
    if (!isNaN(valid)) {
      return token('num', valid)
    } else {
      parse_error('Invalid syntax: ' + num)
    }
  }

  function is_octal (ch: string) {
    return ch >= '0' && ch <= '7'
  }

  function read_escaped_char (in_string: boolean, strict_hex: boolean, template_string: boolean = false) {
    const ch = next(S, true, in_string)
    switch (ch.charCodeAt(0)) {
      case 110 : return '\n'
      case 114 : return '\r'
      case 116 : return '\t'
      case 98 : return '\b'
      case 118 : return '\u000b' // \v
      case 102 : return '\f'
      case 120 : return String.fromCharCode(hex_bytes(2, strict_hex) as number) // \x
      case 117 : // \u
        if (peek(S) == '{') {
          next(S, true)
          if (peek(S) === '}') { parse_error('Expecting hex-character between {}') }
          while (peek(S) == '0') next(S, true) // No significance
          let result; const length = find('}', true) - S.pos
          // Avoid 32 bit integer overflow (1 << 32 === 1)
          // We know first character isn't 0 and thus out of range anyway
          if (length > 6 || (result = hex_bytes(length, strict_hex)) > 0x10FFFF) {
            parse_error('Unicode reference out of bounds')
          }
          next(S, true)
          return from_char_code(Number(result))
        }
        return String.fromCharCode(hex_bytes(4, strict_hex) as number)
      case 10 : return '' // newline
      case 13 : // \r
        if (peek(S) == '\n') { // DOS newline
          next(S, true, in_string)
          return ''
        }
    }
    if (is_octal(ch)) {
      if (template_string && strict_hex) {
        const represents_null_character = ch === '0' && !is_octal(peek(S))
        if (!represents_null_character) {
          parse_error('Octal escape sequences are not allowed in template strings')
        }
      }
      return read_octal_escape_sequence(ch, strict_hex)
    }
    return ch
  }

  function read_octal_escape_sequence (ch: string, strict_octal: boolean) {
    // Read
    let p = peek(S)
    if (p >= '0' && p <= '7') {
      ch += next(S, true)
      if (ch[0] <= '3' && (p = peek(S)) >= '0' && p <= '7') { ch += next(S, true) }
    }

    // Parse
    if (ch === '0') return '\0'
    if (ch.length > 0 && next_token.has_directive('use strict') && strict_octal) { parse_error('Legacy octal escape sequences are not allowed in strict mode') }
    return String.fromCharCode(parseInt(ch, 8))
  }

  function hex_bytes (n: number, strict_hex: boolean) {
    let num: string = '0'
    for (; n > 0; --n) {
      if (!strict_hex && isNaN(parseInt(peek(S), 16))) {
        return parseInt(num, 16) || ''
      }
      const digit = next(S, true)
      if (isNaN(parseInt(digit, 16))) { parse_error('Invalid hex-character pattern in string') }
      num += digit
    }
    return parseInt(num, 16)
  }

  const read_string = with_eof_error('Unterminated string constant', function () {
    const quote = next(S); let ret = ''
    for (;;) {
      let ch = next(S, true, true)
      if (ch == '\\') ch = read_escaped_char(true, true)
      else if (ch == '\r' || ch == '\n') parse_error('Unterminated string constant')
      else if (ch == quote) break
      ret += ch
    }
    const tok: any = token('string', ret)
    tok.quote = quote
    return tok
  })

  const read_template_characters = with_eof_error('Unterminated template', function (begin: boolean) {
    if (begin) {
      S.template_braces.push(S.brace_counter)
    }
    let content = ''; let raw = ''; let ch; let tok
    next(S, true, true)
    while ((ch = next(S, true, true)) != '`') {
      if (ch == '\r') {
        if (peek(S) == '\n') ++S.pos
        ch = '\n'
      } else if (ch == '$' && peek(S) == '{') {
        next(S, true, true)
        S.brace_counter++
        tok = token(begin ? 'template_head' : 'template_substitution', content)
        tok.raw = raw
        return tok
      }

      raw += ch
      if (ch == '\\') {
        const tmp = S.pos
        const prev_is_tag = previous_token && (previous_token.type === 'name' || (previous_token.type === 'punc' && (previous_token.value === ')' || previous_token.value === ']')))
        ch = read_escaped_char(true, !prev_is_tag, true)
        raw += S.text.substr(tmp, S.pos - tmp)
      }

      content += ch
    }
    S.template_braces.pop()
    tok = token(begin ? 'template_head' : 'template_substitution', content)
    tok.raw = raw
    tok.end = true
    return tok
  })

  function skip_line_comment (type: string) {
    const regex_allowed = S.regex_allowed
    const i = find_eol(S); let ret
    if (i == -1) {
      ret = S.text.substr(S.pos)
      S.pos = S.text.length
    } else {
      ret = S.text.substring(S.pos, i)
      S.pos = i
    }
    S.col = S.tokcol + (S.pos - S.tokpos)
    S.comments_before.push(token(type, ret, true))
    S.regex_allowed = regex_allowed
    return next_token
  }

  const skip_multiline_comment = with_eof_error('Unterminated multiline comment', function () {
    const regex_allowed = S.regex_allowed
    const i = find('*/', true)
    const text = S.text.substring(S.pos, i).replace(/\r\n|\r|\u2028|\u2029/g, '\n')
    // update stream position
    forward(S, get_full_char_length(text) /* text length doesn't count \r\n as 2 char while S.pos - i does */ + 2)
    S.comments_before.push(token('comment2', text, true))
    S.newline_before = S.newline_before || text.includes('\n')
    S.regex_allowed = regex_allowed
    return next_token
  })

  const read_name = with_eof_error('Unterminated identifier name', function () {
    let name: string; let ch: string; let escaped = false
    const read_escaped_identifier_char = function () {
      escaped = true
      next(S)
      if (peek(S) !== 'u') {
        parse_error('Expecting UnicodeEscapeSequence -- uXXXX or u{XXXX}')
      }
      return read_escaped_char(false, true)
    }

    // Read first character (ID_Start)
    if ((name = peek(S)) === '\\') {
      name = read_escaped_identifier_char()
      if (!is_identifier_start(name)) {
        parse_error('First identifier char is an invalid identifier char')
      }
    } else if (is_identifier_start(name)) {
      next(S)
    } else {
      return ''
    }

    // Read ID_Continue
    while ((ch = peek(S)) != null) {
      if ((ch = peek(S)) === '\\') {
        ch = read_escaped_identifier_char()
        if (!is_identifier_char(ch)) {
          parse_error('Invalid escaped identifier char')
        }
      } else {
        if (!is_identifier_char(ch)) {
          break
        }
        next(S)
      }
      name += ch
    }
    if (RESERVED_WORDS.has(name) && escaped) {
      parse_error('Escaped characters are not allowed in keywords')
    }
    return name
  })

  const read_regexp = with_eof_error('Unterminated regular expression', function (source: string) {
    let prev_backslash = false; let ch; let in_class = false
    while ((ch = next(S, true))) {
      if (NEWLINE_CHARS.has(ch)) {
        parse_error('Unexpected line terminator')
      } else if (prev_backslash) {
        source += '\\' + ch
        prev_backslash = false
      } else if (ch == '[') {
        in_class = true
        source += ch
      } else if (ch == ']' && in_class) {
        in_class = false
        source += ch
      } else if (ch == '/' && !in_class) {
        break
      } else if (ch == '\\') {
        prev_backslash = true
      } else {
        source += ch
      }
    }
    const flags = read_name()
    return token('regexp', { source, flags })
  })

  function read_operator (prefix?: string | undefined) {
    function grow (op: string): string {
      if (!peek(S)) return op
      const bigger = op + peek(S)
      if (OPERATORS.has(bigger)) {
        next(S)
        return grow(bigger)
      } else {
        return op
      }
    }
    return token('operator', grow(prefix || next(S)))
  }

  function handle_slash () {
    next(S)
    switch (peek(S)) {
      case '/':
        next(S)
        return skip_line_comment('comment1')
      case '*':
        next(S)
        return skip_multiline_comment()
    }
    return S.regex_allowed ? read_regexp('') : read_operator('/')
  }

  function handle_eq_sign () {
    next(S)
    if (peek(S) === '>') {
      next(S)
      return token('arrow', '=>')
    } else {
      return read_operator('=')
    }
  }

  function handle_dot () {
    next(S)
    if (is_digit(peek(S).charCodeAt(0))) {
      return read_num('.')
    }
    if (peek(S) === '.') {
      next(S) // Consume second dot
      next(S) // Consume third dot
      return token('expand', '...')
    }

    return token('punc', '.')
  }

  function read_word () {
    const word = read_name()
    if (prev_was_dot) return token('name', word)
    return KEYWORDS_ATOM.has(word) ? token('atom', word)
      : !KEYWORDS.has(word) ? token('name', word)
        : OPERATORS.has(word) ? token('operator', word)
          : token('keyword', word)
  }

  function with_eof_error (eof_error: string, cont: Function) {
    return function (x?: any) {
      try {
        return cont(x)
      } catch (ex) {
        if (ex === EX_EOF) parse_error(eof_error)
        else throw ex
      }
    }
  }

  function next_token (force_regexp?: any) {
    if (force_regexp != null) { return read_regexp(force_regexp) }
    if (shebang && S.pos == 0 && looking_at(S, '#!')) {
      start_token(S)
      forward(S, 2)
      skip_line_comment('comment5')
    }
    let ch
    for (;;) {
      skip_whitespace(S)
      start_token(S)
      if (html5_comments) {
        if (looking_at(S, '<!--')) {
          forward(S, 4)
          skip_line_comment('comment3')
          continue
        }
        if (looking_at(S, '-->') && S.newline_before) {
          forward(S, 3)
          skip_line_comment('comment4')
          continue
        }
      }
      ch = peek(S)
      if (!ch) return token('eof')
      const code = ch.charCodeAt(0)
      switch (code) {
        case 34: case 39: return read_string()
        case 46: return handle_dot()
        case 47: {
          const tok = handle_slash()
          if (tok === next_token) continue
          return tok
        }
        case 61: return handle_eq_sign()
        case 96: return read_template_characters(true)
        case 123:
          S.brace_counter++
          break
        case 125:
          S.brace_counter--
          if (S.template_braces.length > 0 &&
                    S.template_braces[S.template_braces.length - 1] === S.brace_counter) { return read_template_characters(false) }
          break
      }
      if (is_digit(code)) return read_num()
      if (PUNC_CHARS.has(ch)) return token('punc', next(S))
      if (OPERATOR_CHARS.has(ch)) return read_operator()
      if (code == 92 || is_identifier_start(ch)) return read_word()
      break
    }
    parse_error("Unexpected character '" + ch + "'")
  }

  next_token.next = next
  next_token.peek = peek

  next_token.context = function (nc?: typeof S) {
    if (nc) S = nc
    return S
  }

  next_token.add_directive = function (directive: string) {
    S.directive_stack[S.directive_stack.length - 1].push(directive)

    if (S.directives[directive] === undefined) {
      S.directives[directive] = 1
    } else {
      S.directives[directive]++
    }
  }

  next_token.push_directives_stack = function () {
    S.directive_stack.push([])
  }

  next_token.pop_directives_stack = function () {
    const directives = S.directive_stack[S.directive_stack.length - 1]

    for (let i = 0; i < directives.length; i++) {
      S.directives[directives[i]]--
    }

    S.directive_stack.pop()
  }

  next_token.has_directive = function (directive: string) {
    return S.directives[directive] > 0
  }

  return next_token
}

function start_token (S: any) {
  S.tokline = S.line
  S.tokcol = S.col
  S.tokpos = S.pos
}

function forward (S: any, i: number) {
  while (i--) next(S)
}

function looking_at (S: any, str: string) {
  return S.text.substr(S.pos, str.length) == str
}

function find_eol (S: any) {
  const text = S.text
  for (let i = S.pos, n = S.text.length; i < n; ++i) {
    const ch = text[i]
    if (NEWLINE_CHARS.has(ch)) { return i }
  }
  return -1
}

function skip_whitespace (S: any) {
  while (WHITESPACE_CHARS.has(peek(S))) { next(S) }
}

function peek (S: any) { return get_full_char(S.text, S.pos) }

function next (S: any, signal_eof?: boolean, in_string: boolean = false) {
  let ch = get_full_char(S.text, S.pos++)
  if (signal_eof && !ch) { throw EX_EOF }
  if (NEWLINE_CHARS.has(ch)) {
    S.newline_before = S.newline_before || !in_string
    ++S.line
    S.col = 0
    if (ch == '\r' && peek(S) == '\n') {
      // treat a \r\n sequence as a single \n
      ++S.pos
      ch = '\n'
    }
  } else {
    if (ch.length > 1) {
      ++S.pos
      ++S.col
    }
    ++S.col
  }
  return ch
}

function from_char_code (code: number) {
  // Based on https://github.com/mathiasbynens/String.fromCodePoint/blob/master/fromcodepoint.js
  if (code > 0xFFFF) {
    code -= 0x10000
    return (String.fromCharCode((code >> 10) + 0xD800) +
            String.fromCharCode((code % 0x400) + 0xDC00))
  }
  return String.fromCharCode(code)
}

function is_digit (code: number) {
  return code >= 48 && code <= 57
}

function is_identifier_start (ch: string) {
  return UNICODE.ID_Start.test(ch)
}

function get_full_char_length (str: string) {
  let surrogates = 0

  for (let i = 0; i < str.length; i++) {
    if (is_surrogate_pair_head(str.charCodeAt(i)) && is_surrogate_pair_tail(str.charCodeAt(i + 1))) {
      surrogates++
      i++
    }
  }

  return str.length - surrogates
}

function parse_js_number (num: string, allow_e = true): number {
  if (!allow_e && num.includes('e')) {
    return NaN
  }
  if (RE_HEX_NUMBER.test(num)) {
    return parseInt(num.substr(2), 16)
  } else if (RE_OCT_NUMBER.test(num)) {
    return parseInt(num.substr(1), 8)
  } else if (RE_ES6_OCT_NUMBER.test(num)) {
    return parseInt(num.substr(2), 8)
  } else if (RE_BIN_NUMBER.test(num)) {
    return parseInt(num.substr(2), 2)
  } else if (RE_DEC_NUMBER.test(num)) {
    return parseFloat(num)
  } else {
    const val = parseFloat(num)
    if (String(val) == num) return val
  }
  return NaN
}
