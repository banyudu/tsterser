/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>
    Parser based on parse-js (http://marijn.haverbeke.nl/parse-js/).

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

import { Comment } from './types'
import AST_Symbol from './ast/symbol'
import {
  characters,
  defaults,
  makePredicate,
  set_annotation, is_ast_string, is_ast_iteration_statement, is_ast_definitions, is_ast_expansion, is_ast_symbol_method, is_ast_symbol_declaration, is_ast_symbol_ref, is_ast_prop_access, is_ast_object, is_ast_continue, is_ast_destructuring, is_ast_array, is_ast_lambda, is_ast_call, is_ast_symbol_class_property, is_ast_def_class, is_ast_object_property, is_ast_node, is_ast_simple_statement, is_ast_assign, is_ast_arrow, is_ast_unary_prefix
} from './utils'
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
} from './ast'

import { _INLINE, _NOINLINE, _PURE } from './constants'

const _KEYWORDS = 'break case catch class const continue debugger default delete do else export extends finally for function if in instanceof let new return switch throw try typeof var void while with'
const _KEYWORDS_ATOM = 'false null true'
const _RESERVED_WORDS = 'enum implements import interface package private protected public static super this ' + _KEYWORDS_ATOM + ' ' + _KEYWORDS
const _KEYWORDS_BEFORE_EXPRESSION = 'return new delete throw else case yield await'

const KEYWORDS = makePredicate(_KEYWORDS)
export const RESERVED_WORDS = makePredicate(_RESERVED_WORDS)
const KEYWORDS_BEFORE_EXPRESSION = makePredicate(_KEYWORDS_BEFORE_EXPRESSION)
const KEYWORDS_ATOM = makePredicate(_KEYWORDS_ATOM)

const OPERATOR_CHARS = makePredicate(characters('+-*&%=<>!?|~^'))

const RE_NUM_LITERAL = /[0-9a-f]/i
const RE_HEX_NUMBER = /^0x[0-9a-f]+$/i
const RE_OCT_NUMBER = /^0[0-7]+$/
const RE_ES6_OCT_NUMBER = /^0o[0-7]+$/i
const RE_BIN_NUMBER = /^0b[01]+$/i
const RE_DEC_NUMBER = /^\d*\.?\d*(?:e[+-]?\d*(?:\d\.?|\.?\d)\d*)?$/i
const RE_BIG_INT = /^(0[xob])?[0-9a-f]+n$/i

const OPERATORS = makePredicate([
  'in',
  'instanceof',
  'typeof',
  'new',
  'void',
  'delete',
  '++',
  '--',
  '+',
  '-',
  '!',
  '~',
  '&',
  '|',
  '^',
  '*',
  '**',
  '/',
  '%',
  '>>',
  '<<',
  '>>>',
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '===',
  '!=',
  '!==',
  '?',
  '=',
  '+=',
  '-=',
  '/=',
  '*=',
  '**=',
  '%=',
  '>>=',
  '<<=',
  '>>>=',
  '|=',
  '^=',
  '&=',
  '&&',
  '??',
  '||'
])

const WHITESPACE_CHARS = makePredicate(characters(' \u00a0\n\r\t\f\u000b\u200b\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\uFEFF'))

const NEWLINE_CHARS = makePredicate(characters('\n\r\u2028\u2029'))

const PUNC_AFTER_EXPRESSION = makePredicate(characters(';]),:'))

const PUNC_BEFORE_EXPRESSION = makePredicate(characters('[{(,;:'))

const PUNC_CHARS = makePredicate(characters('[]{}(),;:'))

/* -----[ Tokenizer ]----- */

