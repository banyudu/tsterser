import AST_Symbol from './symbol'
import AST_Node from './node'
import { OutputStream } from '../output'
import AST_Scope, { AST_Scope_Props } from './scope'
import Compressor from '../compressor'
import SymbolDef from '../symbol-def'
import TreeWalker from '../tree-walker'
import {
  reset_def,
  is_lhs,
  warn,
  make_node,
  is_undeclared_ref,
  MAP,
  defaults,
  next_mangled,
  list_overhead,
  to_moz_scope,
  display_body,
  redefined_catch_def,
  keep_name,
  base54,
  reset_variables, is_ast_prop_access, is_ast_defun, is_ast_directive, is_ast_scope, is_ast_labeled_statement, is_ast_symbol_catch, is_ast_var_def, is_ast_lambda, is_ast_label
} from '../utils'
import TreeTransformer from '../tree-transformer'
import { clear_flag, set_flag, CLEAR_BETWEEN_PASSES, MASK_EXPORT_DONT_MANGLE, TOP } from '../constants'
import { parse, RESERVED_WORDS } from '../parse'
import { MozillaAst } from '../types'

export let function_defs: Set<any> | null = null
export let printMangleOptions: any
export let unmangleable_names: Set<any> | null = null

export default class AST_Toplevel extends AST_Scope {
  variables: any
  globals: Map<any, any>
  mangled_names: Set<any>

  reduce_vars (tw: TreeWalker, descend: Function, compressor: Compressor) {
    this.globals.forEach(function (def: SymbolDef) {
      reset_def(compressor, def)
    })
    reset_variables(tw, compressor, this)
  }

  resolve_defines (this: AST_Toplevel, compressor: Compressor) {
    if (!compressor.option('global_defs')) return this
    this.figure_out_scope({ ie8: compressor.option('ie8') })
    return this.transform(new TreeTransformer(function (this: any, node: AST_Node) {
      const def = node._find_defs(compressor, '')
      if (!def) return
      let level = 0; let child = node; let parent
      while ((parent = this.parent(level++))) {
        if (!(is_ast_prop_access(parent))) break
        if (parent.expression !== child) break
        child = parent
      }
      if (is_lhs(child, parent)) {
        warn(compressor, node)
        return
      }
      return def
    }))
  }

  reset_opt_flags (compressor: Compressor) {
    const self = this
    const reduce_vars = compressor.option('reduce_vars')

    const preparation: TreeWalker = new TreeWalker(function (node: AST_Node, descend) {
      clear_flag(node, CLEAR_BETWEEN_PASSES)
      if (reduce_vars) {
        if (compressor.top_retain &&
                  is_ast_defun(node) && // Only functions are retained
                  preparation.parent() === self
        ) {
          set_flag(node, TOP)
        }
        return node.reduce_vars(preparation, descend, compressor)
      }
    })
    // Stack of look-up tables to keep track of whether a `SymbolDef` has been
    // properly assigned before use:
    // - `push()` & `pop()` when visiting conditional branches
    // preparation.safe_ids = Object.create(null)
    // preparation.in_loop = null
    // preparation.loop_ids = new Map()
    // preparation.defs_to_safe_ids = new Map()
    self.walk(preparation)
  }

  drop_console () {
    return this.transform(new TreeTransformer(function (self: AST_Toplevel) {
      if (self.TYPE == 'Call') {
        const exp = self.expression
        if (is_ast_prop_access(exp)) {
          let name = exp.expression
          while (name.expression) {
            name = name.expression
          }
          if (is_undeclared_ref(name) && name.name == 'console') {
            return make_node('AST_Undefined', self)
          }
        }
      }
    }))
  }

  def_global (node: AST_Node) {
    const globals = this.globals; const name = node.name
    if (globals.has(name)) {
      return globals.get(name)
    } else {
      const g = new SymbolDef(this, node)
      g.undeclared = true
      g.global = true
      globals.set(name, g)
      return g
    }
  }

  is_block_scope () { return false }
  next_mangled (options: any) {
    let name
    const mangled_names = this.mangled_names
    do {
      name = next_mangled(this, options)
    } while (mangled_names.has(name))
    return name
  }

  _default_mangler_options (options: any) {
    options = defaults(options, {
      eval: false,
      ie8: false,
      keep_classnames: false,
      keep_fnames: false,
      module: false,
      reserved: [],
      toplevel: false
    })
    if (options.module) options.toplevel = true
    let reserved: string[] | Set<string> | undefined = options.reserved
    if (!Array.isArray(options.reserved) &&
          !(options.reserved instanceof Set)
    ) {
      reserved = []
    }
    options.reserved = new Set(reserved)
    // Never mangle arguments
    options.reserved.add('arguments')
    return options
  }

  wrap_commonjs (name: string) {
    const body = this.body
    const _wrapped_tl = "(function(exports){'$ORIG';})(typeof " + name + "=='undefined'?(" + name + '={}):' + name + ');'
    let wrapped_tl = parse(_wrapped_tl)
    wrapped_tl = wrapped_tl.transform(new TreeTransformer(function (node: AST_Node) {
      if (is_ast_directive(node) && node.value == '$ORIG') {
        return MAP.splice(body)
      }
      return undefined
    }))
    return wrapped_tl
  }

  wrap_enclose (args_values: string) {
    if (typeof args_values !== 'string') args_values = ''
    let index = args_values.indexOf(':')
    if (index < 0) index = args_values.length
    const body = this.body
    return parse([
      '(function(',
      args_values.slice(0, index),
      '){"$ORIG"})(',
      args_values.slice(index + 1),
      ')'
    ].join('')).transform(new TreeTransformer(function (node: AST_Node) {
      if (is_ast_directive(node) && node.value == '$ORIG') {
        return MAP.splice(body)
      }
      return undefined
    }))
  }

