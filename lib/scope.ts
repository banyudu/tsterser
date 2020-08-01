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

"use strict";

import {
    defaults,
    keep_name,
    mergeSort,
    push_uniq,
    return_false,
    return_this,
    return_true,
} from "./utils/index";
import {
    AST_Arrow,
    AST_Block,
    AST_Class,
    AST_Conditional,
    AST_Defun,
    AST_Dot,
    AST_Function,
    AST_IterationStatement,
    AST_Label,
    AST_LabeledStatement,
    AST_Lambda,
    AST_Node,
    AST_Scope,
    AST_Sequence,
    AST_String,
    AST_Sub,
    AST_SwitchBranch,
    AST_Symbol,
    AST_SymbolCatch,
    AST_SymbolClass,
    AST_SymbolDefClass,
    AST_SymbolDefun,
    AST_SymbolFunarg,
    AST_SymbolLambda,
    AST_SymbolMethod,
    AST_Toplevel,
    AST_VarDef,
    TreeWalker,
} from "./ast";
import {
    RESERVED_WORDS,
} from "./parse";

const MASK_EXPORT_DONT_MANGLE = 1 << 0;

let function_defs: Set<any> | null = null;
let unmangleable_names: Set<any> | null = null;

class SymbolDef {
    name: any;
    orig: any[];
    init: any;
    eliminated: number;
    assignments: number;
    scope: any;
    replaced: number;
    global: boolean;
    export: number;
    mangled_name: any;
    undeclared: boolean;
    id: number;
    static next_id: any;
    chained: boolean;
    direct_access: boolean;
    escaped: number;
    recursive_refs: number;
    references: any[];
    should_replace: any;
    single_use: boolean;
    fixed: any;
    constructor(scope: any | null, orig: { name: string }, init?: boolean) {
        this.name = orig.name;
        this.orig = [ orig ];
        this.init = init;
        this.eliminated = 0;
        this.assignments = 0;
        this.scope = scope;
        this.replaced = 0;
        this.global = false;
        this.export = 0;
        this.mangled_name = null;
        this.undeclared = false;
        this.id = SymbolDef.next_id++;
        this.chained = false;
        this.direct_access = false;
        this.escaped = 0;
        this.recursive_refs = 0;
        this.references = [];
        this.should_replace = undefined;
        this.single_use = false;
        this.fixed = false;
        Object.seal(this);
    }
    fixed_value() {
        if (!this.fixed || this.fixed instanceof AST_Node) return this.fixed;
        return this.fixed();
    }
    unmangleable(options: any) {
        if (!options) options = {};

        if (
            function_defs &&
            function_defs.has(this.id) &&
            keep_name(options.keep_fnames, this.orig[0].name)
        ) return true;

        return this.global && !options.toplevel
            || (this.export & MASK_EXPORT_DONT_MANGLE)
            || this.undeclared
            || !options.eval && this.scope.pinned()
            || (this.orig[0] instanceof AST_SymbolLambda
                  || this.orig[0] instanceof AST_SymbolDefun) && keep_name(options.keep_fnames, this.orig[0].name)
            || this.orig[0] instanceof AST_SymbolMethod
            || (this.orig[0] instanceof AST_SymbolClass
                  || this.orig[0] instanceof AST_SymbolDefClass) && keep_name(options.keep_classnames, this.orig[0].name);
    }
    mangle(options: any) {
        const cache = options.cache && options.cache.props;
        if (this.global && cache && cache.has(this.name)) {
            this.mangled_name = cache.get(this.name);
        } else if (!this.mangled_name && !this.unmangleable(options)) {
            var s = this.scope;
            var sym = this.orig[0];
            if (options.ie8 && sym instanceof AST_SymbolLambda)
                s = s.parent_scope;
            const redefinition = redefined_catch_def(this);
            this.mangled_name = redefinition
                ? redefinition.mangled_name || redefinition.name
                : s.next_mangled(options, this);
            if (this.global && cache) {
                cache.set(this.name, this.mangled_name);
            }
        }
    }
}

