import { convert_to_predicate, makePredicate } from './utils'
import { AST_Node } from './ast'
export const UNUSED = 0b00000001
export const TRUTHY = 0b00000010
export const FALSY = 0b00000100
export const UNDEFINED = 0b00001000
export const INLINED = 0b00010000
// Nodes to which values are ever written. Used when keep_assign is part of the unused option string.
export const WRITE_ONLY = 0b00100000
// information specific to a single compression pass
export const SQUEEZED = 0b0000000100000000
export const OPTIMIZED = 0b0000001000000000
export const TOP = 0b0000010000000000
export const CLEAR_BETWEEN_PASSES = SQUEEZED | OPTIMIZED | TOP
/* @__INLINE__ */
export const has_flag = (node: AST_Node, flag: number) => node.flags & flag
/* @__INLINE__ */
export const set_flag = (node: AST_Node, flag: number) => { node.flags |= flag }
/* @__INLINE__ */
export const clear_flag = (node: AST_Node, flag: number) => { node.flags &= ~flag }

export const object_fns = [
  'constructor',
  'toString',
  'valueOf'
]
export const native_fns = convert_to_predicate({
  Array: [
    'indexOf',
    'join',
    'lastIndexOf',
    'slice'
  ].concat(object_fns),
  Boolean: object_fns,
  Function: object_fns,
  Number: [
    'toExponential',
    'toFixed',
    'toPrecision'
  ].concat(object_fns),
  Object: object_fns,
  RegExp: [
    'test'
  ].concat(object_fns),
  String: [
    'charAt',
    'charCodeAt',
    'concat',
    'indexOf',
    'italics',
    'lastIndexOf',
    'match',
    'replace',
    'search',
    'slice',
    'split',
    'substr',
    'substring',
    'toLowerCase',
    'toUpperCase',
    'trim'
  ].concat(object_fns)
})
export const static_fns = convert_to_predicate({
  Array: [
    'isArray'
  ],
  Math: [
    'abs',
    'acos',
    'asin',
    'atan',
    'ceil',
    'cos',
    'exp',
    'floor',
    'log',
    'round',
    'sin',
    'sqrt',
    'tan',
    'atan2',
    'pow',
    'max',
    'min'
  ],
  Number: [
    'isFinite',
    'isNaN'
  ],
  Object: [
    'create',
    'getOwnPropertyDescriptor',
    'getOwnPropertyNames',
    'getPrototypeOf',
    'isExtensible',
    'isFrozen',
    'isSealed',
    'keys'
  ],
  String: [
    'fromCharCode'
  ]
})

export const static_values = convert_to_predicate({
  Math: [
    'E',
    'LN10',
    'LN2',
    'LOG2E',
    'LOG10E',
    'PI',
    'SQRT1_2',
    'SQRT2'
  ],
  Number: [
    'MAX_VALUE',
    'MIN_VALUE',
    'NaN',
    'NEGATIVE_INFINITY',
    'POSITIVE_INFINITY'
  ]
})

export const global_pure_fns = makePredicate('Boolean decodeURI decodeURIComponent Date encodeURI encodeURIComponent Error escape EvalError isFinite isNaN Number Object parseFloat parseInt RangeError ReferenceError String SyntaxError TypeError unescape URIError')

export const pure_prop_access_globals = new Set([
  'Number',
  'String',
  'Array',
  'Object',
  'Function',
  'Promise'
])

export const global_names = makePredicate('Array Boolean clearInterval clearTimeout console Date decodeURI decodeURIComponent encodeURI encodeURIComponent Error escape eval EvalError Function isFinite isNaN JSON Math Number parseFloat parseInt RangeError ReferenceError RegExp Object setInterval setTimeout String SyntaxError TypeError unescape URIError')

export const unaryPrefix = makePredicate('! ~ - + void')

export const lazy_op = makePredicate('&& || ??')
export const unary_side_effects = makePredicate('delete ++ --')

export const unary_bool = makePredicate('! delete')
export const binary_bool = makePredicate('in instanceof == != === !== < <= >= >')

export const unary = makePredicate('+ - ~ ++ --')
export const binary = makePredicate('- * / % & | ^ << >> >>>')

export const non_converting_unary = makePredicate('! typeof void')
export const non_converting_binary = makePredicate('&& || ?? === !==')

export const commutativeOperators = makePredicate('== === != !== * & | ^')
export const ASSIGN_OPS = makePredicate('+ - / * % >> << >>> | ^ &')
export const ASSIGN_OPS_COMMUTATIVE = makePredicate('* | ^ &')

export const identifier_atom = makePredicate('Infinity NaN undefined')

export const walk_abort = Symbol('abort walk')

export const directives = new Set(['use asm', 'use strict'])
export const _PURE = 0b00000001
export const _INLINE = 0b00000010
export const _NOINLINE = 0b00000100

export const global_objs = {
  Array: Array,
  Math: Math,
  Number: Number,
  Object: Object,
  String: String
}

export const MASK_EXPORT_DONT_MANGLE = 1 << 0
export const MASK_EXPORT_WANT_MANGLE = 1 << 1