// surrogate safe regexps adapted from https://github.com/mathiasbynens/unicode-8.0.0/tree/89b412d8a71ecca9ed593d9e9fa073ab64acfebe/Binary_Property
const UNICODE = {
  ID_Start: /[$A-Z_a-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDE80-\uDE9C\uDEA0-\uDED0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF75\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00\uDE10-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE4\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC03-\uDC37\uDC83-\uDCAF\uDCD0-\uDCE8\uDD03-\uDD26\uDD50-\uDD72\uDD76\uDD83-\uDDB2\uDDC1-\uDDC4\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE2B\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEDE\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3D\uDF50\uDF5D-\uDF61]|\uD805[\uDC80-\uDCAF\uDCC4\uDCC5\uDCC7\uDD80-\uDDAE\uDDD8-\uDDDB\uDE00-\uDE2F\uDE44\uDE80-\uDEAA\uDF00-\uDF19]|\uD806[\uDCA0-\uDCDF\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDED0-\uDEED\uDF00-\uDF2F\uDF40-\uDF43\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50\uDF93-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB]|\uD83A[\uDC00-\uDCC4]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]/,
  ID_Continue: /(?:[$0-9A-Z_a-z\xAA\xB5\xB7\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0300-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u0483-\u0487\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u05D0-\u05EA\u05F0-\u05F2\u0610-\u061A\u0620-\u0669\u066E-\u06D3\u06D5-\u06DC\u06DF-\u06E8\u06EA-\u06FC\u06FF\u0710-\u074A\u074D-\u07B1\u07C0-\u07F5\u07FA\u0800-\u082D\u0840-\u085B\u08A0-\u08B4\u08E3-\u0963\u0966-\u096F\u0971-\u0983\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BC-\u09C4\u09C7\u09C8\u09CB-\u09CE\u09D7\u09DC\u09DD\u09DF-\u09E3\u09E6-\u09F1\u0A01-\u0A03\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A59-\u0A5C\u0A5E\u0A66-\u0A75\u0A81-\u0A83\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABC-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AD0\u0AE0-\u0AE3\u0AE6-\u0AEF\u0AF9\u0B01-\u0B03\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3C-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B5C\u0B5D\u0B5F-\u0B63\u0B66-\u0B6F\u0B71\u0B82\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD0\u0BD7\u0BE6-\u0BEF\u0C00-\u0C03\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C58-\u0C5A\u0C60-\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBC-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CDE\u0CE0-\u0CE3\u0CE6-\u0CEF\u0CF1\u0CF2\u0D01-\u0D03\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D-\u0D44\u0D46-\u0D48\u0D4A-\u0D4E\u0D57\u0D5F-\u0D63\u0D66-\u0D6F\u0D7A-\u0D7F\u0D82\u0D83\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E01-\u0E3A\u0E40-\u0E4E\u0E50-\u0E59\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB9\u0EBB-\u0EBD\u0EC0-\u0EC4\u0EC6\u0EC8-\u0ECD\u0ED0-\u0ED9\u0EDC-\u0EDF\u0F00\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E-\u0F47\u0F49-\u0F6C\u0F71-\u0F84\u0F86-\u0F97\u0F99-\u0FBC\u0FC6\u1000-\u1049\u1050-\u109D\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u135D-\u135F\u1369-\u1371\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u170C\u170E-\u1714\u1720-\u1734\u1740-\u1753\u1760-\u176C\u176E-\u1770\u1772\u1773\u1780-\u17D3\u17D7\u17DC\u17DD\u17E0-\u17E9\u180B-\u180D\u1810-\u1819\u1820-\u1877\u1880-\u18AA\u18B0-\u18F5\u1900-\u191E\u1920-\u192B\u1930-\u193B\u1946-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u19D0-\u19DA\u1A00-\u1A1B\u1A20-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AA7\u1AB0-\u1ABD\u1B00-\u1B4B\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1BF3\u1C00-\u1C37\u1C40-\u1C49\u1C4D-\u1C7D\u1CD0-\u1CD2\u1CD4-\u1CF6\u1CF8\u1CF9\u1D00-\u1DF5\u1DFC-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u200C\u200D\u203F\u2040\u2054\u2071\u207F\u2090-\u209C\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D7F-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2DE0-\u2DFF\u3005-\u3007\u3021-\u302F\u3031-\u3035\u3038-\u303C\u3041-\u3096\u3099-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA62B\uA640-\uA66F\uA674-\uA67D\uA67F-\uA6F1\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA827\uA840-\uA873\uA880-\uA8C4\uA8D0-\uA8D9\uA8E0-\uA8F7\uA8FB\uA8FD\uA900-\uA92D\uA930-\uA953\uA960-\uA97C\uA980-\uA9C0\uA9CF-\uA9D9\uA9E0-\uA9FE\uAA00-\uAA36\uAA40-\uAA4D\uAA50-\uAA59\uAA60-\uAA76\uAA7A-\uAAC2\uAADB-\uAADD\uAAE0-\uAAEF\uAAF2-\uAAF6\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABEA\uABEC\uABED\uABF0-\uABF9\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFE70-\uFE74\uFE76-\uFEFC\uFF10-\uFF19\uFF21-\uFF3A\uFF3F\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC]|\uD800[\uDC00-\uDC0B\uDC0D-\uDC26\uDC28-\uDC3A\uDC3C\uDC3D\uDC3F-\uDC4D\uDC50-\uDC5D\uDC80-\uDCFA\uDD40-\uDD74\uDDFD\uDE80-\uDE9C\uDEA0-\uDED0\uDEE0\uDF00-\uDF1F\uDF30-\uDF4A\uDF50-\uDF7A\uDF80-\uDF9D\uDFA0-\uDFC3\uDFC8-\uDFCF\uDFD1-\uDFD5]|\uD801[\uDC00-\uDC9D\uDCA0-\uDCA9\uDD00-\uDD27\uDD30-\uDD63\uDE00-\uDF36\uDF40-\uDF55\uDF60-\uDF67]|\uD802[\uDC00-\uDC05\uDC08\uDC0A-\uDC35\uDC37\uDC38\uDC3C\uDC3F-\uDC55\uDC60-\uDC76\uDC80-\uDC9E\uDCE0-\uDCF2\uDCF4\uDCF5\uDD00-\uDD15\uDD20-\uDD39\uDD80-\uDDB7\uDDBE\uDDBF\uDE00-\uDE03\uDE05\uDE06\uDE0C-\uDE13\uDE15-\uDE17\uDE19-\uDE33\uDE38-\uDE3A\uDE3F\uDE60-\uDE7C\uDE80-\uDE9C\uDEC0-\uDEC7\uDEC9-\uDEE6\uDF00-\uDF35\uDF40-\uDF55\uDF60-\uDF72\uDF80-\uDF91]|\uD803[\uDC00-\uDC48\uDC80-\uDCB2\uDCC0-\uDCF2]|\uD804[\uDC00-\uDC46\uDC66-\uDC6F\uDC7F-\uDCBA\uDCD0-\uDCE8\uDCF0-\uDCF9\uDD00-\uDD34\uDD36-\uDD3F\uDD50-\uDD73\uDD76\uDD80-\uDDC4\uDDCA-\uDDCC\uDDD0-\uDDDA\uDDDC\uDE00-\uDE11\uDE13-\uDE37\uDE80-\uDE86\uDE88\uDE8A-\uDE8D\uDE8F-\uDE9D\uDE9F-\uDEA8\uDEB0-\uDEEA\uDEF0-\uDEF9\uDF00-\uDF03\uDF05-\uDF0C\uDF0F\uDF10\uDF13-\uDF28\uDF2A-\uDF30\uDF32\uDF33\uDF35-\uDF39\uDF3C-\uDF44\uDF47\uDF48\uDF4B-\uDF4D\uDF50\uDF57\uDF5D-\uDF63\uDF66-\uDF6C\uDF70-\uDF74]|\uD805[\uDC80-\uDCC5\uDCC7\uDCD0-\uDCD9\uDD80-\uDDB5\uDDB8-\uDDC0\uDDD8-\uDDDD\uDE00-\uDE40\uDE44\uDE50-\uDE59\uDE80-\uDEB7\uDEC0-\uDEC9\uDF00-\uDF19\uDF1D-\uDF2B\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDCFF\uDEC0-\uDEF8]|\uD808[\uDC00-\uDF99]|\uD809[\uDC00-\uDC6E\uDC80-\uDD43]|[\uD80C\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872][\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E]|\uD811[\uDC00-\uDE46]|\uD81A[\uDC00-\uDE38\uDE40-\uDE5E\uDE60-\uDE69\uDED0-\uDEED\uDEF0-\uDEF4\uDF00-\uDF36\uDF40-\uDF43\uDF50-\uDF59\uDF63-\uDF77\uDF7D-\uDF8F]|\uD81B[\uDF00-\uDF44\uDF50-\uDF7E\uDF8F-\uDF9F]|\uD82C[\uDC00\uDC01]|\uD82F[\uDC00-\uDC6A\uDC70-\uDC7C\uDC80-\uDC88\uDC90-\uDC99\uDC9D\uDC9E]|\uD834[\uDD65-\uDD69\uDD6D-\uDD72\uDD7B-\uDD82\uDD85-\uDD8B\uDDAA-\uDDAD\uDE42-\uDE44]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD836[\uDE00-\uDE36\uDE3B-\uDE6C\uDE75\uDE84\uDE9B-\uDE9F\uDEA1-\uDEAF]|\uD83A[\uDC00-\uDCC4\uDCD0-\uDCD6]|\uD83B[\uDE00-\uDE03\uDE05-\uDE1F\uDE21\uDE22\uDE24\uDE27\uDE29-\uDE32\uDE34-\uDE37\uDE39\uDE3B\uDE42\uDE47\uDE49\uDE4B\uDE4D-\uDE4F\uDE51\uDE52\uDE54\uDE57\uDE59\uDE5B\uDE5D\uDE5F\uDE61\uDE62\uDE64\uDE67-\uDE6A\uDE6C-\uDE72\uDE74-\uDE77\uDE79-\uDE7C\uDE7E\uDE80-\uDE89\uDE8B-\uDE9B\uDEA1-\uDEA3\uDEA5-\uDEA9\uDEAB-\uDEBB]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1]|\uD87E[\uDC00-\uDE1D]|\uDB40[\uDD00-\uDDEF])+/ // eslint-disable-line no-misleading-character-class
}