SymbolDef.next_id = 1;

function redefined_catch_def(def: any) {
    if (def.orig[0] instanceof AST_SymbolCatch
        && def.scope.is_block_scope()
    ) {
        return def.scope.get_defun_scope().variables.get(def.name);
    }
}

AST_Toplevel.DEFMETHOD("def_global", function(node: any) {
    var globals = this.globals, name = node.name;
    if (globals.has(name)) {
        return globals.get(name);
    } else {
        var g = new SymbolDef(this, node);
        g.undeclared = true;
        g.global = true;
        globals.set(name, g);
        return g;
    }
});

AST_Scope.DEFMETHOD("init_scope_vars", function(parent_scope: any) {
    this.variables = new Map();         // map name to AST_SymbolVar (variables defined in this scope; includes functions)
    this.functions = new Map();         // map name to AST_SymbolDefun (functions defined in this scope)
    this.uses_with = false;             // will be set to true if this or some nested scope uses the `with` statement
    this.uses_eval = false;             // will be set to true if this or nested scope uses the global `eval`
    this.parent_scope = parent_scope;   // the parent scope
    this.enclosed = [];                 // a list of variables from this or outer scope(s) that are referenced from this or inner scopes
    this.cname = -1;                    // the current index for mangling functions/variables
    this._var_name_cache = null;
});

AST_Scope.DEFMETHOD("var_names", function varNames(this: any): Set<string> | null {
    var var_names = this._var_name_cache;
    if (!var_names) {
        this._var_name_cache = var_names = new Set(
            this.parent_scope ? varNames.call(this.parent_scope) : null
        );
        if (this._added_var_names) {
            this._added_var_names.forEach(name => { var_names?.add(name); });
        }
        this.enclosed.forEach(function(def: any) {
            var_names?.add(def.name);
        });
        this.variables.forEach(function(_, name: string) {
            var_names?.add(name);
        });
    }
    return var_names;
});

AST_Scope.DEFMETHOD("add_var_name", function (name: string) {
    // TODO change enclosed too
    if (!this._added_var_names) {
        // TODO stop adding var names entirely
        this._added_var_names = new Set();
    }
    this._added_var_names.add(name);
    if (!this._var_name_cache) this.var_names();  // regen cache
    this._var_name_cache.add(name);
});

// TODO create function that asks if we can inline

AST_Scope.DEFMETHOD("add_child_scope", function (scope: any) {
    // `scope` is going to be moved into wherever the compressor is
    // right now. Update the required scopes' information

    if (scope.parent_scope === this) return;

    scope.parent_scope = this;
    scope._var_name_cache = null;
    if (scope._added_var_names) {
        scope._added_var_names.forEach(name => scope.add_var_name(name));
    }

    // TODO uses_with, uses_eval, etc

    const new_scope_enclosed_set = new Set(scope.enclosed);
    const scope_ancestry = (() => {
        const ancestry: any[] = [];
        let cur = this;
        do {
            ancestry.push(cur);
        } while ((cur = cur.parent_scope));
        ancestry.reverse();
        return ancestry;
    })();

    const to_enclose: any[] = [];
    for (const scope_topdown of scope_ancestry) {
        to_enclose.forEach(e => push_uniq(scope_topdown.enclosed, e));
        for (const def of scope_topdown.variables.values()) {
            if (new_scope_enclosed_set.has(def)) {
                push_uniq(to_enclose, def);
                push_uniq(scope_topdown.enclosed, def);
            }
        }
    }
});

AST_Node.DEFMETHOD("is_block_scope", return_false);
AST_Class.DEFMETHOD("is_block_scope", return_false);
AST_Lambda.DEFMETHOD("is_block_scope", return_false);
AST_Toplevel.DEFMETHOD("is_block_scope", return_false);
AST_SwitchBranch.DEFMETHOD("is_block_scope", return_false);
AST_Block.DEFMETHOD("is_block_scope", return_true);
AST_Scope.DEFMETHOD("is_block_scope", function () {
    return this._block_scope || false;
});
AST_IterationStatement.DEFMETHOD("is_block_scope", return_true);