  shallow_cmp_props: any = {}
  _size () {
    return list_overhead(this.body)
  }

  _to_mozilla_ast (parent: AST_Node): MozillaAst {
    return to_moz_scope('Program', this)
  }

  _codegen (output: OutputStream) {
    display_body(this.body as any[], true, output, true)
    output.print('')
  }

  add_source_map () { }
  compute_char_frequency (options: any) {
    printMangleOptions = this._default_mangler_options(options)
    try {
      base54.consider(this.print_to_string(), 1)
    } finally {
      printMangleOptions = undefined
    }
    base54.sort()
  }

  expand_names (options: any) {
    base54.reset()
    base54.sort()
    options = this._default_mangler_options(options)
    const avoid = this.find_colliding_names(options)
    let cname = 0
    this.globals.forEach(rename)
    this.walk(new TreeWalker(function (node: AST_Node) {
      if (is_ast_scope(node)) node.variables.forEach(rename)
      if (is_ast_symbol_catch(node)) rename(node.definition())
    }))

    function next_name () {
      let name
      do {
        name = base54(cname++)
      } while (avoid.has(name) || RESERVED_WORDS.has(name))
      return name
    }

    function rename (def: SymbolDef) {
      if (def.global && options.cache) return
      if (def.unmangleable(options)) return
      if (options.reserved?.has(def.name)) return
      const redefinition = redefined_catch_def(def)
      const name = def.name = redefinition ? redefinition.name : next_name()
      def.orig.forEach(function (sym: AST_Symbol) {
        sym.name = name
      })
      def.references.forEach(function (sym: AST_Symbol) {
        sym.name = name
      })
    }
  }

  find_colliding_names (options: any) {
    const cache = options.cache?.props
    const avoid = new Set()
      options.reserved?.forEach(to_avoid)
      this.globals.forEach(add_def)
      this.walk(new TreeWalker(function (node: AST_Node) {
        if (is_ast_scope(node)) node.variables.forEach(add_def)
        if (is_ast_symbol_catch(node)) add_def(node.definition())
      }))
      return avoid

      function to_avoid (name: string) {
        avoid.add(name)
      }

      function add_def (def: SymbolDef) {
        let name = def.name
        if (def.global && cache && cache.has(name)) name = cache.get(name) as string
        else if (!def.unmangleable(options)) return
        to_avoid(name)
      }
  }

  mangle_names (options: any) {
    options = this._default_mangler_options(options)

    // We only need to mangle declaration nodes.  Special logic wired
    // into the code generator will display the mangled name if it's
    // present (and for AST_SymbolRef-s it'll use the mangled name of
    // the AST_SymbolDeclaration that it points to).
    let lname = -1
    const to_mangle: any[] = []

    if (options.keep_fnames) {
      function_defs = new Set()
    }

    const mangled_names = this.mangled_names = new Set()
    if (options.cache) {
      this.globals.forEach(collect)
      if (options.cache.props) {
        options.cache.props.forEach(function (mangled_name: any) {
          mangled_names.add(mangled_name)
        })
      }
    }

    const tw = new TreeWalker(function (node: AST_Node, descend) {
      if (is_ast_labeled_statement(node)) {
        // lname is incremented when we get to the AST_Label
        const save_nesting = lname
        descend()
        lname = save_nesting
        return true // don't descend again in TreeWalker
      }
      if (is_ast_scope(node)) {
        node.variables.forEach(collect)
        return
      }
      if (node.is_block_scope()) {
              node.block_scope?.variables.forEach(collect)
              return
      }
      if (
        function_defs &&
              is_ast_var_def(node) &&
              is_ast_lambda(node.value) &&
              !node.value.name &&
              keep_name(options.keep_fnames, node.name.name)
      ) {
        function_defs.add((node.name as any).definition?.().id)
        return
      }
      if (is_ast_label(node)) {
        let name
        do {
          name = base54(++lname)
        } while (RESERVED_WORDS.has(name))
        node.mangled_name = name
        return true
      }
      if (!(options.ie8 || options.safari10) && is_ast_symbol_catch(node)) {
        to_mangle.push(node.definition())
      }
    })

    this.walk(tw)

    if (options.keep_fnames || options.keep_classnames) {
      unmangleable_names = new Set()
      // Collect a set of short names which are unmangleable,
      // for use in avoiding collisions in next_mangled.
      to_mangle.forEach((def: SymbolDef) => {
        if (def.name.length < 6 && def.unmangleable(options)) {
                  unmangleable_names?.add(def.name)
        }
      })
    }

    to_mangle.forEach((def: SymbolDef) => { def.mangle(options) })

    function_defs = null
    unmangleable_names = null

    function collect (symbol: any) {
      const should_mangle = !options.reserved?.has(symbol.name) &&
              !(symbol.export & MASK_EXPORT_DONT_MANGLE)
      if (should_mangle) {
        to_mangle.push(symbol)
      }
    }
  }

  static documentation = 'The toplevel scope'
  static propdoc = {
    globals: '[Map] a map of name -> SymbolDef for all undeclared names'
  }

  static PROPS = AST_Scope.PROPS.concat(['globals'])
  constructor (args: AST_Toplevel_Props) {
    super(args)
    this.globals = args.globals ?? new Map()
  }
}

export interface AST_Toplevel_Props extends AST_Scope_Props {
  globals?: Map<any, any> | undefined
}