export function get_full_char (str: string, pos: number) {
  if (is_surrogate_pair_head(str.charCodeAt(pos))) {
    if (is_surrogate_pair_tail(str.charCodeAt(pos + 1))) {
      return str.charAt(pos) + str.charAt(pos + 1)
    }
  } else if (is_surrogate_pair_tail(str.charCodeAt(pos))) {
    if (is_surrogate_pair_head(str.charCodeAt(pos - 1))) {
      return str.charAt(pos - 1) + str.charAt(pos)
    }
  }
  return str.charAt(pos)
}

export function get_full_char_code (str: string, pos: number) {
  // https://en.wikipedia.org/wiki/Universal_Character_Set_characters#Surrogates
  if (is_surrogate_pair_head(str.charCodeAt(pos))) {
    return 0x10000 + (str.charCodeAt(pos) - 0xd800 << 10) + str.charCodeAt(pos + 1) - 0xdc00
  }
  return str.charCodeAt(pos)
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

function from_char_code (code: number) {
  // Based on https://github.com/mathiasbynens/String.fromCodePoint/blob/master/fromcodepoint.js
  if (code > 0xFFFF) {
    code -= 0x10000
    return (String.fromCharCode((code >> 10) + 0xD800) +
            String.fromCharCode((code % 0x400) + 0xDC00))
  }
  return String.fromCharCode(code)
}

export function is_surrogate_pair_head (code: number) {
  return code >= 0xd800 && code <= 0xdbff
}

export function is_surrogate_pair_tail (code: number) {
  return code >= 0xdc00 && code <= 0xdfff
}

function is_digit (code: number) {
  return code >= 48 && code <= 57
}

function is_identifier_start (ch: string) {
  return UNICODE.ID_Start.test(ch)
}

export function is_identifier_char (ch: string) {
  return UNICODE.ID_Continue.test(ch)
}

export function is_basic_identifier_string (str: string) {
  return /^[a-z_$][a-z0-9_$]*$/i.test(str)
}

export function is_identifier_string (str: string, allow_surrogates: boolean) {
  if (/^[a-z_$][a-z0-9_$]*$/i.test(str)) {
    return true
  }
  if (!allow_surrogates && /[\ud800-\udfff]/.test(str)) {
    return false
  }
  let match = UNICODE.ID_Start.exec(str)
  if (!match || match.index !== 0) {
    return false
  }

  str = str.slice(match[0].length)
  if (!str) {
    return true
  }

  match = UNICODE.ID_Continue.exec(str)
  return !!match && match[0].length === str.length
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

export class JS_Parse_Error extends Error {
  filename: string | undefined
  line: number
  col: number
  pos: number
  constructor (message: string, filename: string | undefined, line: number, col: number, pos: number) {
    super()
    this.name = 'SyntaxError'
    this.message = message
    this.filename = filename
    this.line = line
    this.col = col
    this.pos = pos
  }
}

export function js_error (message: string, filename: string | undefined, line: number, col: number, pos: number) {
  throw new JS_Parse_Error(message, filename, line, col, pos)
}

function is_token (token: any, type?: string | null, val?: string) {
  return token.type == type && (val == null || token.value == val)
}

const EX_EOF = {}

export function tokenizer ($TEXT: string, filename: string | undefined, html5_comments: boolean, shebang: boolean) {
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

  function peek () { return get_full_char(S.text, S.pos) }

  function next (signal_eof?: boolean, in_string?: boolean) {
    let ch = get_full_char(S.text, S.pos++)
    if (signal_eof && !ch) { throw EX_EOF }
    if (NEWLINE_CHARS.has(ch)) {
      S.newline_before = S.newline_before || !in_string
      ++S.line
      S.col = 0
      if (ch == '\r' && peek() == '\n') {
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

  function forward (i: number) {
    while (i--) next()
  }

  function looking_at (str: string) {
    return S.text.substr(S.pos, str.length) == str
  }

  function find_eol () {
    const text = S.text
    for (let i = S.pos, n = S.text.length; i < n; ++i) {
      const ch = text[i]
      if (NEWLINE_CHARS.has(ch)) { return i }
    }
    return -1
  }

  function find (what: string, signal_eof: boolean) {
    const pos = S.text.indexOf(what, S.pos)
    if (signal_eof && pos == -1) throw EX_EOF
    return pos
  }

  function start_token () {
    S.tokline = S.line
    S.tokcol = S.col
    S.tokpos = S.pos
  }

  let prev_was_dot = false
  let previous_token: any = null
  function token (type: string, value?: string | number | object, is_comment?: boolean) {
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

  function skip_whitespace () {
    while (WHITESPACE_CHARS.has(peek())) { next() }
  }

  function read_while (pred: (ch: string, i: number) => boolean) {
    let ret = ''; let ch; let i = 0
    while ((ch = peek()) && pred(ch, i++)) { ret += next() }
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

  function read_escaped_char (in_string: boolean, strict_hex: boolean, template_string?: boolean) {
    const ch = next(true, in_string)
    switch (ch.charCodeAt(0)) {
      case 110 : return '\n'
      case 114 : return '\r'
      case 116 : return '\t'
      case 98 : return '\b'
      case 118 : return '\u000b' // \v
      case 102 : return '\f'
      case 120 : return String.fromCharCode(hex_bytes(2, strict_hex) as number) // \x
      case 117 : // \u
        if (peek() == '{') {
          next(true)
          if (peek() === '}') { parse_error('Expecting hex-character between {}') }
          while (peek() == '0') next(true) // No significance
          let result; const length = find('}', true) - S.pos
          // Avoid 32 bit integer overflow (1 << 32 === 1)
          // We know first character isn't 0 and thus out of range anyway
          if (length > 6 || (result = hex_bytes(length, strict_hex)) > 0x10FFFF) {
            parse_error('Unicode reference out of bounds')
          }
          next(true)
          return from_char_code(Number(result))
        }
        return String.fromCharCode(hex_bytes(4, strict_hex) as number)
      case 10 : return '' // newline
      case 13 : // \r
        if (peek() == '\n') { // DOS newline
          next(true, in_string)
          return ''
        }
    }
    if (is_octal(ch)) {
      if (template_string && strict_hex) {
        const represents_null_character = ch === '0' && !is_octal(peek())
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
    let p = peek()
    if (p >= '0' && p <= '7') {
      ch += next(true)
      if (ch[0] <= '3' && (p = peek()) >= '0' && p <= '7') { ch += next(true) }
    }

    // Parse
    if (ch === '0') return '\0'
    if (ch.length > 0 && next_token.has_directive('use strict') && strict_octal) { parse_error('Legacy octal escape sequences are not allowed in strict mode') }
    return String.fromCharCode(parseInt(ch, 8))
  }

  function hex_bytes (n: number, strict_hex: boolean) {
    let num: string = '0'
    for (; n > 0; --n) {
      if (!strict_hex && isNaN(parseInt(peek(), 16))) {
        return parseInt(num, 16) || ''
      }
      const digit = next(true)
      if (isNaN(parseInt(digit, 16))) { parse_error('Invalid hex-character pattern in string') }
      num += digit
    }
    return parseInt(num, 16)
  }

  const read_string = with_eof_error('Unterminated string constant', function () {
    const quote = next(); let ret = ''
    for (;;) {
      let ch = next(true, true)
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
    next(true, true)
    while ((ch = next(true, true)) != '`') {
      if (ch == '\r') {
        if (peek() == '\n') ++S.pos
        ch = '\n'
      } else if (ch == '$' && peek() == '{') {
        next(true, true)
        S.brace_counter++
        tok = token(begin ? 'template_head' : 'template_substitution', content)
        tok.raw = raw
        return tok
      }

      raw += ch
      if (ch == '\\') {
        const tmp = S.pos
        const prev_is_tag = previous_token && (previous_token.type === 'name' || previous_token.type === 'punc' && (previous_token.value === ')' || previous_token.value === ']'))
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
    const i = find_eol(); let ret
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
    forward(get_full_char_length(text) /* text length doesn't count \r\n as 2 char while S.pos - i does */ + 2)
    S.comments_before.push(token('comment2', text, true))
    S.newline_before = S.newline_before || text.includes('\n')
    S.regex_allowed = regex_allowed
    return next_token
  })

  const read_name = with_eof_error('Unterminated identifier name', function () {
    let name: string; let ch: string; let escaped = false
    const read_escaped_identifier_char = function () {
      escaped = true
      next()
      if (peek() !== 'u') {
        parse_error('Expecting UnicodeEscapeSequence -- uXXXX or u{XXXX}')
      }
      return read_escaped_char(false, true)
    }

    // Read first character (ID_Start)
    if ((name = peek()) === '\\') {
      name = read_escaped_identifier_char()
      if (!is_identifier_start(name)) {
        parse_error('First identifier char is an invalid identifier char')
      }
    } else if (is_identifier_start(name)) {
      next()
    } else {
      return ''
    }

    // Read ID_Continue
    while ((ch = peek()) != null) {
      if ((ch = peek()) === '\\') {
        ch = read_escaped_identifier_char()
        if (!is_identifier_char(ch)) {
          parse_error('Invalid escaped identifier char')
        }
      } else {
        if (!is_identifier_char(ch)) {
          break
        }
        next()
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
    while ((ch = next(true))) {
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
      if (!peek()) return op
      const bigger = op + peek()
      if (OPERATORS.has(bigger)) {
        next()
        return grow(bigger)
      } else {
        return op
      }
    }
    return token('operator', grow(prefix || next()))
  }

  function handle_slash () {
    next()
    switch (peek()) {
      case '/':
        next()
        return skip_line_comment('comment1')
      case '*':
        next()
        return skip_multiline_comment()
    }
    return S.regex_allowed ? read_regexp('') : read_operator('/')
  }

  function handle_eq_sign () {
    next()
    if (peek() === '>') {
      next()
      return token('arrow', '=>')
    } else {
      return read_operator('=')
    }
  }

  function handle_dot () {
    next()
    if (is_digit(peek().charCodeAt(0))) {
      return read_num('.')
    }
    if (peek() === '.') {
      next() // Consume second dot
      next() // Consume third dot
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
    if (shebang && S.pos == 0 && looking_at('#!')) {
      start_token()
      forward(2)
      skip_line_comment('comment5')
    }
    let ch
    for (;;) {
      skip_whitespace()
      start_token()
      if (html5_comments) {
        if (looking_at('<!--')) {
          forward(4)
          skip_line_comment('comment3')
          continue
        }
        if (looking_at('-->') && S.newline_before) {
          forward(3)
          skip_line_comment('comment4')
          continue
        }
      }
      ch = peek()
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
      if (PUNC_CHARS.has(ch)) return token('punc', next())
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

/* -----[ Parser (constants) ]----- */

const UNARY_PREFIX = makePredicate([
  'typeof',
  'void',
  'delete',
  '--',
  '++',
  '!',
  '~',
  '-',
  '+'
])

const UNARY_POSTFIX = makePredicate(['--', '++'])

const ASSIGNMENT = makePredicate(['=', '+=', '-=', '/=', '*=', '**=', '%=', '>>=', '<<=', '>>>=', '|=', '^=', '&='])

export const PRECEDENCE = (function (a: string[][], ret: AnyObject) {
  for (let i = 0; i < a.length; ++i) {
    const b = a[i]
    for (let j = 0; j < b.length; ++j) {
      ret[b[j]] = i + 1
    }
  }
  return ret
})(
  [
    ['||'],
    ['??'],
    ['&&'],
    ['|'],
    ['^'],
    ['&'],
    ['==', '===', '!=', '!=='],
    ['<', '>', '<=', '>=', 'in', 'instanceof'],
    ['>>', '<<', '>>>'],
    ['+', '-'],
    ['*', '/', '%'],
    ['**']
  ],
  {}
)

const ATOMIC_START_TOKEN = makePredicate(['atom', 'num', 'big_int', 'string', 'regexp', 'name'])

/* -----[ Parser ]----- */

export function parse ($TEXT: string, opt?: any) {
  // maps start tokens to count of comments found outside of their parens
  // Example: /* I count */ ( /* I don't */ foo() )
  // Useful because comments_before property of call with parens outside
  // contains both comments inside and outside these parens. Used to find the
  // right #__PURE__ comments for an expression
  const outer_comments_before_counts = new Map()

  const options: any = defaults(opt, {
    bare_returns: false,
    ecma: 2017,
    expression: false,
    filename: null,
    html5_comments: true,
    module: false,
    shebang: true,
    strict: false,
    toplevel: null
  }, true)

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

  function croak (msg: string, line?: number | null, col?: number | null, pos?: number | null) {
    const ctx = S.input.context()
    js_error(msg,
      ctx.filename,
      line != null ? line : ctx.tokline,
      col != null ? col : ctx.tokcol,
      pos != null ? pos : ctx.tokpos)
  }

  function token_error (token: any | null, msg: string) {
    croak(msg, token?.line, token?.col)
  }

  function unexpected (token?: any | null | undefined) {
    if (token == null) { token = S.token }
    token_error(token, 'Unexpected token: ' + token?.type + ' (' + token?.value + ')')
  }

  function expect_token (type: string, val: string | undefined) {
    if (is(type, val)) {
      return next()
    }
    token_error(S.token, 'Unexpected token ' + S.token?.type + ' «' + S.token?.value + '»' + ', expected ' + type + ' «' + val + '»')
  }

  function expect (punc: string) { return expect_token('punc', punc) }

  function has_newline_before (token: AST_Token) {
    return token.nlb || !token.comments_before.every((comment: Comment) => !comment.nlb)
  }

  function can_insert_semicolon () {
    return !options.strict &&
            (is('eof') || is('punc', '}') || has_newline_before(S.token))
  }

  function is_in_generator () {
    return S.in_generator === S.in_function
  }

  function is_in_async () {
    return S.in_async === S.in_function
  }

  function semicolon (optional?: boolean) {
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
            croak('functions are not allowed as the body of a loop')
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
              croak('classes are not allowed as the body of a loop')
            }
            if (is_if_body) {
              croak('classes are not allowed as the body of an if')
            }
            return class_(AST_DefClass)

          case 'function':
            next()
            if (is_for_body) {
              croak('functions are not allowed as the body of a loop')
            }
            return function_(AST_Defun, false, false, is_export_default)

          case 'if':
            next()
            return if_()

          case 'return': {
            if (S.in_function == 0 && !options.bare_returns) { croak("'return' outside of function") }
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
            if (has_newline_before(S.token)) { croak("Illegal newline after 'throw'") }
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
              croak('Strict mode may not include a with statement')
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
  })

  function labeled_statement () {
    const label = as_symbol(AST_Label)
    if (label.name === 'await' && is_in_async()) {
      token_error(S.prev, 'await cannot be used as label inside async function')
    }
    if (S.labels.some((l) => l.name === label.name)) {
      // ECMA-262, 12.12: An ECMAScript program is considered
      // syntactically incorrect if it contains a
      // LabelledStatement that is enclosed by a
      // LabelledStatement with the same Identifier as label.
      croak('Label ' + label.name + ' defined twice')
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
          croak('Continue label `' + label.name + '` refers to non-IterationStatement.',
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
      if (!ldef) { croak('Undefined label ' + label.name) }
      label.thedef = ldef
    } else if (S.in_loop == 0) { croak(type.TYPE + ' not inside a loop or switch') }
    semicolon()
    const stat = new type({ label: label })
    if (ldef) ldef.references.push(stat)
    return stat
  }

  function for_ () {
    const for_await_error = '`for await` invalid in this context'
    let await_tok: any | false | null = S.token
    if (await_tok?.type == 'name' && await_tok.value == 'await') {
      if (!is_in_async()) {
        token_error(await_tok, for_await_error)
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
        token_error(await_tok, for_await_error)
      }
      if (is_in || is_of) {
        if (is_ast_definitions(init)) {
          if (init.definitions.length > 1) { token_error(init.start, 'Only one variable declaration allowed in for..in loop') }
        } else if (!(is_assignable(init) || is_ast_destructuring((init = to_destructuring(init))))) {
          token_error(init.start, 'Invalid left-hand side in for..in loop')
        }
        next()
        if (is_in) {
          return for_in(init)
        } else {
          return for_of(init, !!await_tok)
        }
      }
    } else if (await_tok) {
      token_error(await_tok, for_await_error)
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
      croak('Unexpected newline before arrow (=>)')
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

  const function_ = function (CTOR: typeof AST_Defun | typeof AST_Function, is_generator_property: boolean, is_async: boolean, is_export_default?: boolean) {
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
                  token_error(token, 'Unexpected ' + token.value + ' identifier as parameter inside strict mode')
                }
                break
              default:
                if (RESERVED_WORDS.has(token.value)) {
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
          token_error(duplicate, 'Parameter ' + duplicate.value + ' was used already')
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

  function binding_element (used_parameters: any, symbol_type: any) {
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
          croak('Invalid function parameter')
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
            croak('Rest element must be last element')
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
            croak('Rest element must be last element')
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
      croak('Invalid function parameter')
    }
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
    if (!is_in_async()) {
      croak('Unexpected await expression outside async function',
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
    if (!is_in_generator()) {
      croak('Unexpected yield expression outside generator function',
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
    if (!bcatch && !bfinally) { croak('Missing catch/finally blocks') }
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
      } else {
        def = new AST_VarDef({
          start: S.token,
          name: as_symbol(sym_type),
          value: is('operator', '=')
            ? (next(), expression(false, no_in))
            : !no_in && kind === 'const'
              ? croak('Missing initializer in const declaration') : null,
          end: prev()
        })
        if (def.name.name == 'import') croak('Unexpected token: import')
      }
      a.push(def)
      if (!is('punc', ',')) { break }
      next()
    }
    return a
  }

  const var_ = function (no_in?: boolean) {
    return new AST_Var({
      start: prev(),
      definitions: vardefs(no_in, 'var'),
      end: prev()
    })
  }

  const let_ = function (no_in?: boolean) {
    return new AST_Let({
      start: prev(),
      definitions: vardefs(no_in, 'let'),
      end: prev()
    })
  }

  const const_ = function (no_in?: boolean) {
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

  function expr_list (closing: string, allow_trailing_comma: boolean, allow_empty?: boolean) {
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

  function concise_method_or_getset (name: any, start: AST_Token, is_class?: boolean) {
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

    const imported_names = map_names(true)

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
    } else if (is_import) {
      name = new type(foreign_name)
    } else {
      foreign_name = new foreign_type(name)
    }

    return new AST_NameMapping({
      start: start,
      foreign_name: foreign_name,
      name: name,
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

  function map_names (is_import: boolean) {
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
    } else if ((exported_names = map_names(false))) {
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
            is_default &&
                (is('keyword', 'class') || is('keyword', 'function')) &&
                is_token(peek(), 'punc')) {
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
          if (is_in_generator()) {
            token_error(tmp, 'Yield cannot be used as identifier inside generators')
          } else if (!is_token(peek(), 'punc', ':') &&
                    !is_token(peek(), 'punc', '(') &&
                    S.input.has_directive('use strict')) {
            token_error(tmp, 'Unexpected yield identifier inside strict mode')
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
    if (is_in_generator() && name == 'yield') {
      token_error(sym.start, 'Yield cannot be used as identifier inside generators')
    }
    if (S.input.has_directive('use strict')) {
      if (name == 'yield') {
        token_error(sym.start, 'Unexpected yield identifier inside strict mode')
      }
      if (is_ast_symbol_declaration(sym) && (name == 'arguments' || name == 'eval')) {
        token_error(sym.start, 'Unexpected ' + name + ' in strict mode')
      }
    }
  }

  function as_symbol (type: typeof AST_Symbol, noerror?: boolean): AST_Symbol {
    if (!is('name')) {
      if (!noerror) croak('Name expected')
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

  const maybe_unary = function (allow_calls: boolean, allow_arrows?: boolean) {
    const start = S.token
    if (start.type == 'name' && start.value == 'await') {
      if (is_in_async()) {
        next()
        return _await_expression()
      } else if (S.input.has_directive('use strict')) {
        token_error(S.token, 'Unexpected await identifier inside strict mode')
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
    const op = token.value
    switch (op) {
      case '++':
      case '--':
        if (!is_assignable(expr)) { croak('Invalid use of ' + op + ' operator', token.line, token.col, token.pos) }
        break
      case 'delete':
        if (is_ast_symbol_ref(expr) && S.input.has_directive('use strict')) { croak('Calling delete on expression not allowed in strict mode', expr.start.line, expr.start.col, expr.start.pos) }
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

      for (let i = 0; i < node.elements.length; i++) {
        // Only allow expansion as last element
        if (is_ast_expansion(node.elements[i])) {
          if (i + 1 !== node.elements.length) {
            token_error(node.elements[i].start, 'Spread must the be last element in destructuring array')
          }
          node.elements[i].expression = to_destructuring(node.elements[i].expression)
        }

        names.push(to_destructuring(node.elements[i]))
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
      if (is_in_generator()) {
        next()
        return _yield_expression()
      } else if (S.input.has_directive('use strict')) {
        token_error(S.token, 'Unexpected yield identifier inside strict mode')
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
      croak('Invalid assignment')
    }
    return left
  }

  const expression = function (commas?: boolean, no_in?: boolean) {
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