AST_Lambda.DEFMETHOD("init_scope_vars", function() {
    AST_Scope.prototype.init_scope_vars?.apply(this, arguments);
    this.uses_arguments = false;
    this.def_variable(new AST_SymbolFunarg({
        name: "arguments",
        start: this.start,
        end: this.end
    }));
});

AST_Arrow.DEFMETHOD("init_scope_vars", function() {
    AST_Scope.prototype.init_scope_vars?.apply(this, arguments);
    this.uses_arguments = false;
});

AST_Symbol.DEFMETHOD("mark_enclosed", function() {
    var def = this.definition();
    var s = this.scope;
    while (s) {
        push_uniq(s.enclosed, def);
        if (s === def.scope) break;
        s = s.parent_scope;
    }
});

AST_Symbol.DEFMETHOD("reference", function() {
    this.definition().references.push(this);
    this.mark_enclosed();
});

AST_Scope.DEFMETHOD("find_variable", function(name: any | string) {
    if (name instanceof AST_Symbol) name = name.name;
    return this.variables.get(name)
        || (this.parent_scope && this.parent_scope.find_variable(name));
});

AST_Scope.DEFMETHOD("def_function", function(this: any, symbol: any, init: boolean) {
    var def = this.def_variable(symbol, init);
    if (!def.init || def.init instanceof AST_Defun) def.init = init;
    this.functions.set(symbol.name, def);
    return def;
});

AST_Scope.DEFMETHOD("def_variable", function(symbol: any, init: boolean) {
    var def = this.variables.get(symbol.name);
    if (def) {
        def.orig.push(symbol);
        if (def.init && (def.scope !== symbol.scope || def.init instanceof AST_Function)) {
            def.init = init;
        }
    } else {
        def = new SymbolDef(this, symbol, init);
        this.variables.set(symbol.name, def);
        def.global = !this.parent_scope;
    }
    return symbol.thedef = def;
});

function next_mangled(scope: any, options: any) {
    var ext = scope.enclosed;
    out: while (true) {
        var m = base54(++scope.cname);
        if (RESERVED_WORDS.has(m)) continue; // skip over "do"

        // https://github.com/mishoo/UglifyJS2/issues/242 -- do not
        // shadow a name reserved from mangling.
        if (options.reserved?.has(m)) continue;

        // Functions with short names might collide with base54 output
        // and therefore cause collisions when keep_fnames is true.
        if (unmangleable_names && unmangleable_names.has(m)) continue out;

        // we must ensure that the mangled name does not shadow a name
        // from some parent scope that is referenced in this or in
        // inner scopes.
        for (let i = ext.length; --i >= 0;) {
            const def = ext[i];
            const name = def.mangled_name || (def.unmangleable(options) && def.name);
            if (m == name) continue out;
        }
        return m;
    }
}

AST_Scope.DEFMETHOD("next_mangled", function(options: any) {
    return next_mangled(this, options);
});

AST_Toplevel.DEFMETHOD("next_mangled", function(options: any) {
    let name;
    const mangled_names = this.mangled_names;
    do {
        name = next_mangled(this, options);
    } while (mangled_names.has(name));
    return name;
});

AST_Function.DEFMETHOD("next_mangled", function(options: any, def: any) {
    // #179, #326
    // in Safari strict mode, something like (function x(x){...}) is a syntax error;
    // a function expression's argument cannot shadow the function expression's name

    var tricky_def = def.orig[0] instanceof AST_SymbolFunarg && this.name && this.name.definition();

    // the function's mangled_name is null when keep_fnames is true
    var tricky_name = tricky_def ? tricky_def.mangled_name || tricky_def.name : null;

    while (true) {
        var name = next_mangled(this, options);
        if (!tricky_name || tricky_name != name)
            return name;
    }
});

AST_Symbol.DEFMETHOD("unmangleable", function(options: any) {
    var def = this.definition();
    return !def || def.unmangleable(options);
});

// labels are always mangleable
AST_Label.DEFMETHOD("unmangleable", return_false);

AST_Symbol.DEFMETHOD("unreferenced", function() {
    return !this.definition().references.length && !this.scope.pinned();
});

AST_Symbol.DEFMETHOD("definition", function() {
    return this.thedef;
});

AST_Symbol.DEFMETHOD("global", function() {
    return this.thedef.global;
});

AST_Toplevel.DEFMETHOD("_default_mangler_options", function(options: any) {
    options = defaults(options, {
        eval        : false,
        ie8         : false,
        keep_classnames: false,
        keep_fnames : false,
        module      : false,
        reserved    : [],
        toplevel    : false,
    });
    if (options.module) options.toplevel = true;
    let reserved: string[] | Set<string> | undefined = options.reserved;
    if (!Array.isArray(options.reserved)
        && !(options.reserved instanceof Set)
    ) {
        reserved = [];
    }
    options.reserved = new Set(reserved);
    // Never mangle arguments
    options.reserved.add("arguments");
    return options;
});

AST_Toplevel.DEFMETHOD("mangle_names", function(options: any) {
    options = this._default_mangler_options(options);

    // We only need to mangle declaration nodes.  Special logic wired
    // into the code generator will display the mangled name if it's
    // present (and for AST_SymbolRef-s it'll use the mangled name of
    // the AST_SymbolDeclaration that it points to).
    var lname = -1;
    var to_mangle: any[] = [];

    if (options.keep_fnames) {
        function_defs = new Set();
    }

    const mangled_names = this.mangled_names = new Set();
    if (options.cache) {
        this.globals.forEach(collect);
        if (options.cache.props) {
            options.cache.props.forEach(function(mangled_name) {
                mangled_names.add(mangled_name);
            });
        }
    }

    var tw = new TreeWalker(function(node: any, descend) {
        if (node instanceof AST_LabeledStatement) {
            // lname is incremented when we get to the AST_Label
            var save_nesting = lname;
            descend();
            lname = save_nesting;
            return true;        // don't descend again in TreeWalker
        }
        if (node instanceof AST_Scope) {
            node.variables.forEach(collect);
            return;
        }
        if (node.is_block_scope()) {
            node.block_scope?.variables.forEach(collect);
            return;
        }
        if (
            function_defs
            && node instanceof AST_VarDef
            && node.value instanceof AST_Lambda
            && !node.value.name
            && keep_name(options.keep_fnames, node.name.name)
        ) {
            function_defs.add(node.name.definition?.().id);
            return;
        }
        if (node instanceof AST_Label) {
            let name;
            do {
                name = base54(++lname);
            } while (RESERVED_WORDS.has(name));
            node.mangled_name = name;
            return true;
        }
        if (!(options.ie8 || options.safari10) && node instanceof AST_SymbolCatch) {
            to_mangle.push(node.definition());
            return;
        }
    });

    this.walk(tw);

    if (options.keep_fnames || options.keep_classnames) {
        unmangleable_names = new Set();
        // Collect a set of short names which are unmangleable,
        // for use in avoiding collisions in next_mangled.
        to_mangle.forEach(def => {
            if (def.name.length < 6 && def.unmangleable(options)) {
                unmangleable_names?.add(def.name);
            }
        });
    }

    to_mangle.forEach(def => { def.mangle(options); });

    function_defs = null;
    unmangleable_names = null;

    function collect(symbol: any) {
        const should_mangle = !options.reserved?.has(symbol.name)
            && !(symbol.export & MASK_EXPORT_DONT_MANGLE);
        if (should_mangle) {
            to_mangle.push(symbol);
        }
    }
});

AST_Toplevel.DEFMETHOD("find_colliding_names", function(options: any) {
    const cache = options.cache && options.cache.props;
    const avoid = new Set();
    options.reserved?.forEach(to_avoid);
    this.globals.forEach(add_def);
    this.walk(new TreeWalker(function(node: any) {
        if (node instanceof AST_Scope) node.variables.forEach(add_def);
        if (node instanceof AST_SymbolCatch) add_def(node.definition());
    }));
    return avoid;

    function to_avoid(name: string) {
        avoid.add(name);
    }

    function add_def(def: any) {
        var name = def.name;
        if (def.global && cache && cache.has(name)) name = cache.get(name) as string;
        else if (!def.unmangleable(options)) return;
        to_avoid(name);
    }
});

AST_Toplevel.DEFMETHOD("expand_names", function(options: any) {
    base54.reset();
    base54.sort();
    options = this._default_mangler_options(options);
    var avoid = this.find_colliding_names(options);
    var cname = 0;
    this.globals.forEach(rename);
    this.walk(new TreeWalker(function(node: any) {
        if (node instanceof AST_Scope) node.variables.forEach(rename);
        if (node instanceof AST_SymbolCatch) rename(node.definition());
    }));

    function next_name() {
        var name;
        do {
            name = base54(cname++);
        } while (avoid.has(name) || RESERVED_WORDS.has(name));
        return name;
    }

    function rename(def: any) {
        if (def.global && options.cache) return;
        if (def.unmangleable(options)) return;
        if (options.reserved?.has(def.name)) return;
        const redefinition = redefined_catch_def(def);
        const name = def.name = redefinition ? redefinition.name : next_name();
        def.orig.forEach(function(sym) {
            sym.name = name;
        });
        def.references.forEach(function(sym) {
            sym.name = name;
        });
    }
});

AST_Node.DEFMETHOD("tail_node", return_this);
AST_Sequence.DEFMETHOD("tail_node", function() {
    return this.expressions[this.expressions.length - 1];
});

AST_Toplevel.DEFMETHOD("compute_char_frequency", function(options: any) {
    options = this._default_mangler_options(options);
    try {
        AST_Node.prototype.print = function(this: any, stream: any, force_parens: boolean) {
            this._print(stream, force_parens);
            if (this instanceof AST_Symbol && !this.unmangleable(options)) {
                base54.consider(this.name, -1);
            } else if (options.properties) {
                if (this instanceof AST_Dot) {
                    base54.consider(this.property as string, -1);
                } else if (this instanceof AST_Sub) {
                    skip_string(this.property as any);
                }
            }
        };
        base54.consider(this.print_to_string(), 1);
    } finally {
        AST_Node.prototype.print = AST_Node.prototype._print;
    }
    base54.sort();

    function skip_string(node: any) {
        if (node instanceof AST_String) {
            base54.consider(node.value, -1);
        } else if (node instanceof AST_Conditional) {
            skip_string(node.consequent);
            skip_string(node.alternative);
        } else if (node instanceof AST_Sequence) {
            skip_string(node.tail_node?.());
        }
    }
});

const base54 = (() => {
    const leading = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_".split("");
    const digits = "0123456789".split("");
    let chars: string[];
    let frequency: Map<string, number>;
    function reset() {
        frequency = new Map();
        leading.forEach(function(ch) {
            frequency.set(ch, 0);
        });
        digits.forEach(function(ch) {
            frequency.set(ch, 0);
        });
    }
    base54.consider = function(str: string, delta: number) {
        for (var i = str.length; --i >= 0;) {
            frequency.set(str[i], (frequency.get(str[i]) as number) + delta); // TODO: check type
        }
    };
    function compare(a: string, b: string) {
        return (frequency.get(b) as number) - (frequency.get(a) as number);
    }
    base54.sort = function() {
        chars = mergeSort(leading, compare).concat(mergeSort(digits, compare));
    };
    base54.reset = reset;
    reset();
    function base54(num: number) {
        var ret = "", base = 54;
        num++;
        do {
            num--;
            ret += chars[num % base];
            num = Math.floor(num / base);
            base = 64;
        } while (num > 0);
        return ret;
    }
    return base54;
})();

export {
    base54,
    SymbolDef,
};
